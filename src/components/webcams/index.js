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

const CAPTION_TRACK_KINDS = ['captions', 'subtitles'];

const normalizeLocale = (locale) => {
  if (!locale) return '';

  return String(locale).replace(/_/g, '-').toLowerCase();
};

const getLocaleString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return (
      value.locale ||
      value.language ||
      value.lang ||
      value.code ||
      ''
    );
  }

  return '';
};

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);

  return [];
};

const findDefaultLocale = (locales = []) => {
  if (!Array.isArray(locales)) return '';

  const defaultEntry = locales.find(item => {
    if (!item || typeof item !== 'object') return false;

    return (
      item.default === true ||
      item.isDefault === true ||
      item.defaultLocale === true ||
      item.default_locale === true
    );
  });

  if (!defaultEntry) return '';

  return (
    getLocaleString(defaultEntry.defaultLocale) ||
    getLocaleString(defaultEntry.default_locale) ||
    getLocaleString(defaultEntry)
  );
};

const parseCaptionsData = (captionsData) => {
  if (!captionsData) {
    return { locales: [], defaultLocale: '' };
  }

  if (Array.isArray(captionsData)) {
    return {
      locales: captionsData,
      defaultLocale: findDefaultLocale(captionsData),
    };
  }

  if (typeof captionsData === 'object') {
    const localesSource =
      captionsData.locales ??
      captionsData.captions ??
      captionsData.locale ??
      captionsData.tracks ??
      captionsData.languages ??
      null;

    const locales = toArray(localesSource);

    let defaultLocale =
      getLocaleString(captionsData.defaultLocale) ||
      getLocaleString(captionsData.default_locale) ||
      getLocaleString(captionsData.default);

    if (!defaultLocale) {
      defaultLocale = findDefaultLocale(locales);
    }

    return {
      locales,
      defaultLocale,
    };
  }

  return { locales: [], defaultLocale: '' };
};

const getTrackLocale = (track) => {
  if (!track || typeof track !== 'object') return '';

  return (
    (typeof track.locale === 'string' && track.locale) ||
    (typeof track.language === 'string' && track.language) ||
    (typeof track.lang === 'string' && track.lang) ||
    (typeof track.code === 'string' && track.code) ||
    getLocaleString(track.defaultLocale) ||
    getLocaleString(track.default_locale) ||
    ''
  );
};

const getTrackLabel = (track) => {
  if (!track || typeof track !== 'object') return '';

  return (
    (typeof track.localeName === 'string' && track.localeName) ||
    (typeof track.label === 'string' && track.label) ||
    (typeof track.name === 'string' && track.name) ||
    getTrackLocale(track)
  );
};

const isCaptionTextTrack = (textTrack) => {
  if (!textTrack) return false;

  return CAPTION_TRACK_KINDS.includes(textTrack.kind);
};

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
  const textTracks            = useRef();
  const trackHandler          = useRef();
  const trackElsByLabel       = useRef({});
  const trackElsByLocale      = useRef({});

  useEffect(() => {
    if (player.webcams) return;

    const video = element.current;
    if (!video) return;

    // Clean any legacy track nodes
    video.querySelectorAll('track').forEach(t => t.remove());
    trackElsByLabel.current = {};
    trackElsByLocale.current = {};

    // Create <track> nodes WITHOUT src; stash the real URL in data attribute
    tracks.current.forEach((trackData) => {
      const locale = getTrackLocale(trackData);
      if (!locale) return;

      const label = getTrackLabel(trackData) || locale;
      const el = document.createElement('track');
      el.kind    = 'captions';
      el.label   = label;

      const srclang = normalizeLocale(locale);
      if (srclang) el.srclang = srclang;

      // Do NOT set el.src now; we will attach it on selection
      el.setAttribute('data-vtt-src', buildFileURL(`caption_${locale}.vtt`));

      trackElsByLabel.current[String(label || '').toLowerCase()] = el;
      if (srclang) trackElsByLocale.current[srclang] = el;

      video.appendChild(el);
    });

    // Helper: robustly force a reload when we assign src the first time
    const loadVttSrc = (trackEl) => {
      if (!trackEl) return;
      if (trackEl.dataset.loaded === 'true') return;
      if (trackEl.dataset.loading === 'true') return;

      const realSrc = trackEl.dataset.vttSrc;
      if (!realSrc) return;

      // UX hint while we fetch
      player.webcams?.addClass?.('vjs-waiting');

      trackEl.dataset.loading = 'true';

      const onFinish = () => {
        trackEl.dataset.loaded = 'true';
        trackEl.dataset.loading = 'false';
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

    const getTrackElementForTextTrack = (textTrack) => {
      if (!textTrack) return null;

      const language = normalizeLocale(textTrack.language);
      const labelLower = String(textTrack.label || '').toLowerCase();

      return (
        (language && trackElsByLocale.current[language]) ||
        trackElsByLabel.current[labelLower] ||
        (language ? video.querySelector(`track[srclang="${language}"]`) : null)
      );
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
        if (isCaptionTextTrack(tt)) {
          tt.mode = 'disabled';
        }
      }

      // On caption selection, attach real src if needed and force it to load
      trackHandler.current = () => {
        const tts = textTracks.current;
        if (!tts) return;

        for (let i = 0; i < tts.length; i += 1) {
          const tt = tts[i];
          if (!isCaptionTextTrack(tt)) continue;

          if (tt.mode === 'showing') {
            const trackEl = getTrackElementForTextTrack(tt);

            loadVttSrc(trackEl);
          }
        }
      };

      // Cover both native and Video.js events
      textTracks.current.addEventListener('change', trackHandler.current);
      player.webcams.on('texttrackchange', trackHandler.current);

      const selectCaptionByLocale = (rawLocale) => {
        const normalizedTarget = normalizeLocale(rawLocale);
        if (!normalizedTarget) return false;

        const tts = textTracks.current;
        if (!tts) return false;

        let fallbackMatch = null;

        for (let i = 0; i < tts.length; i += 1) {
          const tt = tts[i];
          if (!isCaptionTextTrack(tt)) continue;

          const trackEl = getTrackElementForTextTrack(tt);
          if (!trackEl) continue;

          const trackLocale =
            normalizeLocale(tt.language) ||
            normalizeLocale(trackEl.srclang);

          if (!trackLocale) continue;

          if (trackLocale === normalizedTarget) {
            tt.mode = 'showing';
            loadVttSrc(trackEl);
            return true;
          }

          if (!fallbackMatch) {
            const [targetLanguage] = normalizedTarget.split('-');
            const [trackLanguage] = trackLocale.split('-');
            if (targetLanguage && trackLanguage && targetLanguage === trackLanguage) {
              fallbackMatch = { tt, trackEl };
            }
          }
        }

        if (fallbackMatch) {
          fallbackMatch.tt.mode = 'showing';
          loadVttSrc(fallbackMatch.trackEl);
          return true;
        }

        return false;
      };

      // Auto-select caption defaulting to API-provided locale and browser locale fallback
      const localeCandidates = [
        defaultCaptionLocale.current,
        navigator.language,
      ].filter(Boolean);

      for (let index = 0; index < localeCandidates.length; index += 1) {
        const candidate = localeCandidates[index];
        if (selectCaptionByLocale(candidate)) break;

        const normalizedCandidate = normalizeLocale(candidate);
        const [baseLanguage] = normalizedCandidate.split('-');
        if (baseLanguage && baseLanguage !== normalizedCandidate) {
          if (selectCaptionByLocale(baseLanguage)) break;
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
