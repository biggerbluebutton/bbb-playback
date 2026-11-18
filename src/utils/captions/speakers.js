import { isBlank, toLabelledText } from './vtt';

// Speaker names in the transcript. WebVTT names speakers with voice tags
// (<v Bob>); captions without them often write the name out at the start of
// a line instead: "Bob: …", "- Bob: …", ">> Dr. Jane Smith: …", "张三：…"
const PLAIN_LABEL = /^([-–—>»•\s]*)([^:：\n]+?)(?::(?=\s|$)|：)/u;

const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'’&_-]*$/u;
const MAX_LENGTH = 40;
const MAX_WORDS = 5;
// Lowercase words that can sit inside a name: María de la Cruz, Ludwig van
// Beethoven
const MAX_PARTICLE = 3;

// Whether the text before a colon reads as a name and not as the start of
// a sentence ("The answer is: …"). Names are capitalized in scripts that
// have capitals; numbers and underscores are fine (Speaker 1, SPEAKER_01)
const isName = (name) => {
  if (Array.from(name).length > MAX_LENGTH) return false;
  if (name !== name.trim() || !NAME.test(name) || !/\p{L}/u.test(name)) return false;

  const words = name.split(/\s+/);
  if (words.length > MAX_WORDS) return false;

  return words.every((word, index) => !/^\p{Ll}/u.test(word)
    || (index > 0 && index < words.length - 1 && Array.from(word).length <= MAX_PARTICLE));
};

// Names written at the start of the lines of a text, as { start, end }
const findPlainNames = (text) => {
  const names = [];
  let offset = 0;

  text.split('\n').forEach((line) => {
    const match = line.match(PLAIN_LABEL);
    if (match && isName(match[2])) {
      const start = offset + match[1].length;
      names.push({ end: start + match[2].length, start });
    }

    offset += line.length + 1;
  });

  return names;
};

// Lines for the transcript from caption cues: each cue's words without
// markup ({ ...cue, text }), and where the speakers' names are in them
// ({ names: [{ start, end }] })
const toTranscriptLines = (cues) => {
  // Cues with words to read: a speaker's name alone (<v Bob></v>) is not
  const lines = cues
    .filter(cue => !isBlank(cue.text))
    .map(cue => ({ ...cue, ...toLabelledText(cue.text) }))
    .filter(line => !isBlank(line.text));

  // Voice tags say who speaks: nothing else in such captions is a name
  if (lines.some(line => line.names.length > 0)) return lines;

  // Names written out count when a few lines have them, so that a lone
  // "Note:" in a lecture is not taken for a speaker
  const plain = lines.map(line => findPlainNames(line.text));
  if (plain.filter(names => names.length > 0).length < 2) return lines;

  return lines.map((line, index) => ({ ...line, names: plain[index] }));
};

export {
  findPlainNames,
  isName,
  toTranscriptLines,
};
