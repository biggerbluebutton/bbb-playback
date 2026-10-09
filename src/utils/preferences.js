import logger from './logger';

const STORAGE_KEY = 'bbb-playback-preferences';

const load = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));

    return value && typeof value === 'object' ? value : {};
  } catch (error) {
    return {};
  }
};

const save = (changes) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), ...changes }));
  } catch (error) {
    logger.warn('preferences', 'failed to save', error);
  }
};

const isVolume = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

// Volume, mute and speed survive between recordings
const getMediaPreferences = (rates = []) => {
  const { muted, rate, volume } = load();

  return {
    muted: muted === true,
    rate: rates.includes(rate) ? rate : null,
    volume: isVolume(volume) ? volume : null,
  };
};

const saveMediaPreferences = ({ muted, rate, volume }) => {
  const changes = {};
  if (typeof muted === 'boolean') changes.muted = muted;
  if (Number.isFinite(rate)) changes.rate = rate;
  if (isVolume(volume)) changes.volume = volume;

  save(changes);
};

export {
  getMediaPreferences,
  saveMediaPreferences,
};
