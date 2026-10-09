import Shortcuts, { matches } from './shortcuts';

const press = (init, target = document.body) => {
  const event = new KeyboardEvent('keydown', {
    altKey: true,
    bubbles: true,
    cancelable: true,
    shiftKey: true,
    ...init,
  });
  target.dispatchEvent(event);

  return event;
};

describe('matches', () => {
  it('matches the reported key', () => {
    expect(matches({ key: 'K', code: 'KeyK' }, 'K')).toBe(true);
    expect(matches({ key: 'ArrowLeft', code: 'ArrowLeft' }, 'ArrowLeft')).toBe(true);
  });

  it('ignores the letter case', () => {
    expect(matches({ key: 'k', code: 'KeyK' }, 'K')).toBe(true);
  });

  it('falls back to the physical key', () => {
    // macOS: Alt+Shift+K reports the Apple logo character
    expect(matches({ key: '', code: 'KeyK' }, 'K')).toBe(true);
    expect(matches({ key: 'Unidentified', code: 'Enter' }, 'Enter')).toBe(true);
  });

  it('rejects other keys', () => {
    expect(matches({ key: 'L', code: 'KeyL' }, 'K')).toBe(false);
    expect(matches({ key: 'ArrowRight', code: 'ArrowRight' }, 'ArrowLeft')).toBe(false);
  });
});

describe('Shortcuts', () => {
  let shortcuts;
  const fullscreen = jest.fn();
  const backward = jest.fn();

  beforeEach(() => {
    fullscreen.mockClear();
    backward.mockClear();
    shortcuts = new Shortcuts({
      fullscreen,
      seek: { backward },
    });
  });

  afterEach(() => shortcuts.destroy());

  it('runs the action for Alt+Shift+key', () => {
    const event = press({ key: 'K', code: 'KeyK' });
    expect(fullscreen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    press({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(backward).toHaveBeenCalledTimes(1);
  });

  it('requires both Alt and Shift', () => {
    press({ key: 'K', code: 'KeyK', altKey: false });
    press({ key: 'K', code: 'KeyK', shiftKey: false });
    expect(fullscreen).not.toHaveBeenCalled();
  });

  it('ignores key presses while typing', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    press({ key: 'K', code: 'KeyK' }, input);
    expect(fullscreen).not.toHaveBeenCalled();
    input.remove();
  });

  it('removes its listeners when destroyed', () => {
    shortcuts.destroy();
    press({ key: 'K', code: 'KeyK' });
    expect(fullscreen).not.toHaveBeenCalled();
  });
});
