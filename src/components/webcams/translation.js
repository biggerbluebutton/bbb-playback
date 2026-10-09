import { captions as config } from 'config';
import {
  parseVTT,
  pickNext,
} from 'utils/captions/vtt';
import {
  getLanguage,
  getProvider,
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
  let sourceCues = null;

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
    onStart(name);

    let lastPercent = -1;
    const handleProgress = (loaded) => {
      const percent = Math.floor((loaded || 0) * 10) * 10;
      if (percent === lastPercent || percent >= 100) return;

      lastPercent = percent;
      onProgress(name, percent);
    };

    try {
      // Requested before anything else, while the menu click still counts as
      // a user gesture (needed when the browser downloads a language pack)
      const creating = provider.create(sourceLanguage, language, handleProgress);

      if (!sourceCues) sourceCues = await loadSourceCues(source);

      clearCues(track);
      let pending = sourceCues.map(cue => {
        const vttCue = createCue(track, cue);
        track.addCue(vttCue);

        return { cue, vttCue };
      });
      refreshDisplay();

      const translator = await creating;
      // Only worth telling when the viewer waited for a download
      if (lastPercent >= 0) onReady(name);
      const size = provider.batchSize || 1;

      while (pending.length > 0) {
        if (videojsPlayer.isDisposed()) return;

        const batch = pickNext(pending, videojsPlayer.currentTime(), size);
        const texts = await translator.translate(batch.map(item => item.cue.text));
        if (videojsPlayer.isDisposed()) return;

        batch.forEach((item, index) => {
          item.vttCue.text = texts[index];
        });
        pending = pending.filter(item => !batch.includes(item));
        refreshDisplay();
      }
    } catch (error) {
      if (videojsPlayer.isDisposed()) return;

      logger.warn('captions', 'translate', language, error);
      started.delete(language);
      clearCues(track);
      track.mode = 'disabled';
      showSourceTrack();
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
