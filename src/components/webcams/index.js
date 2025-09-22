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

const buildOptions = () => ({
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
  html5: { nativeTextTracks: false }, // rely on Video.js overlay for captions positioning
});

const dispatchTimeUpdate = (time) => {
  const event = new CustomEvent(EVENTS.TIME_UPDATE, { detail: { time }});
  document.dispatchEvent(event);
};

const Webcams = () => {
  const intl = useIntl();

  const sources        = useRef(buildSources());
  const tracks         = useRef(storage.captions || []); // [{ localeName, locale, default }]
  const element        = useRef(null);
  const interval       = useRef(null);
  const textTracks     = useRef(null);
  const trackHandler   = useRef(null);
  const trackElsByLang = useRef({}); // keyed by srclang

  useEffect(() => {
    if (player.webcams) return;

    const video = element.current;
    if (!video) return;

    // Clean any legacy track nodes
    video.querySelectorAll('track').forEach(t => t.remove());
    trackElsByLang.current = {};

    // Create <track> nodes WITHOUT src; stash the real URL in data attribute
    tracks.current.forEach(({ locale, localeName, default: isDefault }) => {
      const lang = (locale || '').replace(/_/g, '-').toLowerCase(); // e.g., "en", "en-us"
      const el = document.createElement('track');
      el.kind    = 'captions';
      el.label   = localeName;
      el.srclang = lang;
      if (isDefault) el.default = true; // mark default (semantic)
      el.setAttribute('data-vtt-src', buildFileURL(`caption_${locale}.vtt`));
      trackElsByLang.current[lang] = el;
      video.appendChild(el);
    });

    // Helper: robustly force a reload when we assign src the first time
    const loadVttSrc = (trackEl, mode = 'showing') => {
      if (!trackEl) return;

      const realSrc = trackEl.dataset.vttSrc;
      if (!realSrc) return;

      const setMode = () => {
        const nativeTrack = trackEl.track; // HTMLTrackElement.track (TextTrack)
        if (nativeTrack) nativeTrack.mode = mode; // 'showing' or 'hidden'
      };

      // If already loaded, just ensure mode
      if (trackEl.dataset.loaded === 'true') { setMode(); return; }

      // UX hint while we fetch
      player.webcams?.addClass?.('vjs-waiting');

      const onFinish = () => {
        trackEl.dataset.loaded = 'true';
        player.webcams?.removeClass?.('vjs-waiting');
        setMode();
        trackEl.removeEventListener('load', onFinish);
        trackEl.removeEventListener('error', onFinish);
      };

      trackEl.addEventListener('load', onFinish, { once: true });
      trackEl.addEventListener('error', onFinish, { once: true });

      // Force a reliable src-change load
      trackEl.setAttribute('src', '');
      (window.requestAnimationFrame || setTimeout)(() => {
        trackEl.setAttribute('src', realSrc);
      }, 0);
    };

    player.webcams = videojs(video, buildOptions(), () => {
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

      // Disable all initially to prevent any auto show
      for (let i = 0; i < textTracks.current.length; i++) {
        const tt = textTracks.current[i];
        if (tt && (tt.kind === 'captions' || tt.kind === 'subtitles')) tt.mode = 'disabled';
      }

      // When user selects a track, ensure its VTT is loaded & showing
      trackHandler.current = () => {
        const tts = textTracks.current;
        if (!tts) return;

        for (let i = 0; i < tts.length; i++) {
          const tt = tts[i];
          if (!(tt && (tt.kind === 'captions' || tt.kind === 'subtitles'))) continue;

          if (tt.mode === 'showing') {
            const lang = (tt.language || '').toLowerCase();
            const trackEl =
              element.current.querySelector(`track[srclang="${lang}"]`) ||
              trackElsByLang.current[lang];
            loadVttSrc(trackEl, 'showing');
          }
        }
      };

      // Cover both native and Video.js events
      textTracks.current.addEventListener('change', trackHandler.current);
      player.webcams.on('texttrackchange', trackHandler.current);

      // --- FORCE-SELECT & LOAD DEFAULT LOCALE ---
      const activatePreferred = () => {
        // 1) backend default (from getLocales), else UI/browser locale, else first track
        const serverDefault = (tracks.current.find(t => t.default)?.locale || '')
          .replace(/_/g, '-')
          .toLowerCase();
        const fallbackLocale = (storage?.locale || navigator.language || 'en')
          .replace(/_/g, '-')
          .toLowerCase();
        const preferredLang = (serverDefault || fallbackLocale)
          .split('-')[0];

        // Find the <track> element
        let el =
          element.current.querySelector(`track[srclang="${preferredLang}"]`)
          || element.current.querySelector(`track[srclang^="${preferredLang}-"]`); // en-us, fr-ca, etc.

        // Fallback: first available track
        if (!el) el = element.current.querySelector('track');

        if (!el) return;

        // Load VTT and show captions for the preferred/default track
        loadVttSrc(el, 'showing');

        // Also set the corresponding TextTrack mode to 'showing' (belt & suspenders)
        const tts = textTracks.current;
        if (tts) {
          const want = el.getAttribute('srclang');
          for (let i = 0; i < tts.length; i++) {
            const tt = tts[i];
            if (!(tt && (tt.kind === 'captions' || tt.kind === 'subtitles'))) continue;
            const lang = (tt.language || '').toLowerCase();
            if (lang === want || lang.startsWith(preferredLang)) {
              tt.mode = 'showing';
              break;
            }
          }
        }
      };

      // Call once now, and again shortly in case tracks register a bit later
      activatePreferred();
      setTimeout(activatePreferred, 100);  // catch async TextTrack registration
      setTimeout(activatePreferred, 400);  // final nudge on slower browsers
      // --- end FORCE-SELECT ---
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
          preload="auto"       // was "none" – use "auto" for fastest start
          autoPlay             // React prop (camelCase)
          muted                // crucial for autoplay
          crossOrigin="anonymous"
          ref={element}
        >
          {sources.current.map(({ src, type }) => (
            <source key={src} src={src} type={type} />
          ))}
        </video>
      </div>
    </div>
  );
};

// Avoid re-render
const areEqual = () => true;

export default React.memo(Webcams, areEqual);
