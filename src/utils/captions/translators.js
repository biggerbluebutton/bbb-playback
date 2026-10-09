import { captions as config } from 'config';

const BATCH = 25;

const getLanguage = (code = '') => code.split(/[-_]/)[0].toLowerCase();

// Chrome's on-device Translator API: free, private, no server needed
const browserProvider = {
  isAvailable: (source, target) => {
    return window.Translator.availability({
      sourceLanguage: source,
      targetLanguage: target,
    }).then(availability => availability !== 'unavailable').catch(() => false);
  },
  create: (source, target) => {
    return window.Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
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

// Translates in batches, reporting each batch as soon as it is ready
const translateInBatches = async (translator, items, onBatch) => {
  for (let index = 0; index < items.length; index += BATCH) {
    const batch = items.slice(index, index + BATCH);
    const texts = await translator.translate(batch.map(item => item.text));
    onBatch(batch.map((item, i) => ({ ...item, text: texts[i] })));
  }
};

export {
  getLanguage,
  getProvider,
  httpProvider,
  translateInBatches,
};
