import { toPlainText } from './vtt';

// Speakers' names in the transcript, so they can be shown apart from what
// is said. A name comes from a WebVTT voice tag (<v Bob>, which the plain
// text shows as "Bob: "), or from a "Name: " label written in the captions
// themselves. Labels count once one of them starts at least two lines: a
// speaker's label repeats, a one-off such as "The answer is: yes" does not.
// Then every label at the start of a line counts, so someone who speaks
// once is shown like the others

const VOICE = /<v(?:\.[^\s>]*)?\s+([^>]+)>/g;

// The colon after a name: a Latin one (with the space French puts before
// it) followed by a space, or a full-width one, which Chinese and Japanese
// follow with the words directly
const COLON = '\\s*(?::(?=\\s|$)|：)';
// A label at the start of a line
const LABEL = new RegExp(`^([^:：]{1,40}?)${COLON}`);
// Punctuation that a speaker's name does not hold (names such as
// "Dr. Sarah" or "Omar (host)" keep their dots and brackets)
const NOT_A_NAME = /[,;!?…。！？؟،؛"“”«»<>]/;
const MAX_WORDS = 4;
const MIN_LINES = 2;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const voiceNames = (markup = '') => {
  const names = [];
  for (const match of markup.matchAll(VOICE)) {
    const name = toPlainText(match[1]).trim();
    if (name) names.push(name);
  }

  return names;
};

const labelAt = (line) => {
  const match = line.match(LABEL);
  if (!match) return null;

  const label = match[1].trim();
  const words = label.split(/\s+/).length;
  if (!/\p{L}/u.test(label) || words > MAX_WORDS || NOT_A_NAME.test(label)) return null;

  return label;
};

// The speakers' names in transcript lines ({ markup, text }: the caption as
// written and its plain text), longest first
const findSpeakers = (lines = []) => {
  const names = new Set();
  const labels = new Map();

  lines.forEach(({ markup, text }) => {
    voiceNames(markup).forEach(name => names.add(name));
    (text || '').split('\n').forEach(line => {
      const label = labelAt(line);
      if (label) labels.set(label, (labels.get(label) || 0) + 1);
    });
  });

  const labelled = [...labels.values()].some(count => count >= MIN_LINES);
  if (labelled) labels.forEach((count, label) => names.add(label));

  return [...names].sort((a, b) => b.length - a.length);
};

// Where the speakers' names are in a line, colon included, as
// [from, to] offsets. A name counts at the start of the line or after a
// space, as when lines with several speakers were joined into one
const findSpeakerRanges = (text = '', names = []) => {
  if (!text || names.length === 0) return [];

  const pattern = new RegExp(`(^|\\s)(${names.map(escape).join('|')})${COLON}`, 'g');
  const ranges = [];
  for (const match of text.matchAll(pattern)) {
    const from = match.index + match[1].length;
    ranges.push([from, match.index + match[0].length]);
  }

  return ranges;
};

export {
  findSpeakerRanges,
  findSpeakers,
};
