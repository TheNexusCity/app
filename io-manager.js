import * as THREE from './three.module.js';
import {renderer, camera, dolly} from './app-object.js';
import cameraManager from './camera-manager.js';
import uiManager from './ui-manager.js';
import weaponsManager from './weapons-manager.js';
import physicsManager from './physics-manager.js';

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localEuler = new THREE.Euler();
const localMatrix2 = new THREE.Matrix4();
const localMatrix3 = new THREE.Matrix4();

const ioManager = new EventTarget();

ioManager.lastAxes = [[0, 0, 0, 0], [0, 0, 0, 0]];
ioManager.lastButtons = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
ioManager.currentWeaponValue = 0;
ioManager.lastWeaponValue = 0;
ioManager.currentTeleport = false;
ioManager.lastTeleport = false;
ioManager.currentMenuDown = false;
ioManager.lastMenuDown = false;
ioManager.menuExpanded = false;
ioManager.lastMenuExpanded = false;
ioManager.currentWeaponGrabs = [false, false];
ioManager.lastWeaponGrabs = [false, false];
ioManager.currentWalked = false;
ioManager.keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  shift: false,
};
const resetKeys = () => {
  for (const k in ioManager.keys) {
    ioManager.keys[k] = false;
  }
};
ioManager.resetKeys = resetKeys;

const _inputFocused = () => document.activeElement && document.activeElement.tagName === 'INPUT';

const _updateIo = (timeDiff, frame) => {
  const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
  if (renderer.xr.getSession()) {
    ioManager.currentWalked = false;
    const inputSources = Array.from(renderer.xr.getSession().inputSources);
    for (let i = 0; i < inputSources.length; i++) {
      const inputSource = inputSources[i];
      const {handedness, gamepad} = inputSource;
      if (gamepad && gamepad.buttons.length >= 2) {
        const index = handedness === 'right' ? 1 : 0;

        // axes
        const {axes: axesSrc, buttons: buttonsSrc} = gamepad;
        const axes = [
          axesSrc[0] || 0,
          axesSrc[1] || 0,
          axesSrc[2] || 0,
          axesSrc[3] || 0,
        ];
        const buttons = [
          buttonsSrc[0] ? buttonsSrc[0].value : 0,
          buttonsSrc[1] ? buttonsSrc[1].value : 0,
          buttonsSrc[2] ? buttonsSrc[2].value : 0,
          buttonsSrc[3] ? buttonsSrc[3].value : 0,
          buttonsSrc[4] ? buttonsSrc[4].value : 0,
          buttonsSrc[5] ? buttonsSrc[4].value : 0,
        ];
        if (handedness === 'left') {
          const dx = axes[0] + axes[2];
          const dy = axes[1] + axes[3];
          if (Math.abs(dx) >= 0.01 || Math.abs(dx) >= 0.01) {
            localEuler.setFromQuaternion(xrCamera.quaternion, 'YXZ');
            localEuler.x = 0;
            localEuler.z = 0;
            localVector3.set(dx, 0, dy)
              .applyEuler(localEuler)
              .multiplyScalar(0.05);

            dolly.matrix
              // .premultiply(localMatrix2.makeTranslation(-xrCamera.position.x, -xrCamera.position.y, -xrCamera.position.z))
              .premultiply(localMatrix3.makeTranslation(localVector3.x, localVector3.y, localVector3.z))
              // .premultiply(localMatrix2.getInverse(localMatrix2))
              .decompose(dolly.position, dolly.quaternion, dolly.scale);
            ioManager.currentWalked = true;
          }
          
          ioManager.currentWeaponGrabs[1] = buttons[1] > 0.5;
        } else if (handedness === 'right') {
          const _applyRotation = r => {
            dolly.matrix
              .premultiply(localMatrix2.makeTranslation(-xrCamera.position.x, -xrCamera.position.y, -xrCamera.position.z))
              .premultiply(localMatrix3.makeRotationFromQuaternion(localQuaternion2.setFromAxisAngle(localVector3.set(0, 1, 0), r)))
              .premultiply(localMatrix2.getInverse(localMatrix2))
              .decompose(dolly.position, dolly.quaternion, dolly.scale);
          };
          if (
            (axes[0] < -0.75 && !(ioManager.lastAxes[index][0] < -0.75)) ||
            (axes[2] < -0.75 && !(ioManager.lastAxes[index][2] < -0.75))
          ) {
            _applyRotation(Math.PI * 0.2);
          } else if (
            (axes[0] > 0.75 && !(ioManager.lastAxes[index][0] > 0.75)) ||
            (axes[2] > 0.75 && !(ioManager.lastAxes[index][2] > 0.75))
          ) {
            _applyRotation(-Math.PI * 0.2);
          }
          ioManager.currentTeleport = (axes[1] < -0.75 || axes[3] < -0.75);
          ioManager.currentMenuDown = (axes[1] > 0.75 || axes[3] > 0.75);

          ioManager.currentWeaponDown = buttonsSrc[0].pressed;
          ioManager.currentWeaponValue = buttons[0];
          ioManager.currentWeaponGrabs[0] = buttonsSrc[1].pressed;

          if (
            buttons[2] >= 0.5 && ioManager.lastButtons[index][2] < 0.5 &&
            !(Math.abs(axes[0]) > 0.5 || Math.abs(axes[1]) > 0.5 || Math.abs(axes[2]) > 0.5 || Math.abs(axes[3]) > 0.5) &&
            !physicsManager.getJumpState()
          ) {
            physicsManager.jump();
          }
        }

        ioManager.lastAxes[index][0] = axes[0];
        ioManager.lastAxes[index][1] = axes[1];
        ioManager.lastAxes[index][2] = axes[2];
        ioManager.lastAxes[index][3] = axes[3];
        
        ioManager.lastButtons[index][0] = buttons[0];
        ioManager.lastButtons[index][1] = buttons[1];
        ioManager.lastButtons[index][2] = buttons[2];
        ioManager.lastButtons[index][3] = buttons[3];
        ioManager.lastButtons[index][4] = buttons[4];
      }
    }

    if (ioManager.currentMenuDown) {
      const rightInputSource = inputSources.find(inputSource => inputSource.handedness === 'right');
      const pose = rightInputSource && frame.getPose(rightInputSource.targetRaySpace, renderer.xr.getReferenceSpace());
      if (pose) {
        localMatrix2.fromArray(pose.transform.matrix)
          .premultiply(dolly.matrix)
          .decompose(localVector, localQuaternion, localVector2);
        // if (!lastSelector) {
          uiManager.toolsMesh.position.copy(localVector);
          localEuler.setFromQuaternion(localQuaternion, 'YXZ');
          localEuler.x = 0;
          localEuler.z = 0;
          uiManager.toolsMesh.quaternion.setFromEuler(localEuler);
        // }
        uiManager.toolsMesh.update(localVector);
        uiManager.toolsMesh.visible = true;
      } else {
        uiManager.toolsMesh.visible = false;
      }
    } else {
      uiManager.toolsMesh.visible = false;
    }
  } else if (document.pointerLockElement) {
    const speed = 100 * (ioManager.keys.shift ? 3 : 1);
    const cameraEuler = camera.rotation.clone();
    cameraEuler.x = 0;
    cameraEuler.z = 0;
    localVector.set(0, 0, 0);
    if (ioManager.keys.left) {
      localVector.add(new THREE.Vector3(-1, 0, 0).applyEuler(cameraEuler));
    }
    if (ioManager.keys.right) {
      localVector.add(new THREE.Vector3(1, 0, 0).applyEuler(cameraEuler));
    }
    if (ioManager.keys.up) {
      localVector.add(new THREE.Vector3(0, 0, -1).applyEuler(cameraEuler));
    }
    if (ioManager.keys.down) {
      localVector.add(new THREE.Vector3(0, 0, 1).applyEuler(cameraEuler));
    }
    if (localVector.length() > 0) {
      localVector.normalize().multiplyScalar(speed);
    }
    localVector.multiplyScalar(timeDiff);
    physicsManager.velocity.add(localVector);
  }
};
ioManager.update = _updateIo;

const _updateIoPost = () => {
  ioManager.lastTeleport = ioManager.currentTeleport;
  ioManager.lastMenuDown = ioManager.currentMenuDown;
  ioManager.lastWeaponDown = ioManager.currentWeaponDown;
  ioManager.lastWeaponValue = ioManager.currentWeaponValue;
  ioManager.lastMenuExpanded = ioManager.menuExpanded;
  for (let i = 0; i < 2; i++) {
    ioManager.lastWeaponGrabs[i] = ioManager.currentWeaponGrabs[i];
  }
};
ioManager.updatePost = _updateIoPost;

window.addEventListener('keydown', e => {
  switch (e.which) {
    case 49: { // 1
      const selectedWeapon = weaponsManager.getWeapon();
      let index = weaponsManager.weapons.findIndex(weapon => weapon.getAttribute('weapon') === selectedWeapon);
      index--;
      if (index < 0) {
        index = weaponsManager.weapons.length - 1;
      }
      weaponsManager.weapons[index].click();
      break;
    }
    case 50: { // 2
      const selectedWeapon = weaponsManager.getWeapon();
      let index = weaponsManager.weapons.findIndex(weapon => weapon.getAttribute('weapon') === selectedWeapon);
      index++;
      if (index >= weaponsManager.weapons.length) {
        index = 0;
      }
      weaponsManager.weapons[index].click();
      break;
    }
    case 87: { // W
      if (!document.pointerLockElement) {
        // nothing
      } else {
        ioManager.keys.up = true;
      }
      break;
    }
    case 65: { // A
      if (!document.pointerLockElement) {
        // uiMesh && uiMesh.rotate(-1);
      } else {
        ioManager.keys.left = true;
      }
      break;
    }
    case 83: { // S
      if (!document.pointerLockElement) {
        // nothing
      } else {
        ioManager.keys.down = true;
      }
      break;
    }
    case 68: { // D
      if (!document.pointerLockElement) {
        // uiMesh && uiMesh.rotate(1);
      } else {
        ioManager.keys.right = true;
      }
      break;
    }
    case 9: { // tab
      e.preventDefault();
      e.stopPropagation();
      ioManager.menuExpanded = !ioManager.menuExpanded;
      break;
    }
    case 69: { // E
      if (document.pointerLockElement) {
        // nothing
      /* } else {
        if (selectTarget && selectTarget.control) {
          selectTarget.control.setMode('rotate');
        } */
      }
      break;
    }
    case 82: { // R
      if (document.pointerLockElement) {
        // pe.equip('back');
      /* } else {
        if (selectTarget && selectTarget.control) {
          selectTarget.control.setMode('scale');
        } */
      }
      break;
    }
    case 70: { // F
      // pe.grabdown('right');
      if (document.pointerLockElement) {
        ioManager.currentWeaponGrabs[0] = true;
      }
      break;
    }
    case 86: { // V
      if (!_inputFocused()) {
        e.preventDefault();
        e.stopPropagation();
        cameraManager.tools.find(tool => tool.getAttribute('tool') === 'firstperson').click();
      }
      break;
    }
    case 66: { // B
      if (!_inputFocused()) {
        e.preventDefault();
        e.stopPropagation();
        cameraManager.tools.find(tool => tool.getAttribute('tool') === 'thirdperson').click();
      }
      break;
    }
    case 78: { // N
      if (!_inputFocused()) {
        e.preventDefault();
        e.stopPropagation();
        cameraManager.tools.find(tool => tool.getAttribute('tool') === 'isometric').click();
      }
      break;
    }
    case 77: { // M
      if (!_inputFocused()) {
        e.preventDefault();
        e.stopPropagation();
        cameraManager.tools.find(tool => tool.getAttribute('tool') === 'birdseye').click();
      }
      break;
    }
    case 16: { // shift
      if (document.pointerLockElement) {
        ioManager.keys.shift = true;
      }
      break;
    }
    case 32: { // space
      if (document.pointerLockElement) {
        if (!physicsManager.getJumpState()) {
          physicsManager.jump();
        }
      }
      break;
    }
    case 81: { // Q
      const selectedWeapon = weaponsManager.getWeapon();
      if (selectedWeapon !== 'pickaxe') {
        document.querySelector('.weapon[weapon="pickaxe"]').click();
      } else {
        document.querySelector('.weapon[weapon="shovel"]').click();
      }
      break;
    }
    case 90: { // Z
      document.querySelector('.weapon[weapon="build"]').click();
      buildMode = 'wall';
      break;
    }
    case 88: { // X
      document.querySelector('.weapon[weapon="build"]').click();
      buildMode = 'floor';
      break;
    }
    case 67: { // C
      if (!ioManager.keys.ctrl && document.pointerLockElement) {
        document.querySelector('.weapon[weapon="build"]').click();
        buildMode = 'stair';
      }
      break;
    }
    /* case 80: { // P
      physics.resetObjectMesh(physicalMesh);
      break;
    } */
    case 8: // backspace
    case 46: // del
    {
      /* if (selectedObjectMeshes.length > 0) {
          const oldSelectedObjectMeshes = selectedObjectMeshes;

          _setHoveredObjectMesh(null);
          _setSelectedObjectMesh(null, false);

          const action = createAction('removeObjects', {
            oldObjectMeshes: oldSelectedObjectMeshes,
            container,
            objectMeshes,
          });
          execute(action);
        } */
      break;
    }
  }
});
window.addEventListener('keyup', e => {
  switch (e.which) {
    case 87: { // W
      if (document.pointerLockElement) {
        ioManager.keys.up = false;
      }
      break;
    }
    case 65: { // A
      if (document.pointerLockElement) {
        ioManager.keys.left = false;
      }
      break;
    }
    case 83: { // S
      if (document.pointerLockElement) {
        ioManager.keys.down = false;
      }
      break;
    }
    case 68: { // D
      if (document.pointerLockElement) {
        ioManager.keys.right = false;
      }
      break;
    }
    case 70: { // F
      // pe.grabup('right');
      if (document.pointerLockElement) {
        ioManager.currentWeaponGrabs[0] = false;
      }
      break;
    }
    case 16: { // shift
      if (document.pointerLockElement) {
        ioManager.keys.shift = false;
      }
      break;
    }
  }
});
window.addEventListener('mousedown', e => {
  const selectedWeapon = weaponsManager.getWeapon();
  if (document.pointerLockElement || ['physics', 'pencil'].includes(selectedWeapon)) {
    if (e.button === 0) {
      // pe.grabtriggerdown('right');
      // pe.grabuse('right');
      ioManager.currentWeaponDown = true;
      ioManager.currentWeaponValue = 1;
    } else if (e.button === 2) {
      ioManager.currentTeleport = true;
    }
  }
});
window.addEventListener('mouseup', e => {
  ioManager.currentWeaponDown = false;
  ioManager.currentWeaponValue = 0;
  ioManager.currentTeleport = false;
});
renderer.domElement.addEventListener('dblclick', e => {
  if (!document.pointerLockElement) {
    cameraManager.tools.find(tool => tool.getAttribute('tool') === 'firstperson').click();
  }
});
document.addEventListener('pointerlockchange', e => {
  if (!document.pointerLockElement) {
    cameraManager.tools.find(tool => tool.getAttribute('tool') === 'camera').click();
    document.dispatchEvent(new MouseEvent('mouseup'));
  }
});

export default ioManager;