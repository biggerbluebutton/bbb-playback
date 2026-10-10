import { captions as config } from 'config';
import {
  parseVTT,
  pickNext,
} from 'utils/captions/vtt';
import {
  getLanguage,
  getProvider,
  getTranslator,
} from 'utils/captions/translators';
import {
  readTranslation,
  writeTranslation,
} from 'utils/captions/cache';
import { buildFileURL } from 'utils/data';
import storage from 'utils/data/storage';
import logger from 'utils/logger';

const getLanguageName = (locale, language) => {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(language);
    if (name && name !== language) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch (error) {
    // Older browsers
  }

  return language.toUpperCase();
};

const getTargets = (locale, existing) => {
  const targets = [getLanguage(locale), ...(config.translate.languages || [])];

  return [...new Set(targets)].filter(language => language && !existing.has(language));
};

const loadSourceCues = (source) => {
  return fetch(buildFileURL(`caption_${source.locale}.vtt`)).then(response => {
    if (!response.ok) throw new Error(`captions ${response.status}`);

    return response.text();
  }).then(parseVTT);
};

// video.js tracks copy cues that are not its own VTTCue type, which would
// break replacing the text later; native tracks (Safari) need native cues
const createCue = (track, cue) => {
  const emulated = Array.isArray(track.cues_) && window.vttjs && window.vttjs.VTTCue;
  const Cue = emulated ? window.vttjs.VTTCue : window.VTTCue;

  return new Cue(cue.start, cue.end, cue.text);
};

const clearCues = (track) => {
  if (!track.cues) return;

  while (track.cues.length > 0) track.removeCue(track.cues[0]);
};

// Adds machine translated caption languages to the CC menu. A selected
// language shows the original lines right away and swaps each one for its
// translation as soon as it is ready, starting from where the viewer is
const setupCaptionTranslation = (videojsPlayer, {
  label,
  locale,
  onFailed,
  onProgress,
  onReady,
  onStart,
}) => {
  const sources = storage.captions || [];
  if (sources.length === 0) return;

  const provider = getProvider();
  if (!provider) return;

  const source = sources[0];
  const sourceLanguage = getLanguage(source.locale);
  const existing = new Set(sources.map(caption => getLanguage(caption.locale)));
  const targets = getTargets(locale, existing);
  const started = new Set();
  const recordId = storage.metadata ? storage.metadata.id : '';

  // Fetched right away so it is ready when a language is picked
  let sourceCues = null;
  const getSourceCues = () => {
    if (!sourceCues) {
      sourceCues = loadSourceCues(source).catch(error => {
        sourceCues = null;
        throw error;
      });
    }

    return sourceCues;
  };
  getSourceCues().catch(() => {});

  // Paused players do not redraw captions until the next time update
  const refreshDisplay = () => {
    const display = videojsPlayer.getChild('textTrackDisplay');
    if (display && typeof display.updateDisplay === 'function') display.updateDisplay();
  };

  const showSourceTrack = () => {
    const tracks = videojsPlayer.textTracks();
    for (let index = 0; index < tracks.length; index++) {
      if (tracks[index].language === source.locale) {
        tracks[index].mode = 'showing';
        return;
      }
    }
  };

  const translateTrack = async (track, language, name) => {
    started.add(language);
    const cacheKey = `${recordId}|${source.locale}|${language}`;
    // Set when this run fails so every worker stops at once
    const run = { failed: false };
    let results = null;
    let count = 0;

    let lastPercent = -1;
    const handleProgress = (loaded) => {
      const percent = Math.floor((loaded || 0) * 10) * 10;
      if (percent === lastPercent || percent >= 100) return;

      lastPercent = percent;
      onProgress(name, percent);
    };

    try {
      const [cues, cached] = await Promise.all([getSourceCues(), readTranslation(cacheKey)]);
      const saved = cached && cached.count === cues.length && Array.isArray(cached.texts)
        ? cached.texts
        : [];
      count = cues.length;
      results = cues.map((cue, index) => (typeof saved[index] === 'string' ? saved[index] : null));

      // Saved lines show translated at once, the rest show the original
      clearCues(track);
      let pending = [];
      cues.forEach((cue, index) => {
        const vttCue = createCue(track, { ...cue, text: results[index] ?? cue.text });
        track.addCue(vttCue);
        if (results[index] === null) pending.push({ cue, index, vttCue });
      });
      refreshDisplay();

      if (pending.length === 0) return;

      onStart(name);
      const translator = await getTranslator(provider, sourceLanguage, language, handleProgress);
      // Only worth telling when the viewer waited for a download
      if (lastPercent >= 0) onReady(name);

      const size = provider.batchSize || 1;
      let sinceSave = 0;
      const save = () => writeTranslation(cacheKey, { count: cues.length, texts: results });

      // A few workers, each taking the lines closest to where the viewer is
      const worker = async () => {
        while (pending.length > 0 && !run.failed) {
          if (videojsPlayer.isDisposed()) return;

          const batch = pickNext(pending, videojsPlayer.currentTime(), size);
          pending = pending.filter(item => !batch.includes(item));

          let texts;
          try {
            texts = await translator.translate(batch.map(item => item.cue.text));
          } catch (error) {
            run.failed = true;
            throw error;
          }
          if (videojsPlayer.isDisposed() || run.failed) return;

          batch.forEach((item, index) => {
            item.vttCue.text = texts[index];
            results[item.index] = texts[index];
          });
          refreshDisplay();

          sinceSave += batch.length;
          if (sinceSave >= 40) {
            sinceSave = 0;
            save();
          }
        }
      };

      await Promise.all(Array.from({ length: provider.concurrency || 1 }, worker));
      if (!videojsPlayer.isDisposed()) save();
    } catch (error) {
      run.failed = true;
      if (videojsPlayer.isDisposed()) return;

      // Lines already translated are kept for the next attempt
      if (results && results.some(text => text !== null)) {
        writeTranslation(cacheKey, { count, texts: results });
      }

      logger.warn('captions', 'translate', language, error);
      started.delete(language);
      clearCues(track);
      track.mode = 'disabled';
      showSourceTrack();
      onFailed(name);
    }
  };

  // The language pack for the viewer's own language starts downloading on
  // their first click or key press (browsers require a gesture), so it is
  // usually ready by the time they open the captions menu
  const warmUp = (languages) => {
    if (!provider.preload || config.translate.preload === false) return;

    const preferred = [locale, ...(navigator.languages || [])].map(getLanguage);
    const target = preferred.find(language => languages.includes(language));
    if (!target) return;

    const stop = () => {
      document.removeEventListener('pointerdown', handleGesture, true);
      document.removeEventListener('keydown', handleGesture, true);
    };

    function handleGesture() {
      stop();
      getTranslator(provider, sourceLanguage, target).catch(error => {
        logger.debug('captions', 'warm up', target, error);
      });
    }

    document.addEventListener('pointerdown', handleGesture, true);
    document.addEventListener('keydown', handleGesture, true);
    videojsPlayer.on('dispose', stop);
  };

  Promise.all(targets.map(language => {
    return provider.isAvailable(sourceLanguage, language).then(available => available ? language : null);
  })).then(languages => {
    if (videojsPlayer.isDisposed()) return;

    const tracks = new Map();
    languages.filter(Boolean).forEach(language => {
      const name = getLanguageName(locale, language);
      const track = videojsPlayer.addTextTrack('subtitles', `${name} · ${label}`, language);
      tracks.set(track, { language, name });
    });

    if (tracks.size === 0) return;

    videojsPlayer.textTracks().addEventListener('change', () => {
      tracks.forEach(({ language, name }, track) => {
        if (track.mode === 'showing' && !started.has(language)) translateTrack(track, language, name);
      });
    });

    warmUp([...tracks.values()].map(({ language }) => language));

    logger.debug('captions', 'translations', [...tracks.values()].map(({ language }) => language));
  });
};

export default setupCaptionTranslation;
