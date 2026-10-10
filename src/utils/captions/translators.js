import { captions as config } from 'config';

const getLanguage = (code = '') => code.split(/[-_]/)[0].toLowerCase();

// Chrome's on-device Translator API: free, private, no server needed
const browserProvider = {
  isAvailable: (source, target) => {
    return window.Translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    }).then(availability => availability !== 'unavailable').catch(() => false);
  },
  // Language packs are worth fetching ahead of time
  preload: true,
  // Line by line, a few lines at a time
  batchSize: 1,
  concurrency: 4,
  create: (source, target, onProgress = () => {}) => {
    return window.Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      // Reports the language pack download, the first time a pair is used
      monitor: (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
      },
    }).then(translator => ({
      translate: async (texts) => {
        const result = [];
        for (const text of texts) {
          result.push(await translator.translate(text));
        }

        return result;
      },
    }));
  },
};

// Any LibreTranslate compatible endpoint configured by the operator
const httpProvider = (url, key) => ({
  batchSize: 16,
  concurrency: 3,
  isAvailable: () => Promise.resolve(true),
  create: (source, target) => Promise.resolve({
    translate: (texts) => {
      return fetch(url, {
        body: JSON.stringify({
          api_key: key || undefined,
          format: 'text',
          q: texts,
          source,
          target,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }).then(response => {
        if (!response.ok) throw new Error(`translate ${response.status}`);

        return response.json();
      }).then(({ translatedText }) => {
        const result = Array.isArray(translatedText) ? translatedText : [translatedText];
        if (result.length !== texts.length) throw new Error('translate mismatch');

        return result;
      });
    },
  }),
});

const getProvider = () => {
  const { translate } = config;
  if (!translate || !translate.enabled) return null;

  if (translate.url) return httpProvider(translate.url, translate.key);

  if (window.Translator && typeof window.Translator.create === 'function') return browserProvider;

  return null;
};

// One translator per language pair, shared by everything that needs it: a
// background warm-up and the viewer's choice reuse the same download, and
// every caller hears about its progress
const translators = new Map();

const getTranslator = (provider, source, target, onProgress) => {
  const key = `${source}|${target}`;
  let entry = translators.get(key);

  if (!entry) {
    const created = { listeners: new Set(), loaded: null, settled: false };
    created.promise = provider.create(source, target, (loaded) => {
      created.loaded = loaded;
      created.listeners.forEach(listener => listener(loaded));
    });
    // Progress only matters while the language pack downloads
    created.promise.then(() => {
      created.settled = true;
      created.listeners.clear();
    }, () => {
      created.settled = true;
      created.listeners.clear();
      translators.delete(key);
    });
    translators.set(key, created);
    entry = created;
  }

  if (onProgress && !entry.settled) {
    entry.listeners.add(onProgress);
    if (entry.loaded !== null) onProgress(entry.loaded);
  }

  return entry.promise;
};

export {
  getLanguage,
  getTranslator,
  getProvider,
  httpProvider,
};
