export const state = {
    isXR: false,
    pointerLock: false,
    menu: {
        visible: false,
        activeTab: 'inventory',
        username: 'Anonymous',
        avatarHash: null,
        avatarFileName: null,
        /* account: {
            name: '',
            avatar: null,
            isMic: false,
            equipped: [],
        }, */
        inventory: {
        	balance: 0,
            items: [],
            selectedId: null,
            selectedHash: null,
            selectedFileName: null,
        },
        browse: {
            page: 0,
            items: [],
        },
        world: {
            peers: [],
            selectedPeerId: null,
        },
    },
    weaponWheel: {
        visible: false,
        activeWeapon: '',
        weapons: [],
    }
};

const emitChange = (changedKeys) => {
    window.dispatchEvent(new CustomEvent('stateChanged', { 
        detail: {
            changedKeys,
        }
    }));
};

export const getSpecificState = (keys) => {
    let returnState = {};
    for (const k in keys) {
        returnState[keys[k]] = state[keys[k]];
     }
     return returnState;
}

export const setState = newState => {
    for (const k in newState) {
       state[k] = newState[k];
    }
    emitChange(Object.keys(newState));
};

export const getState = () => {
    return state;
};