// Minimal WebVTT/SRT cue reader: timings and text only
const TIMING = /^\s*(\S+)\s+-->\s+(\S+)/;

const toSeconds = (value) => {
  const parts = value.replace(',', '.').split(':').map(parseFloat);
  if (parts.some(part => Number.isNaN(part))) return NaN;

  return parts.reduce((total, part) => total * 60 + part, 0);
};

const parseVTT = (text = '') => {
  const cues = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);

  blocks.forEach(block => {
    const lines = block.split('\n');
    const index = lines.findIndex(line => line.includes('-->'));
    if (index === -1) return;

    const match = lines[index].match(TIMING);
    if (!match) return;

    const start = toSeconds(match[1]);
    const end = toSeconds(match[2]);
    const content = lines.slice(index + 1).join('\n').trim();
    if (!content || !Number.isFinite(start) || !Number.isFinite(end)) return;

    cues.push({ end, start, text: content });
  });

  return cues;
};

// Cues still ahead of the viewer come first so captions show up right away
const orderFrom = (cues, time = 0) => [
  ...cues.filter(cue => cue.end >= time),
  ...cues.filter(cue => cue.end < time),
];

// Next lines to translate: the ones on screen or coming up first, so a seek
// moves the translation to wherever the viewer is
const pickNext = (pending, time = 0, size = 1) => {
  const ahead = pending.filter(item => item.cue.end >= time);
  const source = ahead.length > 0 ? ahead : pending;

  return [...source].sort((a, b) => a.cue.start - b.cue.start).slice(0, size);
};

export {
  orderFrom,
  pickNext,
  parseVTT,
  toSeconds,
};
