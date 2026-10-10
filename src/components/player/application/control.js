import React from 'react';
import cx from 'classnames';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Icon from 'components/utils/icon';
import { ID } from 'utils/constants';
import layout from 'utils/layout';
import './index.scss';

const intlMessages = defineMessages({
  [ID.CHAT]: {
    id: 'button.chat.aria',
    description: 'Aria label for the chat button',
  },
  [ID.NOTES]: {
    id: 'button.notes.aria',
    description: 'Aria label for the notes button',
  },
  [ID.CHAPTERS]: {
    id: 'button.chapters.aria',
    description: 'Aria label for the chapters button',
  },
  [ID.TRANSCRIPT]: {
    id: 'button.transcript.aria',
    description: 'Aria label for the transcript button',
  },
  [ID.BOOKMARKS]: {
    id: 'button.bookmarks.aria',
    description: 'Aria label for the bookmarks button',
  },
});

const ICONS = {
  [ID.BOOKMARKS]: 'bookmark',
  [ID.CHAPTERS]: 'chapters',
  [ID.TRANSCRIPT]: 'captions',
};

const Control = ({
  applications,
  current,
  toggleApplication,
}) => {
  const intl = useIntl();

  if (!layout.control) return null;

  return (
    <div className="application-control">
      {applications.map(application => {
        const active = current === application;
        const label = intl.formatMessage(intlMessages[application]);

        return (
          <button
            aria-label={label}
            aria-pressed={active}
            className={cx('application-icon', { inactive: !active })}
            key={application}
            onClick={() => active ? null : toggleApplication(application)}
            title={label}
            type="button"
          >
            <Icon name={ICONS[application] || application} />
          </button>
        );
      })}
    </div>
  );
};

const areEqual = (prevProps, nextProps) => {
  return prevProps.current === nextProps.current;
};

export default React.memo(Control, areEqual);
