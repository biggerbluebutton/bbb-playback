import { buildFileURL } from 'utils/data';

const CAPTION_TRACK_KINDS = ['captions', 'subtitles'];
const WAITING_CLASS_NAME = 'vjs-waiting';

const noop = () => {};

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

  const defaultEntry = locales.find((item) => {
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

const getTrackKind = (track) => {
  if (!track || typeof track !== 'object') return 'captions';

  const { kind } = track;
  if (typeof kind === 'string' && CAPTION_TRACK_KINDS.includes(kind)) {
    return kind;
  }

  return 'captions';
};

const getTrackSrc = (track, locale) => {
  if (track && typeof track === 'object') {
    const explicitSrc =
      track.src ||
      track.url ||
      track.href ||
      track.vtt ||
      track.vttUrl ||
      track.vttURL ||
      track.caption ||
      track.captionUrl ||
      track.captionURL ||
      track.caption_url ||
      track.source;

    if (typeof explicitSrc === 'string' && explicitSrc.length > 0) {
      return explicitSrc;
    }
  }

  if (!locale) return '';

  return buildFileURL(`caption_${locale}.vtt`);
};

const isCaptionTextTrack = (textTrack) => {
  if (!textTrack) return false;

  return CAPTION_TRACK_KINDS.includes(textTrack.kind);
};

const setupLazyCaptions = ({
  playerInstance,
  videoElement,
  tracks = [],
  defaultLocale = '',
  localeCandidates = [],
} = {}) => {
  if (!playerInstance || !videoElement) return noop;
  if (!Array.isArray(tracks) || tracks.length === 0) return noop;

  const trackElsByLabel = {};
  const trackElsByLocale = {};

  videoElement.querySelectorAll('track').forEach((t) => t.remove());

  const createdTrackEls = tracks.reduce((acc, trackData) => {
    const locale = getTrackLocale(trackData);
    if (!locale) return acc;

    const label = getTrackLabel(trackData) || locale;
    const srclang = normalizeLocale(locale);
    const src = getTrackSrc(trackData, locale);
    if (!src) return acc;

    const el = document.createElement('track');
    el.kind = getTrackKind(trackData);
    el.label = label;

    if (srclang) el.srclang = srclang;

    el.setAttribute('data-vtt-src', src);
    el.dataset.loaded = 'false';
    el.dataset.loading = 'false';

    trackElsByLabel[String(label || '').toLowerCase()] = el;
    if (srclang) trackElsByLocale[srclang] = el;

    videoElement.appendChild(el);
    acc.push(el);

    return acc;
  }, []);

  if (createdTrackEls.length === 0) return noop;

  const textTracks = typeof playerInstance.textTracks === 'function'
    ? playerInstance.textTracks()
    : null;

  if (!textTracks) return noop;

  for (let index = 0; index < textTracks.length; index += 1) {
    const textTrack = textTracks[index];
    if (isCaptionTextTrack(textTrack)) {
      textTrack.mode = 'disabled';
    }
  }

  const schedule =
    (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame.bind(window)
      : (typeof window !== 'undefined' && window.setTimeout)
        ? (fn) => window.setTimeout(fn, 0)
        : (fn) => fn();

  const loadVttSrc = (trackEl) => {
    if (!trackEl) return;
    if (trackEl.dataset.loaded === 'true') return;
    if (trackEl.dataset.loading === 'true') return;

    const realSrc = trackEl.dataset.vttSrc;
    if (!realSrc) return;

    trackEl.dataset.loading = 'true';
    playerInstance?.addClass?.(WAITING_CLASS_NAME);

    const onFinish = () => {
      trackEl.dataset.loaded = 'true';
      trackEl.dataset.loading = 'false';
      playerInstance?.removeClass?.(WAITING_CLASS_NAME);
      trackEl.removeEventListener('load', onFinish);
      trackEl.removeEventListener('error', onFinish);
    };

    trackEl.addEventListener('load', onFinish, { once: true });
    trackEl.addEventListener('error', onFinish, { once: true });

    trackEl.setAttribute('src', '');
    schedule(() => {
      trackEl.setAttribute('src', realSrc);

      const nativeTrack = trackEl.track;
      if (nativeTrack) {
        nativeTrack.mode = 'disabled';
        schedule(() => {
          nativeTrack.mode = 'showing';
        });
      }
    });
  };

  const getTrackElementForTextTrack = (textTrack) => {
    if (!textTrack) return null;

    const language = normalizeLocale(textTrack.language);
    const labelLower = String(textTrack.label || '').toLowerCase();

    return (
      (language && trackElsByLocale[language]) ||
      trackElsByLabel[labelLower] ||
      (language ? videoElement.querySelector(`track[srclang="${language}"]`) : null)
    );
  };

  const trackHandler = () => {
    for (let index = 0; index < textTracks.length; index += 1) {
      const textTrack = textTracks[index];
      if (!isCaptionTextTrack(textTrack)) continue;

      if (textTrack.mode === 'showing') {
        const trackEl = getTrackElementForTextTrack(textTrack);
        loadVttSrc(trackEl);
      }
    }
  };

  if (textTracks.addEventListener) {
    textTracks.addEventListener('change', trackHandler);
  }
  playerInstance?.on?.('texttrackchange', trackHandler);

  const selectCaptionByLocale = (rawLocale) => {
    const normalizedTarget = normalizeLocale(rawLocale);
    if (!normalizedTarget) return false;

    let fallbackMatch = null;

    for (let index = 0; index < textTracks.length; index += 1) {
      const textTrack = textTracks[index];
      if (!isCaptionTextTrack(textTrack)) continue;

      const trackEl = getTrackElementForTextTrack(textTrack);
      if (!trackEl) continue;

      const trackLocale =
        normalizeLocale(textTrack.language) ||
        normalizeLocale(trackEl.srclang);

      if (!trackLocale) continue;

      if (trackLocale === normalizedTarget) {
        textTrack.mode = 'showing';
        loadVttSrc(trackEl);
        return true;
      }

      if (!fallbackMatch) {
        const [targetLanguage] = normalizedTarget.split('-');
        const [trackLanguage] = trackLocale.split('-');

        if (targetLanguage && trackLanguage && targetLanguage === trackLanguage) {
          fallbackMatch = { textTrack, trackEl };
        }
      }
    }

    if (fallbackMatch) {
      fallbackMatch.textTrack.mode = 'showing';
      loadVttSrc(fallbackMatch.trackEl);
      return true;
    }

    return false;
  };

  const candidateOrder = [];
  const seen = new Set();
  const maybeAddCandidate = (candidate) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    candidateOrder.push(candidate);
  };

  maybeAddCandidate(defaultLocale);
  if (Array.isArray(localeCandidates)) {
    localeCandidates.forEach(maybeAddCandidate);
  }
  if (typeof navigator !== 'undefined') {
    maybeAddCandidate(navigator.language);
  }

  candidateOrder.some((candidate) => {
    if (selectCaptionByLocale(candidate)) return true;

    const normalizedCandidate = normalizeLocale(candidate);
    if (!normalizedCandidate) return false;

    const [baseLanguage] = normalizedCandidate.split('-');
    if (baseLanguage && baseLanguage !== normalizedCandidate) {
      return selectCaptionByLocale(baseLanguage);
    }

    return false;
  });

  return () => {
    if (textTracks.removeEventListener) {
      textTracks.removeEventListener('change', trackHandler);
    }
    playerInstance?.off?.('texttrackchange', trackHandler);
  };
};

export {
  normalizeLocale,
  parseCaptionsData,
  setupLazyCaptions,
};
