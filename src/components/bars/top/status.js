import React, { useEffect, useRef, useState } from 'react';
import Icon from 'components/utils/icon';
import { EVENTS } from 'utils/constants';
import storage from 'utils/data/storage';
import { formatTime } from 'utils/format';

// Time updates only flow while the media plays
const IDLE = 600;

const getDuration = () => {
  const { start, end } = storage.metadata || {};
  const duration = (end - start) / 1000;

  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

// Live playback position with an equalizer that moves while playing
const Status = () => {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const idle = useRef();
  const duration = useRef(getDuration());

  useEffect(() => {
    const handleTimeUpdate = (event) => {
      setTime(Math.floor(event.detail.time));
      setPlaying(true);
      clearTimeout(idle.current);
      idle.current = setTimeout(() => setPlaying(false), IDLE);
    };

    document.addEventListener(EVENTS.TIME_UPDATE, handleTimeUpdate);

    return () => {
      document.removeEventListener(EVENTS.TIME_UPDATE, handleTimeUpdate);
      clearTimeout(idle.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={playing ? 'playback-status playing' : 'playback-status'}
    >
      {playing ? (
        <span className="equalizer">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <span className="paused">
          <Icon name="pause" />
        </span>
      )}
      <bdi className="playback-time">
        {formatTime(time)}
        {duration.current ? <span className="playback-duration"> / {formatTime(duration.current)}</span> : null}
      </bdi>
    </div>
  );
};

export default Status;
