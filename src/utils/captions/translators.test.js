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

describe('getTranslator', () => {
  const { getTranslator } = jest.requireActual('./translators');

  it('shares one translator per language pair and its progress', async () => {
    let report;
    const translator = { translate: jest.fn() };
    const provider = {
      create: jest.fn((source, target, onProgress) => {
        report = onProgress;
        return Promise.resolve(translator);
      }),
    };
    const first = jest.fn();
    const second = jest.fn();

    const a = getTranslator(provider, 'en', 'fr', first);
    report(0.5);
    const b = getTranslator(provider, 'en', 'fr', second);

    expect(provider.create).toHaveBeenCalledTimes(1);
    // A late caller still hears where the download is
    expect(second).toHaveBeenCalledWith(0.5);
    report(1);
    expect(first).toHaveBeenLastCalledWith(1);
    expect(second).toHaveBeenLastCalledWith(1);
    await expect(a).resolves.toBe(translator);
    await expect(b).resolves.toBe(translator);

    getTranslator(provider, 'en', 'de');
    expect(provider.create).toHaveBeenCalledTimes(2);
  });

  it('retries after a failure', async () => {
    const provider = {
      create: jest.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('no')))
        .mockImplementationOnce(() => Promise.resolve('ok')),
    };

    await expect(getTranslator(provider, 'en', 'es')).rejects.toThrow('no');
    await expect(getTranslator(provider, 'en', 'es')).resolves.toBe('ok');
  });
});
