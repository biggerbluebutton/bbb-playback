import React from 'react';
import Bookmarks from 'components/bookmarks';
import Chat from 'components/chat';
import Notes from 'components/notes';
import Transcript from 'components/transcript';
import { ID } from 'utils/constants';

const Content = ({ current, focus }) => {
  switch (current) {
    case ID.CHAT:

      return <Chat />;
    case ID.NOTES:

      return <Notes />;
    case ID.TRANSCRIPT:

      return <Transcript />;
    case ID.BOOKMARKS:

      return <Bookmarks focus={focus} />;
    default:

      return null;
  }
};

const areEqual = (prevProps, nextProps) => {
  if (prevProps.current !== nextProps.current) return false;

  if (prevProps.focus !== nextProps.focus) return false;

  return true;
};

export default React.memo(Content, areEqual);
