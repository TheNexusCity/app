/* player manager binds y.js data to player objects
player objects load their own avatar and apps using this binding */

// import * as THREE from 'three';
import * as Z from 'zjs';
import { RemotePlayer } from './character-controller.js';
// import {getPlayerPrefix} from './util.js';
// import {playersMapName} from './constants.js';
import {localPlayer} from './players.js';
import metaversefileApi from 'metaversefile';

Error.stackTraceLimit = 300;
window.localPlayer = localPlayer;

class PlayersManager {
  constructor() {
    this.playersArray = null;

    this.remotePlayers = new Map();
    this.remotePlayersByInteger = new Map();
    window.remotePlayers = this.remotePlayers;

    this.unbindStateFn = null;
  }
  getPlayersState() {
    return this.playersArray;
  }
  unbindState() {
    const lastPlayers = this.playersArray;
    if (lastPlayers) {
      console.log('unbind player observers', lastPlayers, new Error().stack);
      console.log('got players array', this.playersArray);
      const playerSpecs = this.playersArray.toJSON();
      const nonLocalPlayerSpecs = playerSpecs.filter(p => {
        return p.playerId !== localPlayer.playerId;
      });
      for (const nonLocalPlayer of nonLocalPlayerSpecs) {
        const remotePlayer = this.remotePlayers.get(nonLocalPlayer.playerId);
        if (remotePlayer) {
          console.log('destroy remote player', remotePlayer);
          remotePlayer.destroy();
          this.remotePlayers.delete(nonLocalPlayer.playerId);
        } else {
          console.log('no remote player to destroy', nonLocalPlayer.playerId);
          throw new Error('no remote player to destroy');
        }
      }

      this.unbindStateFn();
      this.playersArray = null;
      this.unbindStateFn = null;
    }
  }
  bindState(nextPlayersArray) {
    this.unbindState();

    this.playersArray = nextPlayersArray;

    if (this.playersArray) {
      const localPlayer = metaversefileApi.useLocalPlayer();

      const playersObserveFn = (e) => {
        const { added, deleted, delta, keys } = e.changes;
        
        const values = Array.from(added.values());
        // if (values.length > 0) {
          console.log('got apps', values);
        // }

        for (const item of added.values()) {
          let playerMap = item.content.type;
          if (playerMap.constructor === Object) {
            for (let i = 0; i < this.playersArray.length; i++) {
              const localPlayerMap = this.playersArray.get(i, Z.Map); // force to be a map
              if (localPlayerMap.binding === item.content.type) {
                playerMap = localPlayerMap;
                break;
              }
            }
          }

          const playerId = playerMap.get('playerId');
          const name = playerMap.get('name');

          if (playerId !== localPlayer.playerId) {
            // console.log('add player', playerId, this.playersArray.toJSON());

            const remotePlayer = new RemotePlayer({
              name,
              playerId,
              playersArray: this.playersArray,
            });
            this.remotePlayers.set(playerId, remotePlayer);
            this.remotePlayersByInteger.set(remotePlayer.playerIdInt, remotePlayer);
          }
        }
        // console.log('players observe', added, deleted);
        for (const item of deleted.values()) {
          console.log('player remove 1', item);
          const playerId = item.content.type._map.get('playerId').content.arr[0]; // needed to get the old data
          console.log('player remove 2', playerId, localPlayer.playerId);

          if (playerId !== localPlayer.playerId) {
            console.log('remove player 3', playerId);

            const remotePlayer = this.remotePlayers.get(playerId);
            this.remotePlayers.delete(playerId);
            console.log("deleting remote player", remotePlayer);
            this.remotePlayersByInteger.delete(remotePlayer.playerIdInt);
            
            remotePlayer.destroy();
          }
        }
      };
      this.playersArray.observe(playersObserveFn);
      this.unbindStateFn = this.playersArray.unobserve.bind(
        this.playersArray,
        playersObserveFn
      );
    }
  }
  updateRemotePlayers(timestamp, timeDiff) {
    for (const remotePlayer of this.remotePlayers.values()) {
      remotePlayer.updateAvatar(timestamp, timeDiff);
    }
  }
}
const playersManager = new PlayersManager();

export { playersManager };
