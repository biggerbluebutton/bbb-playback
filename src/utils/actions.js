import { getCurrentDataIndex } from 'utils/data';
import storage from 'utils/data/storage';
import player from 'utils/player';
import { dispatchTimeUpdate } from 'utils/events';

const play = () => {
  if (player.primary.paused()) {
    player.primary.play();
  } else {
    player.primary.pause();
  }
};

const search = (text, thumbnails) => {
  const result = [];

  const value = text.toLowerCase();
  thumbnails.forEach((thumbnail, index) => {
    const { alt } = thumbnail;

    if (alt.toLowerCase().indexOf(value) !== -1) {
      result.push(index);
    }
  });

  return result;
};

const seek = (seconds) => {
  const min = 0;
  const max = player.primary.duration();
  const time = player.primary.currentTime() + seconds;

  let nextTime;

  if (time < min) {
    nextTime = min;
  } else if (time > max) {
    nextTime = max;
  } else {
    nextTime = time;
  }

  if (typeof nextTime === 'number') {
    player.primary.currentTime(nextTime);
    dispatchTimeUpdate(nextTime);
  }
};

const skip = (change) => {
  const min = 0;
  const max = storage.slides.length - 1;
  const time = player.primary.currentTime();

  const current = getCurrentDataIndex(storage.slides, time);
  if (current === -1) return null;

  const index = current + change;

  let timestamp;
  if (index < min) {
    timestamp = storage.slides[min].timestamp;
  } else if (index > max) {
    timestamp = storage.slides[max].timestamp;
  } else {
    timestamp = storage.slides[index].timestamp;
  }

  if (typeof timestamp !== 'undefined') {
    player.primary.currentTime(timestamp);
    dispatchTimeUpdate(timestamp);
  }
};

export {
  play,
  search,
  seek,
  skip,
};
