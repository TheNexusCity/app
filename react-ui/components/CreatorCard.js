import { React } from 'https://unpkg.com/es-react@16.13.1/dev';

import htm from '../web_modules/htm.js';
import css from '../web_modules/csz.js'

const styles = css`${window.locationSubdirectory}/components/CreatorCard.css`

const html = htm.bind(React.createElement)
const defaultAvatarImage = window.locationSubdirectory + "/images/defaultaccount.png";

const Creator = ({
  name,
  avatarUrl,
  avatarFileName,
  avatarPreview,
  ftu = 0,
  address
}) => {

  const copyAddress = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(state.address);
    console.log("Copied address to clipboard", state.address);
    e.stopPropagation()
  };

    return html`
        <div className="${styles} creator" onClick=${() => window.location = `${window.locationSubdirectory}/creator/`+address}>
          <div className="avatarPreview"><img src="${avatarPreview !== "" ? avatarPreview : defaultAvatarImage}" /></div>
          <div className="creatorInfo">
            <div>
              <div className="creatorName">${name || 'Anonymous'}</div>
              <div className="creatorFtu">${ftu}</div>
            </div>
            <div>
              <div className="creatorAddress">${address}</div>
              <div className="creatorBtnCopy" onClick=${copyAddress}> (copy) </div>
            </div>
          </div>
        </div>
    `;
  };

  export default Creator;
