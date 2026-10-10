import { useEffect } from 'react';

const DOUBLE_TAP = 300;
const DISTANCE = 40;
const AREAS = '.top-content, .webcams-wrapper';
const IGNORE = 'button, a, input, [role="button"], .vjs-control-bar, .modal-wrapper';

// Double-tap the left or right side of the slide or video to seek, like
// mobile video apps. Shows a ripple with the jump
const showRipple = (area, side, label) => {
  const ripple = document.createElement('div');
  ripple.className = `tap-seek tap-seek-${side}`;
  ripple.setAttribute('aria-hidden', 'true');
  ripple.innerHTML = `<span class="tap-seek-arrows">${side === 'back' ? '◀◀' : '▶▶'}</span><span>${label}</span>`;
  area.appendChild(ripple);
  setTimeout(() => ripple.remove(), 650);
};

const useDoubleTapSeek = ({ backward, forward, seconds }) => {
  useEffect(() => {
    let last = null;

    const handleTap = (event) => {
      if (event.pointerType !== 'touch') return;

      const { target } = event;
      if (!target || typeof target.closest !== 'function' || target.closest(IGNORE)) return;

      const area = target.closest(AREAS);
      if (!area) return;

      const now = Date.now();
      const isDouble = last
        && now - last.time < DOUBLE_TAP
        && Math.abs(event.clientX - last.x) < DISTANCE
        && Math.abs(event.clientY - last.y) < DISTANCE;

      last = isDouble ? null : { time: now, x: event.clientX, y: event.clientY };
      if (!isDouble) return;

      const rect = area.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;

      // Screen sides, the same for every language like on video apps
      if (ratio < 0.4) {
        backward();
        showRipple(area, 'back', `−${seconds}s`);
      } else if (ratio > 0.6) {
        forward();
        showRipple(area, 'forward', `+${seconds}s`);
      }
    };

    document.addEventListener('pointerup', handleTap);

    return () => document.removeEventListener('pointerup', handleTap);
  }, [backward, forward, seconds]);
};

export default useDoubleTapSeek;
