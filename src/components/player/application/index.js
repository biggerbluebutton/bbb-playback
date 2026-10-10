import React, { useEffect, useState } from 'react';
import Content from './content';
import Control from './control';
import { EVENTS, ID } from 'utils/constants';
import storage from 'utils/data/storage';
import { isEmpty } from 'utils/data/validators';
import './index.scss';

const DEFAULT = ID.CHAT;

// Transcript only when the recording has captions
const getApplications = () => [
  ID.CHAT,
  ID.NOTES,
  ...(isEmpty(storage.captions) ? [] : [ID.TRANSCRIPT]),
  ID.BOOKMARKS,
];

const Application = () => {
  const [current, setCurrent] = useState(DEFAULT);
  const [focus, setFocus] = useState(null);
  const [applications] = useState(getApplications);

  // Other parts of the player can bring a panel up, e.g. a new bookmark
  useEffect(() => {
    const handleOpen = (event) => {
      const { panel, focus: target } = event.detail;
      if (!applications.includes(panel)) return;

      setCurrent(panel);
      setFocus(target || null);
    };

    document.addEventListener(EVENTS.OPEN_PANEL, handleOpen);

    return () => document.removeEventListener(EVENTS.OPEN_PANEL, handleOpen);
  }, [applications]);

  const toggleApplication = (application) => {
    if (current !== application) {
      setCurrent(application);
      setFocus(null);
    }
  };

  return (
    <div className="application">
      <Control
        applications={applications}
        current={current}
        toggleApplication={toggleApplication}
      />
      <Content
        current={current}
        focus={focus}
      />
    </div>
  );
};

const areEqual = () => true;

export default React.memo(Application, areEqual);
