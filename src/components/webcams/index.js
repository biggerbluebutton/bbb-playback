import React, { useEffect, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import videojs from 'video.js/core.es.js';
import { player as config } from 'config';
import { EVENTS, ID } from 'utils/constants';
import { buildFileURL } from 'utils/data';
import logger from 'utils/logger';
import { getFrequency, getTime } from 'utils/params';
import storage from 'utils/data/storage';
import player from 'utils/player';
import layout from 'utils/layout';
import { parseCaptionsData, setupLazyCaptions } from 'utils/captions';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.webcams.wrapper.aria',
    description: 'Aria label for the webcams wrapper',
  },
});

const buildSources = () => {
  if (storage.fallback) {
    return [{ src: buildFileURL('audio/audio.webm'), type: 'audio/webm' }];
  }
  return [
    { src: buildFileURL('video/webcams.mp4'),  type: 'video/mp4'  },
    { src: buildFileURL('video/webcams.webm'), type: 'video/webm' },
  ].filter(source => storage.media.find(m => source.type.includes(m)));
};

const buildOptions = (sources) => ({
  autoplay: true,
  controlBar: {
    fullscreenToggle: false,
    pictureInPictureToggle: false,
    volumePanel: { inline: false, vertical: true },
  },
  controls: true,
  fill: true,
  inactivityTimeout: 0,
  playbackRates: config.rates,
  sources: sources.current,
  // Important: use native text tracks so the browser fires the standard events
  html5: {
    nativeTextTracks: true,
  },
});

const dispatchTimeUpdate = (time) => {
  const event = new CustomEvent(EVENTS.TIME_UPDATE, { detail: { time }});
  document.dispatchEvent(event);
};

const Webcams = () => {
  const intl = useIntl();

  const {
    locales: captionLocales,
    defaultLocale: captionsDefaultLocale,
  } = parseCaptionsData(storage.captions);

  const sources               = useRef(buildSources());
  const tracks                = useRef(captionLocales); // [{ locale, localeName }]
  const defaultCaptionLocale  = useRef(captionsDefaultLocale);
  const element               = useRef();
  const interval              = useRef();
  const captionsCleanup       = useRef(() => {});

  const handleCaptionsInWebcams = !layout.screenshare;

  useEffect(() => {
    if (player.webcams) return;

    const video = element.current;
    if (!video) return;

    player.webcams = videojs(video, buildOptions(sources), () => {
      player.webcams.play();

      player.webcams.on('play', () => {
        const frequency = getFrequency();
        interval.current = setInterval(() => {
          dispatchTimeUpdate(player.webcams.currentTime());
        }, 1000 / (frequency || config.rps));
      });

      player.webcams.on('pause', () => {
        clearInterval(interval.current);
      });

      player.webcams.on('seeked', () => {
        dispatchTimeUpdate(player.webcams.currentTime());
      });

      const time = getTime();
      if (time) {
        player.webcams.on('loadedmetadata', () => {
          const duration = player.webcams.duration();
          if (time < duration) player.webcams.currentTime(time);
        });
      }

      if (handleCaptionsInWebcams) {
        captionsCleanup.current = setupLazyCaptions({
          playerInstance: player.webcams,
          videoElement: video,
          tracks: tracks.current,
          defaultLocale: defaultCaptionLocale.current,
        });
      }
    });

    logger.debug(ID.WEBCAMS, 'mounted');

    return () => {
      if (player.webcams) {
        if (captionsCleanup.current) {
          captionsCleanup.current();
          captionsCleanup.current = () => {};
        }
        clearInterval(interval.current);
        player.webcams.dispose();
        player.webcams = null;
      }
      logger.debug(ID.WEBCAMS, 'unmounted');
    };
  }, []);

  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      className="webcams-wrapper"
      id={ID.WEBCAMS}
    >
      <div data-vjs-player>
        <video
          className="video-js"
          playsInline
          preload="auto"
          // Set this when VTT or media may be on a different origin
          crossOrigin="anonymous"
          ref={element}
        />
      </div>
    </div>
  );
};

// Avoid re-render
const areEqual = () => true;

export default React.memo(Webcams, areEqual);
