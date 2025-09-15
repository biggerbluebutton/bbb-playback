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

  const sources      = useRef(buildSources());
  const tracks       = useRef(storage.captions || []); // [{ locale, localeName }]
  const element      = useRef();
  const interval     = useRef();
  const textTracks   = useRef();
  const trackHandler = useRef();
  const trackElsByLabel = useRef({});

  useEffect(() => {
    if (player.webcams) return;

    const video = element.current;
    if (!video) return;

    // Clean any legacy track nodes
    video.querySelectorAll('track').forEach(t => t.remove());
    trackElsByLabel.current = {};

    // Create <track> nodes WITHOUT src; stash the real URL in data attribute
    tracks.current.forEach(({ locale, localeName }) => {
      const el = document.createElement('track');
      el.kind    = 'captions';
      el.label   = localeName;
      el.srclang = (locale || '').replace(/_/g, '-').toLowerCase();
      // Do NOT set el.src now; we will attach it on selection
      el.setAttribute('data-vtt-src', buildFileURL(`caption_${locale}.vtt`));
      trackElsByLabel.current[String(localeName || '').toLowerCase()] = el;
      video.appendChild(el);
    });

    // Helper: robustly force a reload when we assign src the first time
    const loadVttSrc = (trackEl) => {
      if (!trackEl) return;
      if (trackEl.dataset.loaded === 'true') return;

      const realSrc = trackEl.dataset.vttSrc;
      if (!realSrc) return;

      // UX hint while we fetch
      player.webcams?.addClass?.('vjs-waiting');

      const onFinish = () => {
        trackEl.dataset.loaded = 'true';
        player.webcams?.removeClass?.('vjs-waiting');
        trackEl.removeEventListener('load', onFinish);
        trackEl.removeEventListener('error', onFinish);
      };

      trackEl.addEventListener('load', onFinish, { once: true });
      trackEl.addEventListener('error', onFinish, { once: true });

      // Some browsers ignore a single src mutation; clear first then set next tick
      trackEl.setAttribute('src', '');
      (window.requestAnimationFrame || setTimeout)(() => {
        trackEl.setAttribute('src', realSrc);

        // Ensure the native TextTrack becomes active after setting src
        const nativeTrack = trackEl.track; // HTMLTrackElement.track (TextTrack)
        if (nativeTrack) {
          nativeTrack.mode = 'disabled';
          (window.requestAnimationFrame || setTimeout)(() => {
            nativeTrack.mode = 'showing';
          }, 0);
        }
      }, 0);
    };

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

      // captions lazy-load
      textTracks.current = player.webcams.textTracks();

      // Disable all initially (prevent auto show/load)
      for (let i = 0; i < textTracks.current.length; i += 1) {
        const tt = textTracks.current[i];
        if (tt && (tt.kind === 'captions' || tt.kind === 'subtitles')) {
          tt.mode = 'disabled';
        }
      }

      // On caption selection, attach real src if needed and force it to load
      trackHandler.current = () => {
        const tts = textTracks.current;
        if (!tts) return;

        for (let i = 0; i < tts.length; i += 1) {
          const tt = tts[i];
          if (!(tt && (tt.kind === 'captions' || tt.kind === 'subtitles'))) continue;

          if (tt.mode === 'showing') {
            const labelLower = String(tt.label || '').toLowerCase();
            const trackEl =
              trackElsByLabel.current[labelLower] ||
              element.current.querySelector(
                `track[srclang="${(tt.language || '').toLowerCase()}"]`
              );

            loadVttSrc(trackEl);
          }
        }
      };

      // Cover both native and Video.js events
      textTracks.current.addEventListener('change', trackHandler.current);
      player.webcams.on('texttrackchange', trackHandler.current);

      // Optional: auto-select a default caption (match UI locale)
      const preferred = (storage?.locale || navigator.language || '').split('-')[0];
      if (preferred) {
        const tts = textTracks.current;
        for (let i = 0; i < tts.length; i += 1) {
          const tt = tts[i];
          if ((tt.language || '').toLowerCase().startsWith(preferred.toLowerCase())) {
            tt.mode = 'showing'; // triggers handler → loads real VTT
            break;
          }
        }
      }
    });

    logger.debug(ID.WEBCAMS, 'mounted');

    return () => {
      if (player.webcams) {
        if (textTracks.current && trackHandler.current) {
          textTracks.current.removeEventListener('change', trackHandler.current);
          player.webcams?.off?.('texttrackchange', trackHandler.current);
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
