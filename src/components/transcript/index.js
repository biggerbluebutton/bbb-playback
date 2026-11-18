import React, {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import cx from 'classnames';
import Icon from 'components/utils/icon';
import { reflowCues } from 'utils/captions/reflow';
import { toTranscriptLines } from 'utils/captions/speakers';
import { parseVTT } from 'utils/captions/vtt';
import { EVENTS, ID } from 'utils/constants';
import { buildFileURL } from 'utils/data';
import storage from 'utils/data/storage';
import {
  buildTranscriptText,
  downloadFile,
  toFileName,
} from 'utils/export';
import { formatTime } from 'utils/format';
import logger from 'utils/logger';
import player from 'utils/player';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.transcript.wrapper.aria',
    description: 'Aria label for the transcript panel',
  },
  search: {
    id: 'player.transcript.search',
    description: 'Placeholder of the transcript search',
  },
  language: {
    id: 'player.transcript.language',
    description: 'Label of the transcript language picker',
  },
  loading: {
    id: 'player.transcript.loading',
    description: 'Shown while the transcript loads',
  },
  failed: {
    id: 'player.transcript.failed',
    description: 'Shown when the transcript could not be loaded',
  },
  empty: {
    id: 'player.transcript.empty',
    description: 'Shown when no line matches the search',
  },
  download: {
    id: 'player.transcript.download',
    description: 'Button that downloads the transcript',
  },
});

// The viewer's language when available, otherwise the first one
const getInitialLocale = (captions, locale) => {
  const language = (locale || '').split('-')[0];
  const match = captions.find(caption => caption.locale.split(/[-_]/)[0] === language);

  return (match || captions[0]).locale;
};

// After the viewer scrolls the list, it waits this long before following
// playback again
const FOLLOW_PAUSE = 5000;

const findActive = (cues, time) => {
  for (let index = cues.length - 1; index >= 0; index--) {
    if (cues[index].start <= time) return time <= cues[index].end + 1 ? index : -1;
  }

  return -1;
};

// Where the search first matches the text, as [start, end)
const findMatch = (text, query) => {
  if (!query) return null;

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return null;

  return [index, index + query.length];
};

// The text from start to end, with the part the search matched marked
const Marked = ({ end, match, start, text }) => {
  if (!match || match[1] <= start || match[0] >= end) return text.slice(start, end);

  const from = Math.max(start, match[0]);
  const to = Math.min(end, match[1]);

  return (
    <>
      {text.slice(start, from)}
      <mark>{text.slice(from, to)}</mark>
      {text.slice(to, end)}
    </>
  );
};

const COLON = /^[:：]$/;

// A line's words with the speakers' names in bold. Each name is isolated
// (<bdi>) so that a name in another script does not set the direction of
// the line, and its colon stays between the name and the words
const LineText = ({ names = [], query, text }) => {
  const match = findMatch(text, query);
  const parts = [];
  let position = 0;

  names.forEach(({ end, start }) => {
    if (start < position || end <= start) return;

    const label = COLON.test(text.charAt(end)) ? end + 1 : end;
    if (start > position) {
      parts.push(<Marked end={start} key={`t${position}`} match={match} start={position} text={text} />);
    }

    parts.push(
      <b className="transcript-speaker" key={`s${start}`}>
        <bdi><Marked end={end} match={match} start={start} text={text} /></bdi>
        <Marked end={label} match={match} start={end} text={text} />
      </b>
    );
    position = label;
  });

  if (position < text.length) {
    parts.push(<Marked end={text.length} key={`t${position}`} match={match} start={position} text={text} />);
  }

  return <Fragment>{parts}</Fragment>;
};

const Transcript = () => {
  const intl = useIntl();
  const captions = storage.captions || [];
  const [locale, setLocale] = useState(() => getInitialLocale(captions, intl.locale));
  const [cues, setCues] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const list = useRef();
  // The viewer reading: pointer over the list, or a scroll, swipe or key
  // press in it in the last few seconds (touch screens have no hover)
  const hovering = useRef(false);
  const lastTouched = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setCues(null);
    setFailed(false);

    fetch(buildFileURL(`caption_${locale}.vtt`))
      .then(response => {
        if (!response.ok) throw new Error(`transcript ${response.status}`);

        return response.text();
      })
      .then(text => {
        // Words only: captions can carry word timings and styles. Lines are
        // the same sentence-sized ones the player shows, with where the
        // speakers' names are
        if (!cancelled) setCues(toTranscriptLines(reflowCues(parseVTT(text))));
      })
      .catch(error => {
        logger.warn('transcript', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (!cues) return undefined;

    const update = (time) => setActive(findActive(cues, time));
    if (player.primary) update(player.primary.currentTime());

    const handleTimeUpdate = (event) => update(event.detail.time);
    document.addEventListener(EVENTS.TIME_UPDATE, handleTimeUpdate);

    return () => document.removeEventListener(EVENTS.TIME_UPDATE, handleTimeUpdate);
  }, [cues]);

  // Follows playback unless the viewer is reading elsewhere in the list
  useEffect(() => {
    const reading = hovering.current || Date.now() - lastTouched.current < FOLLOW_PAUSE;
    if (query || reading || active === -1 || !list.current) return;

    // Scrolls the list only, never the page around it
    const node = list.current.querySelector(`[data-index="${active}"]`);
    if (node) {
      const top = node.offsetTop - (list.current.clientHeight - node.offsetHeight) / 2;
      list.current.scrollTo({ behavior: 'smooth', top: Math.max(0, top) });
    }
  }, [active, query]);

  const lines = useMemo(() => {
    if (!cues) return [];

    const all = cues.map((cue, index) => ({ ...cue, index }));
    const trimmed = query.trim().toLowerCase();

    return trimmed ? all.filter(cue => cue.text.toLowerCase().includes(trimmed)) : all;
  }, [cues, query]);

  const touched = () => {
    lastTouched.current = Date.now();
  };

  const jump = (time) => {
    if (player.primary) player.primary.currentTime(time);
  };

  const download = () => {
    const { name } = storage.metadata || {};
    const language = (captions.find(caption => caption.locale === locale) || {}).locale || locale;

    downloadFile(
      toFileName(`${name || 'transcript'} (${language})`, 'txt'),
      buildTranscriptText({ cues, title: name || '' }),
    );
  };

  let body;
  if (failed) {
    body = <p className="transcript-message">{intl.formatMessage(intlMessages.failed)}</p>;
  } else if (!cues) {
    body = <p className="transcript-message">{intl.formatMessage(intlMessages.loading)}</p>;
  } else if (lines.length === 0) {
    body = <p className="transcript-message">{intl.formatMessage(intlMessages.empty, { query: query.trim() })}</p>;
  } else {
    body = (
      <ol
        className="transcript-lines"
        onKeyDown={touched}
        onMouseEnter={() => { hovering.current = true; }}
        onMouseLeave={() => { hovering.current = false; }}
        onTouchStart={touched}
        onWheel={touched}
        ref={list}
      >
        {lines.map(cue => (
          <li key={cue.index}>
            <button
              aria-current={cue.index === active ? 'true' : undefined}
              className={cx('transcript-line', { active: cue.index === active })}
              data-index={cue.index}
              onClick={() => jump(cue.start)}
              type="button"
            >
              <bdi className="transcript-time">{formatTime(cue.start)}</bdi>
              <span className="transcript-text" dir="auto">
                <LineText names={cue.names} query={query.trim()} text={cue.text} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      role="region"
      className="transcript-wrapper"
      id={ID.TRANSCRIPT}
    >
      <div className="transcript-tools">
        <div className="transcript-search">
          <Icon name="search" />
          <input
            aria-label={intl.formatMessage(intlMessages.search)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={intl.formatMessage(intlMessages.search)}
            type="search"
            value={query}
          />
        </div>
        {captions.length > 1 ? (
          <select
            aria-label={intl.formatMessage(intlMessages.language)}
            className="transcript-language"
            onChange={(event) => setLocale(event.target.value)}
            value={locale}
          >
            {captions.map(caption => (
              <option key={caption.locale} value={caption.locale}>{caption.localeName}</option>
            ))}
          </select>
        ) : null}
        {cues && cues.length > 0 ? (
          <button
            aria-label={intl.formatMessage(intlMessages.download)}
            className="transcript-download"
            onClick={download}
            title={intl.formatMessage(intlMessages.download)}
            type="button"
          >
            <Icon name="download" />
          </button>
        ) : null}
      </div>
      {body}
    </div>
  );
};

export default Transcript;
