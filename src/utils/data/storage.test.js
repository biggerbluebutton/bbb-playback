import { files } from 'config';
import storage from './storage';

const RECORD_ID = '0123456789abcdef0123456789abcdef01234567-1700000000000';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('storage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('only reports loaded once every file and the media are settled', async () => {
    let releaseShapes;
    const shapes = new Promise(resolve => {
      releaseShapes = () => resolve({ ok: false, url: files.shapes });
    });

    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === 'HEAD') {
        return Promise.resolve({ ok: url.endsWith('mp4'), url });
      }

      // The slowest file is the presentation
      if (url.endsWith(files.shapes)) return shapes;

      return Promise.resolve({ ok: false, url });
    });

    const onUpdate = jest.fn();
    const onLoaded = jest.fn();
    const onError = jest.fn();

    storage.fetch(RECORD_ID, onUpdate, onLoaded, onError);
    await flush();

    // Everything but the presentation is in, media included
    expect(onUpdate).toHaveBeenCalledTimes(Object.keys(files).length);
    expect(storage.media).toEqual(['mp4']);
    expect(onLoaded).not.toHaveBeenCalled();

    releaseShapes();
    await flush();

    expect(onLoaded).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
