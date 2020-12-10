import { React, useEffect, useContext, useState } from 'https://unpkg.com/es-react@16.13.1/dev';
import htm from '/web_modules/htm.js';
import AssetCardGrid from './AssetCardGrid.js'
import csz from '../web_modules/csz.js'
import { Context } from '../constants/Context.js';
import ActionTypes from '../constants/ActionTypes.js';
import { EditableTextField } from './EditableTextField.js';

const styles = csz`/components/Profile.css`
const defaultAvatarImage = "../images/defaultaccount.png";
const defaultHomespacePreview = "../images/defaulthomespace.png";

const html = htm.bind(React.createElement)

const Profile = ({ userAddress, isMyProfile }) => {
  const { state, dispatch } = useContext(Context);
  const [currentPage, setCurrentPage] = useState(1);
  let homespacePreview = defaultHomespacePreview;
  let avatarPreview = defaultAvatarImage;
  useEffect(() => {
    // // const homespacePreviewCandidate = isMyProfile ? state.homeSpacePreview : state.creatorProfiles[userAddress].homeSpacePreview;
    const avatarPreviewCandidate = isMyProfile ? state.avatarPreview : state.creatorProfiles[userAddress].avatarPreview;
  
    avatarPreview = avatarPreviewCandidate !== "" &&
    avatarPreviewCandidate !== null ?
    avatarPreviewCandidate : defaultAvatarImage;
  
    // homespacePreview = homespacePreviewCandidate !== "" &&
    // homespacePreviewCandidate !== null ?
    // homespacePreviewCandidate : defaultHomespacePreview;
  
  }, [state]);

  useEffect(() => {



    console.log("Rendering my profile");
    console.log("State is", state);
    dispatch({ type: ActionTypes.GetProfileForCreator, payload: { address: userAddress } });
    console.log(state.creatorProfiles);
  }, [])

  const updateName = (textFieldInput) =>
    dispatch({ type: ActionTypes.SetName, payload: { name: textFieldInput } });


  //   ${isMyProfile ? html`
  //   <${EditableTextField} value=${state.name} valueIfNull=${'<Username>'} className=${`${styles} username settingsNameField`} callback=${updateName} />
  // ` : html`
  //   <div className="username">${state.creatorProfiles[userAddress].username}</div>
  // `}

  //             <span className="profileLoadout"><a href="#">Loadout</a></span>

  return html`
    <${React.Suspense} fallback=${html`<div>Loading...</div>`}>
    ${userAddress && state.creatorProfiles[userAddress] && html`
    <div className=${styles}>
        <div className="profileHeader">
          <div className="homespaceBannerImage"><img src="${homespacePreview}" /></div>
          <div className="avatarImage"><img src="${state.creatorProfiles[userAddress].avatarPreview}" /></div>
          ${isMyProfile ? html`
          <div className="username">${state.name}</div>
          ` : html`
            <div className="username">${state.creatorProfiles[userAddress].username}</div>
          `}
          <div className="userAddress">${userAddress}</div>
          <div className="userGrease">${state.creatorProfiles[userAddress].balance}Ψ</div>
        </div>
        <div className="profileBody">
          <div className="profileBodyNav">
          <span className="profileForSale"><a href="#">For Sale</a></span>
            <span className="profileInventory"><a href="#">Inventory</a></span>
          </div>
          <div className="profileBodyAssets">
            <${AssetCardGrid} data=${state.creatorInventories[userAddress][currentPage]} cardSize='medium' />
          </div>
        </div>
    </div>
        `}
        <//>
    `;
};

export default Profile;
