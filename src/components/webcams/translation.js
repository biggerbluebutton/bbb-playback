import { captions as config } from 'config';
import {
  orderFrom,
  parseVTT,
} from 'utils/captions/vtt';
import {
  getLanguage,
  getProvider,
  translateInBatches,
} from 'utils/captions/translators';
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

const createCue = (cue) => {
  const Cue = window.VTTCue || (window.vttjs && window.vttjs.VTTCue);

  return new Cue(cue.start, cue.end, cue.text);
};

// Adds machine translated caption languages to the CC menu. Each language is
// only translated once the viewer selects it, starting from the current time
const setupCaptionTranslation = (videojsPlayer, { label, locale, onFailed, onStart }) => {
  const sources = storage.captions || [];
  if (sources.length === 0) return;

  const provider = getProvider();
  if (!provider) return;

  const source = sources[0];
  const sourceLanguage = getLanguage(source.locale);
  const existing = new Set(sources.map(caption => getLanguage(caption.locale)));
  const targets = getTargets(locale, existing);
  const started = new Set();
  let sourceCues = null;

  // Paused players do not redraw captions until the next time update
  const refreshDisplay = () => {
    const display = videojsPlayer.getChild('textTrackDisplay');
    if (display && typeof display.updateDisplay === 'function') display.updateDisplay();
  };

  const translateTrack = async (track, language, name) => {
    started.add(language);
    onStart(name);

    try {
      // Created before anything else, while the menu click still counts as
      // a user gesture (needed when the browser downloads a language pack)
      const translator = await provider.create(sourceLanguage, language);
      if (!sourceCues) sourceCues = await loadSourceCues(source);

      const cues = orderFrom(sourceCues, videojsPlayer.currentTime());
      await translateInBatches(translator, cues, (batch) => {
        if (videojsPlayer.isDisposed()) throw new Error('disposed');
        batch.forEach(cue => track.addCue(createCue(cue)));
        refreshDisplay();
      });
    } catch (error) {
      if (videojsPlayer.isDisposed()) return;

      logger.warn('captions', 'translate', language, error);
      started.delete(language);
      track.mode = 'disabled';
      onFailed(name);
    }
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

    logger.debug('captions', 'translations', [...tracks.values()].map(({ language }) => language));
  });
};

export default setupCaptionTranslation;
