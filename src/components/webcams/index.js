import React, { useEffect, useRef } from 'react';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import videojs from 'video.js/dist/video.es.js';
import 'videojs-seek-buttons'
import {
  player as config,
  shortcuts,
  translation as translationConfig,
} from 'config';
import {
  EVENTS,
  ID,
} from 'utils/constants';
import { buildFileURL } from 'utils/data';
import logger from 'utils/logger';
import {
  getFrequency,
  getTime,
} from 'utils/params';
import progress from 'utils/progress';
import storage from 'utils/data/storage';
import player from 'utils/player';
import {
  fetchVTT,
  getAvailableLanguages,
  toServiceLang,
  translateVTT,
} from 'utils/translation';
import './index.scss';

const intlMessages = defineMessages({
  aria: {
    id: 'player.webcams.wrapper.aria',
    description: 'Aria label for the webcams wrapper',
  },
  translating: {
    id: 'player.webcams.captions.translating',
    description: 'Label shown while captions are being translated',
  },
});

const buildSources = () => {
  if (storage.fallback) {
    return [
      {
        src: buildFileURL('audio/audio.webm'),
        type: 'audio/webm',
      },
    ];
  }

  return [
    {
      src: buildFileURL('video/webcams.mp4'),
      type: 'video/mp4',
    }, {
      src: buildFileURL('video/webcams.webm'),
      type: 'video/webm',
    },
  ].filter(source => storage.media.find(m => source.type.includes(m)));
};

const buildTracks = () => {
  return storage.captions.map(lang => {
    const {
      locale,
      localeName,
    } = lang;

    return {
      kind: 'captions',
      src: buildFileURL(`caption_${locale}.vtt`),
      srclang: locale,
      label: localeName,
    };
  });
};

const buildOptions = (sources, tracks) => {
  return {
    controlBar: {
      fullscreenToggle: false,
      pictureInPictureToggle: false,
      volumePanel: {
        inline: false,
        vertical: true,
      },
    },
    controls: true,
    fill: true,
    inactivityTimeout: 0,
    playbackRates: config.rates,
    sources: sources.current,
    tracks: tracks.current,
    plugins: {
      seekButtons: {
        forward: shortcuts.seek.seconds,
        back: shortcuts.seek.seconds,
      }
    }
  };
};

const dispatchTimeUpdate = (time) => {
  const event = new CustomEvent(EVENTS.TIME_UPDATE, { detail: { time } });
  document.dispatchEvent(event);
};

// Adds every shipped language to the closed-caption menu and translates the
// existing captions into the chosen language on demand. While a translation is
// running the caption menu is locked and an overlay is shown so the user cannot
// switch languages mid-processing.
const setupTranslation = (vjsPlayer, intl) => {
  if (!translationConfig.enabled || !translationConfig.url) return;

  const nativeCaptions = storage.captions;
  if (!nativeCaptions || nativeCaptions.length === 0) return;

  // The first available caption is used as the source for every translation.
  const source = nativeCaptions[0];
  const sourceLocale = source.locale.replace('_', '-');
  const sourceUrl = buildFileURL(`caption_${source.locale}.vtt`);
  const sourceServiceLang = translationConfig.source && translationConfig.source !== 'auto'
    ? translationConfig.source
    : toServiceLang(sourceLocale);

  // Don't offer to translate into a language a caption already exists for.
  const nativeServiceLangs = new Set(
    nativeCaptions.map((caption) => toServiceLang(caption.locale.replace('_', '-')))
  );

  const languages = getAvailableLanguages(intl.locale)
    .filter((language) => !nativeServiceLangs.has(language.serviceLang));

  const translatable = new Map();
  languages.forEach((language) => {
    const trackElement = vjsPlayer.addRemoteTextTrack({
      kind: 'captions',
      language: language.locale,
      label: language.localeName,
    }, false);

    translatable.set(language.locale, {
      serviceLang: language.serviceLang,
      track: trackElement.track,
      translated: false,
      loading: false,
    });
  });

  if (translatable.size === 0) return;

  // Fetch the source captions once and reuse them for every translation.
  let sourcePromise = null;
  const getSourceVTT = () => {
    if (!sourcePromise) sourcePromise = fetchVTT(sourceUrl);
    return sourcePromise;
  };

  const captionsButton = vjsPlayer.controlBar.getChild('subsCapsButton')
    || vjsPlayer.controlBar.getChild('captionsButton')
    || vjsPlayer.controlBar.getChild('subtitlesButton');

  const setLocked = (locked) => {
    if (locked) {
      vjsPlayer.addClass('vjs-translating');
      if (captionsButton) captionsButton.disable();
    } else {
      vjsPlayer.removeClass('vjs-translating');
      if (captionsButton) captionsButton.enable();
    }
  };

  // A small overlay that signals the captions are being translated.
  const overlay = document.createElement('div');
  overlay.className = 'vjs-translating-overlay';
  overlay.setAttribute('role', 'status');
  const spinner = document.createElement('div');
  spinner.className = 'vjs-translating-spinner';
  const label = document.createElement('span');
  label.className = 'vjs-translating-label';
  label.textContent = intl.formatMessage(intlMessages.translating);
  overlay.appendChild(spinner);
  overlay.appendChild(label);
  vjsPlayer.el().appendChild(overlay);

  const Cue = window.VTTCue || window.TextTrackCue;

  const translateInto = async (info) => {
    info.loading = true;
    setLocked(true);
    try {
      const vtt = await getSourceVTT();
      const cues = await translateVTT(vtt, info.serviceLang, sourceServiceLang);
      cues.forEach((cue) => {
        try {
          info.track.addCue(new Cue(cue.start, cue.end, cue.text));
        } catch (error) {
          logger.warn(ID.WEBCAMS, 'skipped an invalid caption cue', error);
        }
      });
      info.translated = true;
    } catch (error) {
      logger.error(ID.WEBCAMS, 'caption translation failed', error);
      // Turn the empty track back off so the user can retry.
      info.track.mode = 'disabled';
    } finally {
      info.loading = false;
      setLocked(false);
    }
  };

  const onChange = () => {
    const tracks = vjsPlayer.textTracks();

    let showing = null;
    for (let i = 0; i < tracks.length; i += 1) {
      if (tracks[i].mode === 'showing') {
        showing = tracks[i];
        break;
      }
    }
    if (!showing) return;

    let info = null;
    for (const value of translatable.values()) {
      if (value.track === showing) {
        info = value;
        break;
      }
    }
    if (!info || info.translated || info.loading) return;

    translateInto(info);
  };

  vjsPlayer.textTracks().addEventListener('change', onChange);
};

const Webcams = () => {
  const intl = useIntl();
  const sources = useRef(buildSources());
  const tracks = useRef(buildTracks());
  const element = useRef();
  const interval = useRef();
  const lastProgressSave = useRef(0);

  useEffect(() => {
    if (!player.webcams) {
      const video = element.current;
      if (!video) return;

      player.webcams = videojs(video, buildOptions(sources, tracks), () => {
        const recordId = storage.metadata.id;

        player.webcams.on('play', () => {
          if (interval.current) clearInterval(interval.current);
          const frequency = getFrequency();
          interval.current = setInterval(() => {
            if (player.webcams && !player.webcams.isDisposed()) {
              const currentTime = player.webcams.currentTime();
              dispatchTimeUpdate(currentTime);
              const now = Date.now();
              if (now - lastProgressSave.current >= progress.SAVE_INTERVAL) {
                progress.save(recordId, currentTime);
                lastProgressSave.current = now;
              }
            }
          }, 1000 / (frequency ? frequency : config.rps));
        });

        player.webcams.on('pause', () => {
          clearInterval(interval.current);
          progress.save(recordId, player.webcams.currentTime());
        });

        player.webcams.on('seeked', () => {
          const currentTime = player.webcams.currentTime();
          dispatchTimeUpdate(currentTime);
          progress.save(recordId, currentTime);
        });

        player.webcams.on('ended', () => progress.clear(recordId));

        // Restore position: URL time param takes priority, then localStorage
        player.webcams.on('loadedmetadata', () => {
          const duration = player.webcams.duration();
          const urlTime = getTime();
          if (urlTime !== null && urlTime < duration) {
            player.webcams.currentTime(urlTime);
          } else {
            const savedTime = progress.load(recordId);
            if (savedTime && savedTime < duration) {
              player.webcams.currentTime(savedTime);
            }
          }
        });

        setupTranslation(player.webcams, intl);
      });
      logger.debug(ID.WEBCAMS, 'mounted');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (interval.current) clearInterval(interval.current);
      if (player.webcams) {
        player.webcams.dispose();
        player.webcams = null;
        logger.debug(ID.WEBCAMS, 'unmounted');
      }
    };
  }, []);


  return (
    <div
      aria-label={intl.formatMessage(intlMessages.aria)}
      className="webcams-wrapper"
      id={ID.WEBCAMS}
    >
      <div data-vjs-player>
        <video
          className="video-js"
          playsInline
          preload="auto"
          ref={element}
        />
      </div>
    </div>
  );
};

// Avoid re-render
const areEqual = () => true;

export default React.memo(Webcams, areEqual);
