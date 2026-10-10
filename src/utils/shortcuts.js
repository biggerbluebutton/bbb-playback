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

// Single key controls, like most video sites. They only apply when nothing
// else would use the key: text fields, buttons and the video.js controls
// keep their own keyboard behavior
const PLAIN_KEYS = {
  ' ': 'play',
  k: 'play',
  j: 'backward',
  arrowleft: 'backward',
  l: 'forward',
  arrowright: 'forward',
  f: 'fullscreen',
  m: 'mute',
  b: 'bookmark',
  // Typed with Shift on most layouts
  '<': 'slower',
  '>': 'faster',
  '?': 'help',
};

const SHIFTED_KEYS = ['<', '>', '?'];

const INTERACTIVE = 'a, button, [role="button"], [role="slider"], .vjs-control-bar';

const isFreeTarget = (target) => {
  if (!target || target === document.body || target === document.documentElement) return true;
  if (isEditable(target)) return false;
  if (typeof target.closest !== 'function') return true;
  if (target.closest(INTERACTIVE)) return false;

  // Lists keep their own scrolling with the arrow keys
  return !target.closest('[tabindex]') || !!target.closest('.video-js');
};

const getPlainAction = (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (typeof event.key !== 'string') return null;
  if (event.shiftKey && !SHIFTED_KEYS.includes(event.key)) return null;
  if (!isFreeTarget(event.target)) return null;

  return PLAIN_KEYS[event.key.toLowerCase()] || null;
};

const addPlainShortcuts = (actions) => {
  if (!config.enabled || config.plain === false) return () => {};

  const handler = (event) => {
    const name = getPlainAction(event);
    if (!name || typeof actions[name] !== 'function') return;

    event.preventDefault();
    actions[name]();
  };

  document.addEventListener('keydown', handler);

  return () => document.removeEventListener('keydown', handler);
};

export {
  addPlainShortcuts,
  getPlainAction,
  matches,
};
