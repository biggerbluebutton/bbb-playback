import { EVENTS } from 'utils/constants';

const DURATION = 4000;

// Shows a short, non-blocking message. `action` is an optional
// { label, onClick } rendered as a button inside the toast
const notify = ({
  action = null,
  duration = DURATION,
  message,
}) => {
  if (!message) return;

  const event = new CustomEvent(EVENTS.TOAST, {
    detail: {
      action,
      duration,
      id: Date.now(),
      message,
    },
  });
  document.dispatchEvent(event);
};

export default notify;
