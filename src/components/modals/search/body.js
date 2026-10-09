import React from 'react';
import PropTypes from 'prop-types';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import cx from 'classnames';
import Thumbnails from 'components/thumbnails';
import { search as config } from 'config';
import './index.scss';

const intlMessages = defineMessages({
  input: {
    id: 'player.search.modal.subtitle',
    description: 'Label for the search input',
  },
});

const propTypes = {
  handleOnChange: PropTypes.func,
  handleOnSubmit: PropTypes.func,
  search: PropTypes.array,
};

const defaultProps = {
  handleOnChange: () => {},
  handleOnSubmit: () => {},
  search: [],
};

const Body = ({
  handleOnChange,
  handleOnSubmit,
  search,
}) => {
  const intl = useIntl();
  const label = intl.formatMessage(intlMessages.input);

  return (
    <div className="search-body">
      <input
        aria-label={label}
        maxLength={config.length.max}
        minLength={config.length.min}
        onChange={(event) => handleOnChange(event)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleOnSubmit();
        }}
        type="search"
      />
      <div className={cx('result', { active: true })}>
        <Thumbnails
          currentDataIndex={0}
          handleSearch={null}
          player={null}
          search={search}
        />
      </div>
    </div>
  );
};

Body.propTypes = propTypes;
Body.defaultProps = defaultProps;

export default Body;
