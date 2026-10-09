import React from 'react';
import PropTypes from 'prop-types';
import Status from './status';
import Title from './title';
import SearchButton from './buttons/search';
import SectionButton from './buttons/section';
import ShareButton from './buttons/share';
import SwapButton from './buttons/swap';
import ThemeButton from './buttons/theme';
import { ID } from 'utils/constants';
import './index.scss';

const propTypes = {
  openModal: PropTypes.func,
  section: PropTypes.bool,
  toggleSection: PropTypes.func,
  toggleSwap: PropTypes.func,
  hidePresentation: PropTypes.bool,
};

const defaultProps = {
  openModal: () => { },
  section: false,
  toggleSection: () => { },
  toggleSwap: () => { },
};

const Top = ({
  openModal,
  section,
  toggleSection,
  toggleSwap,
  hidePresentation,
}) => {

  return (
    <header className="top-bar">
      <div className="start">
        <SectionButton
          section={section}
          toggleSection={toggleSection}
        />
        <Title openAbout={() => openModal(ID.ABOUT)} />
      </div>
      <div className="end">
        <Status />
        <ShareButton />
        <SearchButton openSearch={() => openModal(ID.SEARCH)} />
        <SwapButton toggleSwap={toggleSwap} hidePresentation={hidePresentation} />
        <ThemeButton />
      </div>
    </header>
  );
};

Top.propTypes = propTypes;
Top.defaultProps = defaultProps;

// Checks the side section state
const areEqual = (prevProps, nextProps) => {
  if (prevProps.hidePresentation !== nextProps.hidePresentation) return false;
  return prevProps.section === nextProps.section;
};

export default React.memo(Top, areEqual);
