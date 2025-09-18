import { player as playerConfig } from 'config';
import { EVENTS } from 'utils/constants';
import { getFrequency } from 'utils/params';

const DEFAULT_TIME_UPDATE_INTERVAL_MS = 3000;

const isPositiveNumber = (value) => (
  typeof value === 'number'
  && !Number.isNaN(value)
  && value > 0
);

const getTimeUpdateIntervalMs = () => {
  let frequency = null;

  if (typeof window !== 'undefined') {
    frequency = getFrequency();
  }

  if (isPositiveNumber(frequency)) {
    return 1000 / frequency;
  }

  const { timeUpdateIntervalSeconds, rps } = playerConfig || {};

  if (isPositiveNumber(timeUpdateIntervalSeconds)) {
    return timeUpdateIntervalSeconds * 1000;
  }

  if (isPositiveNumber(rps)) {
    return 1000 / rps;
  }

  return DEFAULT_TIME_UPDATE_INTERVAL_MS;
};

const dispatchTimeUpdate = (time) => {
  const event = new CustomEvent(EVENTS.TIME_UPDATE, { detail: { time }});
  document.dispatchEvent(event);
};

export {
  getTimeUpdateIntervalMs,
  dispatchTimeUpdate,
};
