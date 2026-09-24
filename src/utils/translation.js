import { translation as config } from 'config';
import messages from 'locales/messages';
import { ID } from 'utils/constants';
import logger from 'utils/logger';

// Some of the player's UI locales map onto a different code for the translation
// service (e.g. Traditional Chinese). Anything not listed here falls back to the
// base language subtag (pt-BR -> pt).
const SERVICE_LANG_OVERRIDES = {
  'zh-TW': 'zt',
  'zh-CN': 'zh',
};

const fileToLocale = (file) => file.replace('_', '-');

// Maps a BCP-47 locale onto the code understood by the translation service.
const toServiceLang = (locale) => {
  if (SERVICE_LANG_OVERRIDES[locale]) return SERVICE_LANG_OVERRIDES[locale];

  const [ language ] = locale.split('-');

  return language;
};

// Builds a human readable name for a locale, localized to the UI language when
// the platform supports Intl.DisplayNames.
const buildLocaleName = (locale, uiLocale) => {
  try {
    const names = new Intl.DisplayNames([uiLocale || locale], { type: 'language' });
    const name = names.of(locale);
    if (name && name !== locale) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch (error) {
    // Intl.DisplayNames is unavailable; fall back to the locale code.
  }

  return locale;
};

// The player ships a fixed set of UI translation files, several of which are
// aliased (e.g. `pt` -> `pt_BR`). Collapse the aliases so each distinct locale
// file appears once, preferring the region-qualified key.
const getUiLocaleFiles = () => {
  const canonical = new Map();

  Object.entries(messages).forEach(([key, value]) => {
    const existing = canonical.get(value);
    if (!existing) {
      canonical.set(value, key);
    } else if (key.includes('_') && !existing.includes('_')) {
      canonical.set(value, key);
    }
  });

  return [...canonical.values()];
};

// Returns the list of languages offered in the caption menu, sorted by name.
const getAvailableLanguages = (uiLocale) => {
  const languages = getUiLocaleFiles().map((file) => {
    const locale = fileToLocale(file);

    return {
      locale,
      localeName: buildLocaleName(locale, uiLocale),
      serviceLang: toServiceLang(locale),
    };
  });

  return languages.sort((a, b) => a.localeName.localeCompare(b.localeName));
};

const parseTimestamp = (value) => {
  const [ time, ms = '0' ] = value.trim().split('.');
  const parts = time.split(':').map(Number);

  let seconds = 0;
  parts.forEach((part) => { seconds = (seconds * 60) + part; });

  return seconds + (Number(`0.${ms}`) || 0);
};

// Parses a WebVTT document into an array of { start, end, text } cues. Only the
// pieces the player needs are kept; unsupported blocks (NOTE, STYLE, REGION) are
// ignored.
const parseVTT = (vtt) => {
  const cues = [];
  const blocks = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  blocks.forEach((block) => {
    const lines = block.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) return;

    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) return;

    const [ startRaw, endRaw ] = lines[timingIndex].split('-->');
    if (!startRaw || !endRaw) return;

    // Drop any cue settings that follow the end timestamp.
    const [ endTime ] = endRaw.trim().split(/\s+/);
    const text = lines.slice(timingIndex + 1).join('\n');
    if (text.length === 0) return;

    cues.push({
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endTime),
      text,
    });
  });

  return cues;
};

const chunk = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
};

// Sends one batch of strings to the translation service and returns the
// translated strings in the same order.
const translateBatch = async (texts, target, source) => {
  const body = {
    q: texts,
    source: source || 'auto',
    target,
    format: 'text',
  };

  if (config.apiKey) body.api_key = config.apiKey;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}`);
  }

  const result = await response.json();
  const { translatedText } = result;

  // LibreTranslate returns an array when `q` is an array and a string otherwise.
  if (Array.isArray(translatedText)) return translatedText;
  if (typeof translatedText === 'string') return [translatedText];

  throw new Error('Unexpected translation response');
};

// Fetches a WebVTT file and returns its raw text.
const fetchVTT = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch captions from ${url} (${response.status})`);
  }

  return response.text();
};

// Translates the cues of a WebVTT document into the target language, preserving
// the original timings. Returns an array of { start, end, text } cues.
const translateVTT = async (vtt, target, source) => {
  const cues = parseVTT(vtt);
  if (cues.length === 0) return [];

  const texts = cues.map((cue) => cue.text);
  const batches = chunk(texts, config.batchSize || 25);

  const translated = [];
  for (const batch of batches) {
    // eslint-disable-next-line no-await-in-loop
    const result = await translateBatch(batch, target, source);
    translated.push(...result);
  }

  if (translated.length !== cues.length) {
    logger.warn(ID.WEBCAMS, 'translation returned an unexpected number of cues');
  }

  return cues.map((cue, index) => ({
    start: cue.start,
    end: cue.end,
    text: translated[index] !== undefined ? translated[index] : cue.text,
  }));
};

export {
  fetchVTT,
  getAvailableLanguages,
  parseVTT,
  toServiceLang,
  translateVTT,
};
