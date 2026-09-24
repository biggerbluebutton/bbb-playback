const chat = {
  align: 'bottom',
  scroll: true,
};

const controls = {
  about: true,
  fullscreen: true,
  search: true,
  section: true,
  swap: true,
  theme: true,
};

const date = { enabled: true };

const files = {
  alternates: 'presentation_text.json',
  captions: 'captions.json',
  chat: 'slides_new.xml',
  cursor: 'cursor.xml',
  metadata: 'metadata.xml',
  notes: 'notes.html',
  panzooms: 'panzooms.xml',
  polls: 'polls.json',
  screenshare: 'deskshare.xml',
  shapes: 'shapes.svg',
  tldraw: 'tldraw.json',
  videos: 'external_videos.json',
  layout: 'layout.xml',
};

const locale = { default: 'en' };

const medias = [
  'mp4',
  'webm',
];

const player = {
  rps: 10,
  rates: [0.5, 1, 1.25, 1.5, 1.75, 2],
};

const search = {
  length: {
    min: 3,
    max: 32,
  },
};

const shortcuts = {
  enabled: true,
  fullscreen: 'K',
  play: 'Enter',
  section: 'L',
  seek: {
    backward: 'ArrowLeft',
    forward: 'ArrowRight',
    seconds: 15,
  },
  skip: {
    next: 'ArrowUp',
    previous: 'ArrowDown',
  },
  swap: 'M',
};

const styles = {
  default: null,
  url: 'HOST',
  valid: [],
};

const thumbnails = {
  align: 'center',
  scroll: true,
};

// On-demand caption translation.
//
// When enabled, the closed-caption (CC) menu is populated with every language
// the player ships translations for. Selecting a language that does not already
// have a caption file translates the existing captions into it on the fly, using
// a LibreTranslate-compatible HTTP endpoint (POST { q, source, target, format }).
//
// `url` should point at a translation service you control; the default targets
// the public LibreTranslate instance, which requires an `apiKey`. `source` is the
// language the original captions are written in ('auto' lets the service detect
// it). `batchSize` caps how many cues are sent per request.
const translation = {
  enabled: true,
  url: 'https://libretranslate.com/translate',
  apiKey: '',
  source: 'auto',
  batchSize: 25,
};

export {
  chat,
  controls,
  date,
  files,
  locale,
  medias,
  player,
  search,
  shortcuts,
  styles,
  thumbnails,
  translation,
};
