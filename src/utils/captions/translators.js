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
  // On-device translation is fast per line, so lines are done one by one
  batchSize: 1,
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
  batchSize: 10,
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

export {
  getLanguage,
  getProvider,
  httpProvider,
};
