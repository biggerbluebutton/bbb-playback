import React from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Key from './key';
import { shortcuts as config } from 'config';
import './index.scss';

const SHORTCUTS = [
  'fullscreen',
  'play',
  'section',
  'seek.backward',
  'seek.forward',
  'skip.next',
  'skip.previous',
  'swap',
];

// Single key controls, see addPlainShortcuts
const PLAIN_SHORTCUTS = [
  { label: 'play', keys: ['Space', 'K'] },
  { label: 'seek.backward', keys: ['←', 'J'] },
  { label: 'seek.forward', keys: ['→', 'L'] },
  { label: 'fullscreen', keys: ['F'] },
  { label: 'mute', keys: ['M'] },
];

const getCode = (shortcut) => {
  const path = shortcut.split('.');

  let code = config[path[0]];
  for (let i = 1; i < path.length; i++) {
    code = code[path[i]];
  }

  return code;
};

const intlMessages = defineMessages({
  title: {
    id: 'player.about.modal.shortcuts.title',
    description: 'Label for the about modal shortcuts title',
  },
  alt: {
    id: 'player.about.modal.shortcuts.alt',
    description: 'Label for the about modal shortcuts alt key',
  },
  shift: {
    id: 'player.about.modal.shortcuts.shift',
    description: 'Label for the about modal shortcuts shift key',
  },
  'fullscreen': {
    id: 'player.about.modal.shortcuts.fullscreen',
    description: 'Label for the about modal fullscreen shortcut',
  },
  'play': {
    id: 'player.about.modal.shortcuts.play',
    description: 'Label for the about modal play shortcut',
  },
  'section': {
    id: 'player.about.modal.shortcuts.section',
    description: 'Label for the about modal section shortcut',
  },
  'seek.backward': {
    id: 'player.about.modal.shortcuts.seek.backward',
    description: 'Label for the about modal seek backward shortcut',
  },
  'seek.forward': {
    id: 'player.about.modal.shortcuts.seek.forward',
    description: 'Label for the about modal seek forward shortcut',
  },
  'skip.next': {
    id: 'player.about.modal.shortcuts.skip.next',
    description: 'Label for the about modal skip next shortcut',
  },
  'skip.previous': {
    id: 'player.about.modal.shortcuts.skip.previous',
    description: 'Label for the about modal skip previous shortcut',
  },
  'swap': {
    id: 'player.about.modal.shortcuts.swap',
    description: 'Label for the about modal swap shortcut',
  },
  'mute': {
    id: 'player.about.modal.shortcuts.mute',
    description: 'Label for the about modal mute shortcut',
  },
  quick: {
    id: 'player.about.modal.shortcuts.quick',
    description: 'Heading for the single key shortcuts',
  },
  or: {
    id: 'player.about.modal.shortcuts.or',
    description: 'Separator between alternative keys',
  },
});

const Shortcuts = () => {
  const intl = useIntl();

  return (
    <div className="body-shortcuts">
      <div className="title">
        {intl.formatMessage(intlMessages.title)}
      </div>
      <div className="list">
        <div className="content">
          {config.plain !== false ? (
            <>
              <div className="group">
                {intl.formatMessage(intlMessages.quick)}
              </div>
              {PLAIN_SHORTCUTS.map(({ label, keys }) => (
                <div className="shortcut" key={`plain-${label}`}>
                  <div className="label">
                    {intl.formatMessage(intlMessages[label])}
                  </div>
                  <div className="keys">
                    {keys.map((key, index) => (
                      <React.Fragment key={key}>
                        {index > 0 ? (
                          <span className="or">{intl.formatMessage(intlMessages.or)}</span>
                        ) : null}
                        <Key code={key} />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
              <div className="group">
                {intl.formatMessage(intlMessages.alt)} + {intl.formatMessage(intlMessages.shift)}
              </div>
            </>
          ) : null}
          {SHORTCUTS.map(shortcut => {

            return (
              <div className="shortcut" key={shortcut}>
                <div className="label">
                  {intl.formatMessage(intlMessages[shortcut])}
                </div>
                <div className="keys">
                  <Key code={intl.formatMessage(intlMessages.alt)} />
                  <Key code={intl.formatMessage(intlMessages.shift)} />
                  <Key code={getCode(shortcut)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Shortcuts;
