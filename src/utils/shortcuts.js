import { shortcuts as config } from 'config';
import logger from './logger';

const EDITABLE = ['INPUT', 'SELECT', 'TEXTAREA'];

const isEditable = (target) => {
  if (!target) return false;

  return EDITABLE.includes(target.tagName) || target.isContentEditable === true;
};

// With Alt pressed some layouts (e.g. macOS) report a different character
// in event.key, so the physical key in event.code is checked as well
const matches = (event, key) => {
  if (event.key === key) return true;

  if (key.length === 1) {
    if (typeof event.key === 'string' && event.key.toUpperCase() === key.toUpperCase()) return true;

    return event.code === `Key${key.toUpperCase()}` || event.code === `Digit${key}`;
  }

  return event.code === key;
};

export default class Shortcuts {
  constructor(actions) {
    this.enabled = config.enabled;
    this.listeners = [];

    if (!this.enabled) {
      logger.debug('shortcuts', 'disabled');
    } else {
      this.init(actions);
    }
  }

  init(actions) {
    for (let prop in actions) {
      const value = actions[prop];
      if (typeof value === 'function') {
        const key = config[prop];
        this.add(key, value);
      } else {
        for (let p in value) {
          const k = config[prop][p];
          const v = value[p];
          this.add(k, v);
        }
      }
    }
  }

  add(key, action) {
    if (!key || typeof key !== 'string') {
      logger.warn('shortcuts', 'invalid', 'key');
      return null;
    } else if (key.length === 0) {
      return null;
    }

    if (!action || typeof action !== 'function') {
      logger.warn('shortcuts', 'invalid', 'action');
      return null;
    }

    const handler = (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;

      if (isEditable(e.target)) return;

      if (matches(e, key)) {
        e.preventDefault();
        action();
      }
    };

    document.addEventListener('keydown', handler);
    this.listeners.push(handler);
  }

  destroy() {
    this.listeners.forEach(listener => {
      document.removeEventListener('keydown', listener);
    });
    this.listeners = [];
  }
}

export { matches };
