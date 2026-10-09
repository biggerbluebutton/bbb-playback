import React, { Suspense, lazy } from 'react';
import cx from 'classnames';
import Presentation from 'components/presentation';
import { getTldrawBbbVersion, isTldrawWhiteboard as isTldraw } from 'utils/tldraw';
import { useCurrentInterval, useLayoutSwap } from 'components/utils/hooks';
import Screenshare from 'components/screenshare';
import Thumbnails from 'components/thumbnails';
import FullscreenButton from 'components/player/buttons/fullscreen';
import { LAYOUT } from 'utils/constants';
import { isEqual } from 'utils/data/validators';
import layout from 'utils/layout';
import storage from 'utils/data/storage';
import './index.scss';
import { gte as semverGte } from 'semver';

// The whiteboard renderers are heavy and a recording only ever needs one of
// them, so each is split into its own chunk and fetched on demand
const TldrawPresentation = lazy(() => import('components/tldraw'));
const TldrawPresentationV2 = lazy(() => import('components/tldraw_v2'));

const PresentationFallback = () => (
  <div className="presentation-wrapper">
    <div className={cx('presentation', 'logo')} />
  </div>
);

const Content = ({
  fullscreen,
  handleSearch,
  search,
  swap,
  toggleFullscreen,
  hidePresentation,
}) => {
  const {
    index,
  } = useCurrentInterval(storage.tldraw);

  const { showScreenshare } = useLayoutSwap();

  if (layout.single || hidePresentation) return null;

  const isTldrawWhiteboard = isTldraw();

  let presentation;

  if (isTldrawWhiteboard) {
    const bbbVersion = getTldrawBbbVersion(index);

    if (bbbVersion && semverGte(bbbVersion, '3.0.0')) {
      presentation = <TldrawPresentationV2 />;
    }
    else {
      presentation = <TldrawPresentation />;
    }
  }
  else {
    presentation = <Presentation />;
  }

  return (
    <div className={cx('content', { 'swapped-content': swap })}>
      <FullscreenButton
        content={LAYOUT.CONTENT}
        fullscreen={fullscreen}
        swap={swap}
        toggleFullscreen={toggleFullscreen}
      />
      <div className="top-content">
        <Suspense fallback={<PresentationFallback />}>
          {presentation}
        </Suspense>
        {layout.screenshare ? (
          // video-js doesn't mount properly when not mounted in time
          <span style={!showScreenshare ? {
            display: 'none',
            width: '100%',
            height: '100%'
          } : {
            width: '100%',
            height: '100%',
          }}>
            <Screenshare />
          </span>
        ) : null}
      </div>
      <div className={cx('bottom-content', { 'inactive': fullscreen })}>
        <Thumbnails
          handleSearch={handleSearch}
          interactive
          search={search}
        />
      </div>
    </div>
  );
};

const areEqual = (prevProps, nextProps) => {
  if (prevProps.fullscreen !== nextProps.fullscreen) return false;

  if (prevProps.swap !== nextProps.swap) return false;

  if (prevProps.hidePresentation !== nextProps.hidePresentation) return false;

  if (!isEqual(prevProps.search, nextProps.search)) return false;

  return true;
};

export default React.memo(Content, areEqual);
