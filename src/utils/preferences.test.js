import {
  getMediaPreferences,
  saveMediaPreferences,
} from './preferences';

const RATES = [0.5, 1, 1.5, 2];

describe('media preferences', () => {
  beforeEach(() => localStorage.clear());

  it('has no preferences by default', () => {
    expect(getMediaPreferences(RATES)).toEqual({ muted: false, rate: null, volume: null });
  });

  it('remembers volume, mute and speed', () => {
    saveMediaPreferences({ volume: 0.4 });
    saveMediaPreferences({ muted: true, rate: 1.5 });
    expect(getMediaPreferences(RATES)).toEqual({ muted: true, rate: 1.5, volume: 0.4 });
  });

  it('ignores values the player does not support', () => {
    saveMediaPreferences({ rate: 3, volume: 4 });
    expect(getMediaPreferences(RATES)).toEqual({ muted: false, rate: null, volume: null });
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('bbb-playback-preferences', '{nope');
    expect(getMediaPreferences(RATES).rate).toBe(null);
  });
});
