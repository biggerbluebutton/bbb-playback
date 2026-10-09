import {
  getLanguage,
  httpProvider,
} from './translators';

describe('translators', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('reduces locales to languages', () => {
    expect(getLanguage('pt-BR')).toBe('pt');
    expect(getLanguage('en_US')).toBe('en');
    expect(getLanguage('AR')).toBe('ar');
  });

  it('calls a LibreTranslate compatible endpoint', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ translatedText: ['Hola', 'Adiós'] }),
    }));

    const translator = await httpProvider('https://mt.example.com/translate', 'secret').create('en', 'es');
    await expect(translator.translate(['Hello', 'Bye'])).resolves.toEqual(['Hola', 'Adiós']);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://mt.example.com/translate');
    expect(JSON.parse(options.body)).toEqual({
      api_key: 'secret',
      format: 'text',
      q: ['Hello', 'Bye'],
      source: 'en',
      target: 'es',
    });
  });

  it('rejects failed or incomplete answers', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 503 }));
    const translator = await httpProvider('https://mt.example.com/translate').create('en', 'es');
    await expect(translator.translate(['Hello'])).rejects.toThrow('503');

    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ translatedText: ['Hola'] }),
    }));
    await expect(translator.translate(['Hello', 'Bye'])).rejects.toThrow('mismatch');
  });
});
