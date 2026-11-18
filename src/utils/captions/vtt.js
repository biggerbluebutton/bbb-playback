// Minimal WebVTT/SRT cue reader: timings and text only
const TIMING = /^\s*(\S+)\s+-->\s+(\S+)/;

const toSeconds = (value) => {
  const parts = value.replace(',', '.').split(':').map(parseFloat);
  if (parts.some(part => Number.isNaN(part))) return NaN;

  return parts.reduce((total, part) => total * 60 + part, 0);
};

// Characters that show nothing: spaces of every kind, control characters
// and format marks such as the direction marks in Arabic and Hebrew text
// (U+200E/F, U+202A-E, U+2066-9, U+061C), plus blank-looking fillers
const INVISIBLE = /[\s\p{Z}\p{Cc}\p{Cf}\u115f\u1160\u2800\u3164\uffa0]/gu;

// Lines with nothing to read: spaces, &nbsp;, invisible marks or empty tags
// such as <v Bob></v>. Shown, they would be an empty caption box
const isBlank = (text) => {
  if (typeof text !== 'string') return true;

  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|lrm|rlm|zwj|zwnj|#\d+|#x[\da-f]+);/gi, (entity) => {
      const match = entity.match(/^&#(x?)([\da-f]+);$/i);
      if (!match) return '';

      const char = String.fromCodePoint(parseInt(match[2], match[1] ? 16 : 10));
      return char.replace(INVISIBLE, '');
    })
    .replace(INVISIBLE, '') === '';
};

// Drops the empty lines inside a caption (spaces, &nbsp;, invisible marks),
// which would show as a sliver of caption box above or below the text.
// Lines with tags stay, so formatting that spans lines is not broken
const tidyText = (text) => {
  if (typeof text !== 'string') return '';

  return text
    .split('\n')
    .filter(line => line.includes('<') || !isBlank(line))
    .map(line => line.trim())
    .join('\n');
};

const ENTITIES = {
  amp: '&',
  gt: '>',
  lrm: '\u200e',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
  rlm: '\u200f',
};

// A speaker, as WebVTT names one: <v Bob>, <v.loud Bob Smith>
const VOICE = /<v(?:\.[^\s>]*)?\s+([^>]+)>/g;

const toSpeaker = (name) => name.replace(/\s+/g, ' ').trim();

// The speakers named in a caption, in order
const getSpeakers = (text) => {
  if (typeof text !== 'string') return [];

  return Array.from(text.matchAll(VOICE), match => toSpeaker(match[1]))
    .filter(speaker => !isBlank(speaker));
};

// Put around a speaker's name while the text is cleaned, to find it after:
// private use characters, which captions do not carry
const NAME_START = '\ue000';
const NAME_END = '\ue001';
const NAME_MARKS = /[\ue000\ue001]/g;

const cleanText = (text, marked) => {
  if (typeof text !== 'string') return '';

  let last = null;
  const plain = text
    .replace(NAME_MARKS, '')
    .replace(VOICE, (match, name) => {
      const speaker = toSpeaker(name);
      // Named once while they keep talking: captions regrouped into
      // sentences have the same <v Bob> on every piece
      if (isBlank(speaker) || speaker === last) return '';

      last = speaker;
      return marked ? `${NAME_START}${speaker}${NAME_END}: ` : `${speaker}: `;
    })
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }

      return ENTITIES[name.toLowerCase()] ?? entity;
    });

  return tidyText(plain)
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' '))
    .join('\n');
};

// A caption's words without its markup, for reading and translating: word
// timings (<00:00:14.080>), classes and styles (<c>, <i>, <b>, <u>) go,
// a speaker (<v Bob>) becomes "Bob: ", and entities become characters
const toPlainText = (text) => cleanText(text, false);

// The same words as toPlainText, with where each speaker's name is in them:
// { text, names: [{ start, end }] }, a name being text.slice(start, end)
const toLabelledText = (text) => {
  const names = [];
  let plain = '';
  let start = -1;

  for (const char of cleanText(text, true)) {
    if (char === NAME_START) {
      start = plain.length;
    } else if (char === NAME_END) {
      if (start !== -1) names.push({ end: plain.length, start });
      start = -1;
    } else {
      plain += char;
    }
  }

  return { names, text: plain };
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
    const content = tidyText(lines.slice(index + 1).join('\n'));
    if (isBlank(content) || !Number.isFinite(start) || !Number.isFinite(end)) return;

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
  getSpeakers,
  isBlank,
  orderFrom,
  pickNext,
  parseVTT,
  tidyText,
  toLabelledText,
  toPlainText,
  toSeconds,
};
