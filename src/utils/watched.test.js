import watched, { addRange, coverage } from './watched';
import { EVENTS } from './constants';

describe('watched ranges', () => {
  it('merges overlapping and touching ranges', () => {
    let ranges = [];
    ranges = addRange(ranges, 10, 20);
    ranges = addRange(ranges, 30, 40);
    ranges = addRange(ranges, 0, 5);
    expect(ranges).toEqual([[0, 5], [10, 20], [30, 40]]);

    ranges = addRange(ranges, 18, 31);
    expect(ranges).toEqual([[0, 5], [10, 40]]);

    ranges = addRange(ranges, 5, 10);
    expect(ranges).toEqual([[0, 40]]);
  });

  it('ignores empty ranges', () => {
    expect(addRange([[0, 1]], 5, 5)).toEqual([[0, 1]]);
  });

  it('measures coverage of a section', () => {
    const ranges = [[0, 10], [20, 30]];
    expect(coverage(ranges, 0, 30)).toBe(20);
    expect(coverage(ranges, 5, 25)).toBe(10);
    expect(coverage(ranges, 40, 50)).toBe(0);
  });
});

describe('watched tracking', () => {
  beforeEach(() => localStorage.clear());

  it('counts normal playback, not seeks', () => {
    const listener = jest.fn();
    document.addEventListener(EVENTS.WATCHED, listener);

    watched.load('rec');
    [0, 0.1, 0.2, 0.3].forEach(t => watched.track(t));
    watched.track(50); // seek
    watched.track(50.1);
    watched.interrupt();
    watched.track(60); // after a pause
    watched.track(60.1);

    const ranges = watched.getRanges().map(([s, e]) => [s, Math.round(e * 10) / 10]);
    expect(ranges).toEqual([[0, 0.3], [50, 50.1], [60, 60.1]]);
    expect(listener).toHaveBeenCalled();
    document.removeEventListener(EVENTS.WATCHED, listener);
  });

  it('announces loaded progress', () => {
    const listener = jest.fn();
    document.addEventListener(EVENTS.WATCHED, listener);
    watched.load('rec');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(watched.isLoaded()).toBe(true);
    document.removeEventListener(EVENTS.WATCHED, listener);
  });

  it('persists per recording', () => {
    watched.load('rec');
    watched.track(1);
    watched.track(2);
    watched.save();

    expect(watched.load('rec')).toEqual([[1, 2]]);
    expect(watched.load('other')).toEqual([]);
  });
});
