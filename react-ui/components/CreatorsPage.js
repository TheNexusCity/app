import { React, useEffect, useState, useContext } from 'https://unpkg.com/es-react@16.13.1/dev';
import htm from '../web_modules/htm.js';
import ActionTypes from '../constants/ActionTypes.js';
import css from '../web_modules/csz.js';
import CreatorCard from './CreatorCard.js';
const styles = css`${window.locationSubdirectory}/components/CreatorsPage.css`
import { Context } from '../constants/Context.js';

const html = htm.bind(React.createElement)

const CreatorsPage = () => {
  const {state, dispatch} = useContext(Context);
  const [currentPage, setCurrentPage] = useState(1);


  useEffect(() => {
    console.log("Rendering creators");
    dispatch({ type: ActionTypes.GetCreators, payload: { page: currentPage } });
  }, [])
  // Get Creators

    return html`
    <${React.Suspense} fallback=${html`<div>Loading...</div>`}>
    ${state.creators[currentPage] && html`
     <div className="${styles} creatorsPage">
        ${state.creators[currentPage].map(creator => html`
          <${CreatorCard}
              key="${creator.address}"
              name="${creator.name}"
              ftu="${creator.ftu}"
              avatarPreview="${creator.avatarPreview}"
              avatarFileName="${creator.avatarFileName}"
              avatarUrl="${creator.avatarUrl}"
              address="${creator.address}"
          />
          `)}
        </div>
      `}
    <//>

    `;
  };

  export default CreatorsPage;
