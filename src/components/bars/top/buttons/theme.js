import React, { useEffect, useState } from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Button from 'components/utils/button';
import { controls as config } from 'config';
import { THEME } from 'utils/constants';
import layout from 'utils/layout';
import logger from 'utils/logger';

const intlMessages = defineMessages({
  theme: {
    id: 'button.theme.aria',
    description: 'Aria label for the theme button',
  },
});

const themeOptions = {};

const css = `
.video-js .vjs-volume-level,
.video-js .vjs-play-progress {
  background-color: white;
}
.tl-container {
  .tl-image {
    background-color: white !important;
  }
  .tl-background {
    background-color: #F9FAFB !important;
  }
}
`;

const ignoreInlineStyle = [
  'g > circle',
  'g > line',
  'g > path',
  'g > polygon',
  'g > polyline',
  'g > foreignObject',
  'path',
  'svg',
  'g',
  'line',
  'textarea',
  'rect',
  'circle',
  '.tl-html-container > div.tl-text-shape__wrapper.tl-text-shadow',
  '.tl-text',
  '.tl-text-input',
  '.tl-text-content',
  '.tl-text-label__inner',
  '.tl-note__container',
  '.tl-text.tl-text-content',
  '.tl-arrow-label',
  '.tl-arrow-label__inner',
];

const fixes = {
  css,
  ignoreInlineStyle,
};

const STORAGE_KEY = 'bbb-playback-theme';

const loadTheme = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === THEME.DARK;
  } catch (error) {
    return false;
  }
};

const saveTheme = (dark) => {
  try {
    localStorage.setItem(STORAGE_KEY, dark ? THEME.DARK : THEME.LIGHT);
  } catch (error) {
    logger.warn('theme', 'failed to save', error);
  }
};

// Dark Reader is only needed by viewers that opt into the dark theme, so it
// is kept out of the main bundle
const applyTheme = (dark) => import('darkreader').then(({ enable, disable }) => {
  dark ? enable(themeOptions, fixes) : disable();
}).catch(error => logger.error('theme', error));

const Theme = () => {
  const intl = useIntl();
  const enabled = layout.control && config.theme;
  const [dark, setDark] = useState(() => enabled && loadTheme());

  useEffect(() => {
    if (dark) applyTheme(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => {
    const nextDark = !dark;
    applyTheme(nextDark);
    saveTheme(nextDark);
    setDark(nextDark);
  };

  if (!enabled) return null;

  return (
    <Button
      aria={intl.formatMessage(intlMessages.theme)}
      circle
      handleOnClick={toggleTheme}
      icon={dark ? THEME.LIGHT : THEME.DARK}
    />
  );
};

export default Theme;
