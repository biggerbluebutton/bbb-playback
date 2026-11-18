import { reflowCues } from './reflow';
import {
  findPlainNames,
  isName,
  toTranscriptLines,
} from './speakers';
import {
  getSpeakers,
  parseVTT,
  toLabelledText,
  toPlainText,
  toSpokenText,
} from './vtt';

const options = {
  enabled: true,
  threshold: 4,
  characters: 84,
  duration: 7,
  gap: 1.5,
};

// The names in a line, as text
const namesOf = ({ names, text }) => names.map(({ start, end }) => text.slice(start, end));

it('finds the speakers of a caption', () => {
  expect(getSpeakers('<v Bob>Hello</v>')).toEqual(['Bob']);
  expect(getSpeakers('<v.loud Omar  Ali>Hi</v>\n<v Sara>Yes')).toEqual(['Omar Ali', 'Sara']);
  expect(getSpeakers('Hello <b>there</b>')).toEqual([]);
  expect(getSpeakers('<v >Hello')).toEqual([]);
  expect(getSpeakers(null)).toEqual([]);
});

it('labels the words a caption shows with where its speakers are', () => {
  expect(toLabelledText('<v Bob>Hello</v>')).toEqual({
    names: [{ start: 0, end: 3 }],
    text: 'Bob: Hello',
  });

  const two = toLabelledText('<v Omar Ali>Sales grew.</v>\n<v.host Sara>Great <i>news</i>!</v>');
  expect(two.text).toEqual('Omar Ali: Sales grew.\nSara: Great news!');
  expect(namesOf(two)).toEqual(['Omar Ali', 'Sara']);

  // Entities in a name become characters too
  const entity = toLabelledText('<v Dr. Lee &amp; Co>Any questions?');
  expect(entity.text).toEqual('Dr. Lee & Co: Any questions?');
  expect(namesOf(entity)).toEqual(['Dr. Lee & Co']);

  // Word timings and styles go, the name stays where it is
  const timed = toLabelledText('<v Omar><i>Thank you</i> for <00:00:17.000>joining');
  expect(timed.text).toEqual('Omar: Thank you for joining');
  expect(namesOf(timed)).toEqual(['Omar']);

  expect(toLabelledText('No speaker here')).toEqual({ names: [], text: 'No speaker here' });
  expect(toLabelledText(undefined)).toEqual({ names: [], text: '' });
});

it('names a speaker once while they keep talking', () => {
  const same = toLabelledText('<v Bob>Hello</v> <v Bob>everyone</v> <v Alice>Hi</v> <v Bob>again');
  expect(same.text).toEqual('Bob: Hello everyone Alice: Hi Bob: again');
  expect(namesOf(same)).toEqual(['Bob', 'Alice', 'Bob']);
});

it('gives the same words as the plain text', () => {
  [
    '<v Bob>Hello</v>',
    '  <v Bob>  Hello   there </v>  ',
    '<v Omar Ali>Sales grew.</v>\n<v Sara>Great!</v>',
    '<v Bob>Hello</v> <v Bob>everyone</v>',
    '<v Dr. Lee &amp; Co>Any &lt;questions&gt;?',
    '<v Bob>\n&nbsp;\nHello',
    '<v >Hello',
    'Plain: text\n- Bob: hi',
    'مرحبا <v سارة>بكم',
    'text with \ue000private\ue001 marks',
  ].forEach((caption) => {
    expect(toLabelledText(caption).text).toEqual(toPlainText(caption));
  });
});

it('leaves the names out of the words sent for translation', () => {
  expect(toSpokenText('<v Bob>Hello</v>')).toEqual('Hello');
  expect(toSpokenText('<v Omar Ali>Sales grew.</v>\n<v Sara>Great <i>news</i>!')).toEqual('Sales grew.\nGreat news!');
  expect(toSpokenText('Yes<v Alice>No')).toEqual('Yes No');
  expect(toSpokenText('<v Dr. Lee &amp; Co>Any &lt;questions&gt;?')).toEqual('Any <questions>?');
  expect(toSpokenText('No speaker here')).toEqual('No speaker here');
  expect(toSpokenText(null)).toEqual('');
});

it('tells names from the start of a sentence', () => {
  ['Bob', 'Omar Ali', 'Dr. Jane Smith', 'SPEAKER_01', 'Speaker 1', 'María de la Cruz',
    'Ludwig van Beethoven', "O'Brien", 'Jean-Luc', 'سارة', '张三', 'Lee & Co'].forEach((name) => {
    expect(isName(name)).toEqual(true);
  });

  ['The answer is', 'So we have', 'La respuesta es', 'here', 'speaker one', '12', '10',
    'Bob, Alice', 'Why?', 'One two three four five six', 'Bob ', 'x'.repeat(41)].forEach((name) => {
    expect(isName(name)).toEqual(false);
  });
});

it('finds names written at the start of lines', () => {
  const at = (text) => namesOf({ names: findPlainNames(text), text });

  expect(at('Bob: Hello')).toEqual(['Bob']);
  expect(at('- Omar: Yes.\n- Sara: No.')).toEqual(['Omar', 'Sara']);
  expect(at('>> Dr. Jane Smith: Welcome')).toEqual(['Dr. Jane Smith']);
  expect(at('张三：你好')).toEqual(['张三']);
  expect(at('سارة: مرحبا')).toEqual(['سارة']);
  expect(at('Bob:')).toEqual(['Bob']);

  // Not names
  expect(at('The answer is: yes')).toEqual([]);
  expect(at('Visit https://example.com today')).toEqual([]);
  expect(at('We start at 10:30 today')).toEqual([]);
  expect(at('Well, Bob: fine')).toEqual([]);
  expect(at('Hello everyone')).toEqual([]);
});

it('takes the speakers from voice tags when the captions have them', () => {
  const lines = toTranscriptLines(parseVTT([
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:03.000',
    '<v Omar>Welcome everyone.',
    '',
    '00:00:03.000 --> 00:00:06.000',
    'Note: this line has no speaker.',
    '',
    '00:00:06.000 --> 00:00:09.000',
    '<v Sara>Thanks.',
    '',
  ].join('\n')));

  expect(lines.map(line => line.text)).toEqual([
    'Omar: Welcome everyone.',
    'Note: this line has no speaker.',
    'Sara: Thanks.',
  ]);
  expect(lines.map(namesOf)).toEqual([['Omar'], [], ['Sara']]);
  expect(lines.map(({ start, end }) => [start, end])).toEqual([[0, 3], [3, 6], [6, 9]]);
});

it('takes the speakers written out when a few lines have them', () => {
  const vtt = (...texts) => parseVTT(['WEBVTT', ''].concat(texts.map((text, index) => (
    `00:00:0${index}.000 --> 00:00:0${index + 1}.000\n${text}\n`
  ))).join('\n'));

  const written = toTranscriptLines(vtt(
    'Omar: Welcome to the review.',
    'Sara: Thanks Omar.',
    'La respuesta es: sí, seguimos.',
    '- Omar: Sales grew.\n- Sara: Great!',
  ));

  expect(written.map(namesOf)).toEqual([['Omar'], ['Sara'], [], ['Omar', 'Sara']]);

  // A lone label is not enough to call it a speaker
  const lone = toTranscriptLines(vtt('Note: this is important.', 'We start now.'));
  expect(lone.map(namesOf)).toEqual([[], []]);

  // Captions without names
  expect(toTranscriptLines(vtt('Hello everyone.', 'Welcome.')).map(namesOf)).toEqual([[], []]);
  expect(toTranscriptLines([])).toEqual([]);
});

it('skips lines with nothing to read', () => {
  const lines = toTranscriptLines([
    { start: 0, end: 1, text: '<v Bob></v>' },
    { start: 1, end: 2, text: '&nbsp;' },
    { start: 2, end: 3, text: '<v Bob>Hi' },
  ]);

  expect(lines.map(line => line.text)).toEqual(['Bob: Hi']);
});

it('starts a new line for each speaker in word-level captions', () => {
  // Word-level captions with a voice tag on every cue
  const cues = parseVTT([
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:00.600',
    '<v Omar>Bonjour',
    'à',
    '',
    '00:00:00.600 --> 00:00:01.200',
    '<v Omar>tous',
    '',
    '00:00:01.200 --> 00:00:01.800',
    '<v Omar>et',
    'bienvenue.',
    '',
    '00:00:01.800 --> 00:00:02.400',
    '<v Sara>Merci',
    'Omar',
    '',
    '00:00:02.400 --> 00:00:03.000',
    '<v Sara>pour',
    'tout.',
    '',
    '00:00:03.000 --> 00:00:03.600',
    '<v Omar>Commençons',
    'maintenant',
    '',
  ].join('\n'));

  const reflowed = reflowCues(cues, options);
  expect(reflowed.map(({ start, end }) => [start, end])).toEqual([[0, 1.8], [1.8, 3], [3, 3.6]]);
  expect(reflowed.map(cue => cue.cues.length)).toEqual([3, 2, 1]);

  const lines = toTranscriptLines(reflowed);
  expect(lines.map(line => line.text)).toEqual([
    'Omar: Bonjour à tous et bienvenue.',
    'Sara: Merci Omar pour tout.',
    'Omar: Commençons maintenant',
  ]);
  expect(lines.map(namesOf)).toEqual([['Omar'], ['Sara'], ['Omar']]);
});
