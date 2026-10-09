import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  defineMessages,
  useIntl,
} from 'react-intl';
import Button from 'components/utils/button';
import './index.scss';

const intlMessages = defineMessages({
  close: {
    id: 'button.close.aria',
    description: 'Aria label for the close button',
  },
});

const propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]),
  onClose: PropTypes.func,
};

const defaultProps = {
  children: null,
  onClose: () => {},
};

const FOCUSABLE = 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({
  children,
  onClose,
}) => {
  const intl = useIntl();
  const modal = useRef();
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    // Move focus into the dialog and give it back when the dialog closes
    const previous = document.activeElement;
    const node = modal.current;
    if (node) {
      const target = node.querySelector('.modal-content input') || node.querySelector(FOCUSABLE) || node;
      target.focus();
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) close.current();
  };

  return (
    <div
      className="modal-wrapper"
      onClick={handleBackdropClick}
    >
      <div
        aria-modal="true"
        className="modal"
        ref={modal}
        role="dialog"
        tabIndex="-1"
      >
        <div className="modal-control">
          <Button
            aria={intl.formatMessage(intlMessages.close)}
            circle
            handleOnClick={onClose}
            icon="close"
          />
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

Modal.propTypes = propTypes;
Modal.defaultProps = defaultProps;

export default Modal;
