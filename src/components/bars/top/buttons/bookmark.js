import React from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Button from 'components/utils/button';
import { addBookmarkNow } from 'components/bookmarks/actions';
import layout from 'utils/layout';

const intlMessages = defineMessages({
  bookmark: {
    id: 'button.bookmark.aria',
    description: 'Aria label for the add bookmark button',
  },
});

const Bookmark = () => {
  const intl = useIntl();

  if (!layout.control) return null;

  return (
    <Button
      aria={intl.formatMessage(intlMessages.bookmark)}
      circle
      handleOnClick={() => addBookmarkNow(intl)}
      icon="bookmark"
    />
  );
};

export default Bookmark;
