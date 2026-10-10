import React, { useEffect, useRef, useState } from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Icon from 'components/utils/icon';
import bookmarks from 'utils/bookmarks';
import { EVENTS, ID } from 'utils/constants';
import storage from 'utils/data/storage';
import { formatTime } from 'utils/format';
import player from 'utils/player';
import { addBookmarkNow } from './actions';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.bookmarks.wrapper.aria',
    description: 'Aria label for the bookmarks panel',
  },
  add: {
    id: 'player.bookmarks.add',
    description: 'Button that bookmarks the current moment',
  },
  note: {
    id: 'player.bookmarks.note',
    description: 'Placeholder of a bookmark note',
  },
  remove: {
    id: 'player.bookmarks.remove',
    description: 'Aria label of the remove bookmark button',
  },
  jump: {
    id: 'player.bookmarks.jump',
    description: 'Aria label of the button that plays from a bookmark',
  },
  emptyTitle: {
    id: 'player.bookmarks.empty.title',
    description: 'Title shown when there are no bookmarks',
  },
  emptyText: {
    id: 'player.bookmarks.empty.text',
    description: 'Text shown when there are no bookmarks',
  },
});

const Note = ({ bookmark, focus, placeholder, recordId }) => {
  const [value, setValue] = useState(bookmark.note);
  const input = useRef();

  useEffect(() => setValue(bookmark.note), [bookmark.note]);

  useEffect(() => {
    if (focus && input.current) input.current.focus();
  }, [focus]);

  const commit = () => {
    if (value !== bookmark.note) bookmarks.update(recordId, bookmark.id, value.trim());
  };

  return (
    <input
      className="bookmark-note"
      dir="auto"
      maxLength={280}
      onBlur={commit}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.target.blur();
        if (event.key === 'Escape') {
          setValue(bookmark.note);
          event.stopPropagation();
        }
      }}
      placeholder={placeholder}
      ref={input}
      type="text"
      value={value}
    />
  );
};

const Bookmarks = ({ focus }) => {
  const intl = useIntl();
  const recordId = storage.metadata ? storage.metadata.id : null;
  const [items, setItems] = useState(() => bookmarks.list(recordId));

  useEffect(() => {
    const handleChange = () => setItems(bookmarks.list(recordId));
    document.addEventListener(EVENTS.BOOKMARKS, handleChange);

    return () => document.removeEventListener(EVENTS.BOOKMARKS, handleChange);
  }, [recordId]);

  const jump = (time) => {
    if (player.primary) player.primary.currentTime(time);
  };

  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      className="bookmarks-wrapper"
      id={ID.BOOKMARKS}
    >
      <div className="bookmarks-header">
        <button
          className="bookmarks-add"
          onClick={() => addBookmarkNow(intl)}
          type="button"
        >
          <Icon name="bookmark" />
          {intl.formatMessage(intlMessages.add)}
          <kbd>B</kbd>
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="bookmarks-list">
          {items.map(bookmark => (
            <li className="bookmark" key={bookmark.id}>
              <button
                aria-label={intl.formatMessage(intlMessages.jump, { time: formatTime(bookmark.time) })}
                className="bookmark-time"
                onClick={() => jump(bookmark.time)}
                type="button"
              >
                <bdi>{formatTime(bookmark.time)}</bdi>
              </button>
              <Note
                bookmark={bookmark}
                focus={focus === bookmark.id}
                placeholder={intl.formatMessage(intlMessages.note)}
                recordId={recordId}
              />
              <button
                aria-label={intl.formatMessage(intlMessages.remove)}
                className="bookmark-remove"
                onClick={() => bookmarks.remove(recordId, bookmark.id)}
                title={intl.formatMessage(intlMessages.remove)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="bookmarks-empty">
          <span className="bookmarks-empty-icon"><Icon name="bookmark" /></span>
          <strong>{intl.formatMessage(intlMessages.emptyTitle)}</strong>
          <p>{intl.formatMessage(intlMessages.emptyText)}</p>
        </div>
      )}
    </div>
  );
};

export default Bookmarks;
