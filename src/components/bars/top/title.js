import React from 'react';
import PropTypes from 'prop-types';
import {
  defineMessages,
  useIntl,
  FormattedDate,
} from 'react-intl';
import {
  controls as config,
  date,
} from 'config';
import { formatTime } from 'utils/format';
import storage from 'utils/data/storage';
import layout from 'utils/layout';
import './index.scss';

const intlMessages = defineMessages({
  about: {
    id: 'button.about.aria',
    description: 'Aria label for the about button',
  },
  participants: {
    id: 'player.meta.participants',
    description: 'Number of participants of the recorded meeting',
  },
});

const propTypes = { openAbout: PropTypes.func };

const defaultProps = { openAbout: () => {} };

const getDuration = ({ start, end }) => {
  const duration = (end - start) / 1000;

  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const Title = ({ openAbout }) => {
  const intl = useIntl();
  const metadata = storage.metadata || {};
  const { name, participants, start } = metadata;
  const duration = getDuration(metadata);

  const details = [];
  if (date.enabled && start) {
    details.push(
      <FormattedDate
        day="numeric"
        key="date"
        month="short"
        value={new Date(start)}
        year="numeric"
      />
    );
  }
  if (duration) details.push(<bdi key="duration">{formatTime(duration)}</bdi>);
  if (Number.isFinite(participants) && participants > 0) {
    details.push(
      <span key="participants">
        {intl.formatMessage(intlMessages.participants, { count: participants })}
      </span>
    );
  }

  const content = (
    <>
      <span className="title">{name}</span>
      {details.length > 0 ? (
        <span className="meta">
          {details.map((detail, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <span aria-hidden="true" className="separator">·</span> : null}
              {detail}
            </React.Fragment>
          ))}
        </span>
      ) : null}
    </>
  );

  const interactive = layout.control && config.about;
  if (!interactive) {

    return <div className="title-block">{content}</div>;
  }

  return (
    <button
      aria-haspopup="dialog"
      aria-label={`${name} – ${intl.formatMessage(intlMessages.about)}`}
      className="title-block interactive"
      onClick={openAbout}
      title={name}
      type="button"
    >
      {content}
    </button>
  );
};

Title.propTypes = propTypes;
Title.defaultProps = defaultProps;

export default Title;
