import React, { useEffect, useRef } from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import videojs from 'video.js/core.es.js';
import { player as config } from 'config';
import {
  EVENTS,
  ID,
} from 'utils/constants';
import { buildFileURL } from 'utils/data';
import logger from 'utils/logger';
import {
  getFrequency,
  getTime,
} from 'utils/params';
import storage from 'utils/data/storage';
import player from 'utils/player';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.webcams.wrapper.aria',
    description: 'Aria label for the webcams wrapper',
  },
});

const buildSources = () => {
  if (storage.fallback) {
    return [
      {
        src: buildFileURL('audio/audio.webm'),
        type: 'audio/webm',
      },
    ];
  }

  return [
    {
      src: buildFileURL('video/webcams.mp4'),
      type: 'video/mp4',
    }, {
      src: buildFileURL('video/webcams.webm'),
      type: 'video/webm',
    },
  ].filter(source => storage.media.find(m => source.type.includes(m)));
};

const buildOptions = (sources) => {
  return {
    autoplay: true,
    controlBar: {
      fullscreenToggle: false,
      pictureInPictureToggle: false,
      volumePanel: {
        inline: false,
        vertical: true,
      },
    },
    controls: true,
    fill: true,
    inactivityTimeout: 0,
    playbackRates: config.rates,
    sources: sources.current,
  };
};

const dispatchTimeUpdate = (time) => {
  const event = new CustomEvent(EVENTS.TIME_UPDATE, { detail: { time }});
  document.dispatchEvent(event);
};

const Webcams = () => {
  const intl = useIntl();
  const sources = useRef(buildSources());
  const tracks = useRef(storage.captions);
  const element = useRef();
  const interval = useRef();
  const textTracks = useRef();
  const trackHandler = useRef();

  useEffect(() => {
    if (!player.webcams) {
      const video = element.current;
      if (!video) return;

      // Append track elements without eager sources
      tracks.current.forEach(lang => {
        const {
          locale,
          localeName,
        } = lang;
        const track = document.createElement('track');
        track.kind = 'captions';
        track.label = localeName;
        track.srclang = locale;
        track.setAttribute('data-vtt-src', buildFileURL(`caption_${locale}.vtt`));
        video.appendChild(track);
      });

      player.webcams = videojs(video, buildOptions(sources), () => {
        player.webcams.play();

        player.webcams.on('play', () => {
          const frequency = getFrequency();
          interval.current = setInterval(() => {
            const currentTime = player.webcams.currentTime();
            dispatchTimeUpdate(currentTime);
          }, 1000 / (frequency ? frequency : config.rps));
        });

        player.webcams.on('pause', () => clearInterval(interval.current));

        player.webcams.on('seeked', () => {
          const currentTime = player.webcams.currentTime();
          dispatchTimeUpdate(currentTime);
        });

        // Set initial time if provided
        const time = getTime();
        if (time) {
          player.webcams.on('loadedmetadata', () => {
            const duration = player.webcams.duration();
            if (time < duration) {
              player.webcams.currentTime(time);
            }
          });
        }

        // Lazy load captions when selected
        textTracks.current = player.webcams.textTracks();
        trackHandler.current = () => {
          for (let i = 0; i < textTracks.current.length; i += 1) {
            const track = textTracks.current[i];
            if (track.mode === 'showing') {
              const trackEl = player.webcams.el().querySelector(`track[srclang="${track.language}"]`);
              if (trackEl && !trackEl.dataset.loaded) {
                player.webcams.addClass('vjs-waiting');
                const onLoad = () => {
                  trackEl.dataset.loaded = 'true';
                  player.webcams.removeClass('vjs-waiting');
                };
                trackEl.addEventListener('load', onLoad, { once: true });
                trackEl.addEventListener('error', onLoad, { once: true });
                trackEl.setAttribute('src', trackEl.dataset.vttSrc);
              }
            }
          }
        };

        textTracks.current.addEventListener('change', trackHandler.current);
      });
      logger.debug(ID.WEBCAMS, 'mounted');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (player.webcams) {
        if (textTracks.current && trackHandler.current) {
          textTracks.current.removeEventListener('change', trackHandler.current);
        }
        player.webcams.dispose();
        player.webcams = null;
        logger.debug(ID.WEBCAMS, 'unmounted');
      }
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
          ref={element}
        />
      </div>
    </div>
  );
};

// Avoid re-render
const areEqual = () => true;

export default React.memo(Webcams, areEqual);
