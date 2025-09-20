import React, { useEffect, useRef } from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import cx from 'classnames';
import videojs from 'video.js/core.es.js';
import { useCurrentContent } from 'components/utils/hooks';
import { ID } from 'utils/constants';
import { buildFileURL } from 'utils/data';
import logger from 'utils/logger';
import storage from 'utils/data/storage';
import player from 'utils/player';
import { parseCaptionsData, setupLazyCaptions } from 'utils/captions';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.screenshare.wrapper.aria',
    description: 'Aria label for the screenshare wrapper',
  },
});

const buildSources = () => {
  return [
    {
      src: buildFileURL('deskshare/deskshare.mp4'),
      type: 'video/mp4',
    }, {
      src: buildFileURL('deskshare/deskshare.webm'),
      type: 'video/webm',
    },
  ].filter(source => storage.media.find(m => source.type.includes(m)));
};

const buildOptions = (sources) => {
  return {
    controls: false,
    fill: true,
    sources: sources.current,
    html5: {
      nativeTextTracks: true,
    },
  };
};

const Screenshare = () => {
  const intl = useIntl();
  const currentContent = useCurrentContent();
  const {
    locales: captionLocales,
    defaultLocale: captionsDefaultLocale,
  } = parseCaptionsData(storage.captions);

  const sources = useRef(buildSources());
  const tracks = useRef(captionLocales);
  const defaultCaptionLocale = useRef(captionsDefaultLocale);
  const element = useRef();
  const captionsCleanup = useRef(() => {});

  useEffect(() => {
    if (!player.screenshare) {
      const video = element.current;
      if (!video) return;

      player.screenshare = videojs(video, buildOptions(sources), () => {
        captionsCleanup.current = setupLazyCaptions({
          playerInstance: player.screenshare,
          videoElement: video,
          tracks: tracks.current,
          defaultLocale: defaultCaptionLocale.current,
        });
      });
      logger.debug(ID.SCREENSHARE, 'mounted');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (player.screenshare) {
        if (captionsCleanup.current) {
          captionsCleanup.current();
          captionsCleanup.current = () => {};
        }
        player.screenshare.dispose();
        player.screenshare = null;
        logger.debug(ID.SCREENSHARE, 'unmounted');
      }
    };
  }, []);

  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      className={cx('screenshare-wrapper', { inactive: currentContent !== ID.SCREENSHARE })}
      id={ID.SCREENSHARE}
    >
      <div data-vjs-player>
        <video
          className="video-js"
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          ref={element}
        />
      </div>
    </div>
  );
};

const areEqual = () => true;

export default React.memo(Screenshare, areEqual);
