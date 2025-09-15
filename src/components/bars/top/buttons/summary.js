import React from 'react';
import { defineMessages, useIntl } from 'react-intl';
import Button from 'components/utils/button';
import { ID } from 'utils/constants';

const intlMessages = defineMessages({
  summary: {
    id: 'button.summary.aria',
    description: 'Aria label for the summary button',
  },
});

const Summary = () => {
  const intl = useIntl();
  const handleOnClick = () => {
    window.open('https://google.com', '_blank');
  };

  return (
    <Button
      aria={intl.formatMessage(intlMessages.summary)}
      circle
      handleOnClick={handleOnClick}
      icon={ID.SUMMARY}
    />
  );
};

export default Summary;
