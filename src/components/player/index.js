import React, { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import { shortcuts as config } from 'config';
import Application from './application';
import Content from './content';
import Media from './media';
import Modal from './modal';
import BottomBar from 'components/bars/bottom';
import TopBar from 'components/bars/top';
import Toast from 'components/toast';
import {
  play,
  seek,
  skip,
} from 'utils/actions';
import { ID } from 'utils/constants';
import layout from 'utils/layout';
import player from 'utils/player';
import Shortcuts, { addPlainShortcuts } from 'utils/shortcuts';
import { useLayoutSwap } from 'components/utils/hooks';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.wrapper.aria',
    description: 'Aria label for the player wrapper',
  },
});

const Player = () => {
  const intl = useIntl();

  const [fullscreen, setFullscreen] = useState(false);
  const [modal, setModal] = useState('');
  const [search, setSearch] = useState([]);
  const [section, setSection] = useState(layout.section);
  const [swap, setSwap] = useState(layout.swap);

  const shortcuts = useRef();

  const { showPresentation } = useLayoutSwap();
  const hidePresentation = showPresentation === false;

  useEffect(() => {
    if (showPresentation === false) {
      setSwap(true);
    } else {
      setSwap(false);
    }
  }, [showPresentation]);

  useEffect(() => {
    const { seconds } = config.seek;

    const actions = {
      fullscreen: () => setFullscreen(prevFullscreen => !prevFullscreen),
      play: () => play(),
      section: () => setSection(prevSection => !prevSection),
      seek: {
        backward: () => seek(-seconds),
        forward: () => seek(+seconds),
      },
      skip: {
        next: () => skip(+1),
        previous: () => skip(-1),
      },
      swap: () => setSwap(prevSwap => !prevSwap),
    };

    shortcuts.current = new Shortcuts(actions);

    const removePlainShortcuts = addPlainShortcuts({
      backward: actions.seek.backward,
      forward: actions.seek.forward,
      fullscreen: actions.fullscreen,
      mute: () => {
        if (player.primary) player.primary.muted(!player.primary.muted());
      },
      play: actions.play,
    });

    return () => {
      if (shortcuts.current) shortcuts.current.destroy();
      removePlainShortcuts();
    };
  }, []);

  const style = {
    'fullscreen-content': fullscreen,
    'hidden-section': !section,
    'single-content': layout.single || hidePresentation,
  };

  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      className={cx('player-wrapper', style)}
      id={ID.PLAYER}
    >
      <TopBar
        openModal={(type) => setModal(type)}
        section={section}
        toggleSection={() => setSection(prevSection => !prevSection)}
        toggleSwap={() => setSwap(prevSwap => !prevSwap)}
        hidePresentation={hidePresentation}
      />
      <Media
        fullscreen={fullscreen}
        swap={swap}
        toggleFullscreen={() => setFullscreen(prevFullscreen => !prevFullscreen)}
        hidePresentation={hidePresentation}
      />
      <Application />
      <Content
        fullscreen={fullscreen}
        handleSearch={(value) => setSearch(value)}
        search={search}
        swap={swap}
        toggleFullscreen={() => setFullscreen(prevFullscreen => !prevFullscreen)}
        hidePresentation={hidePresentation}
      />
      <BottomBar />
      <Modal
        handleClose={() => setModal('')}
        handleSearch={(value) => setSearch(value)}
        modal={modal}
      />
      <Toast />
    </div>
  );
};

export default Player;
