import {
  orderFrom,
  parseVTT,
  toSeconds,
} from './vtt';

const VTT = `WEBVTT

NOTE produced by the recording

1
00:00:00.500 --> 00:00:05.000 align:center
Welcome everyone,
today we review Q3.

00:01:02.250 --> 00:01:04.000
Questions?

00:01:05.000 --> 00:01:06.000
`;

describe('vtt', () => {
  it('converts timestamps', () => {
    expect(toSeconds('00:01:02.250')).toBe(62.25);
    expect(toSeconds('01:02.5')).toBe(62.5);
    expect(toSeconds('00:00:01,200')).toBe(1.2);
  });

  it('reads cues and skips notes and empty cues', () => {
    expect(parseVTT(VTT)).toEqual([
      { start: 0.5, end: 5, text: 'Welcome everyone,\ntoday we review Q3.' },
      { start: 62.25, end: 64, text: 'Questions?' },
    ]);
  });

  it('handles windows line endings', () => {
    expect(parseVTT('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHi\r\n')).toEqual([
      { start: 1, end: 2, text: 'Hi' },
    ]);
  });

  it('starts with the cues ahead of the current time', () => {
    const cues = [{ end: 5 }, { end: 10 }, { end: 15 }];
    expect(orderFrom(cues, 8)).toEqual([{ end: 10 }, { end: 15 }, { end: 5 }]);
  });
});
