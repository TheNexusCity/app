import * as THREE from './three.module.js';
import {BufferGeometryUtils} from './BufferGeometryUtils.js';
import {CapsuleGeometry} from './CapsuleGeometry.js';
import {makeCubeMesh, makeRayMesh, intersectUi} from './vr-ui.js';
import geometryManager from './geometry-manager.js';
import cameraManager from './camera-manager.js';
import uiManager from './ui-manager.js';
import ioManager from './io-manager.js';
import physicsManager from './physics-manager.js';
import {rigManager} from './rig.js';
import {teleportMeshes} from './teleport.js';
import {renderer, scene, camera, dolly} from './app-object.js';
import {
  THING_SHADER,
  makeDrawMaterial,
} from './shaders.js';
import {
  SUBPARCEL_SIZE,
  BUILD_SNAP,
  colors,
} from './constants.js';
import { setState } from './state.js';

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localQuaternion3 = new THREE.Quaternion();
const localEuler = new THREE.Euler();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localMatrix3 = new THREE.Matrix4();
const localColor = new THREE.Color();
const localRaycaster = new THREE.Raycaster();
const localRaycaster2 = new THREE.Raycaster();

const zeroVector = new THREE.Vector3();

let selectedWeapon = 'unarmed';
let lastSelectedWeapon = selectedWeapon;
const weapons = Array.from(document.querySelectorAll('.weapon'));
for (let i = 0; i < weapons.length; i++) {
  const weapon = document.getElementById('weapon-' + (i + 1));
  weapon.addEventListener('click', e => {
    const isActive = weapon.classList.contains('selected');
    for (let i = 0; i < weapons.length; i++) {
      weapons[i].classList.remove('selected');
    }
    if (isActive) {
      weapon.classList.remove('selected');
      selectedWeapon = null;
    } else {
      weapon.classList.add('selected');
      selectedWeapon = weapon.getAttribute('weapon');
    }
    setState({ selectedWeapon: selectedWeapon })
  });
}
let raycastChunkSpec = null;
let anchorSpecs = [null, null];

let pxMeshes = [];

const rayMesh = makeRayMesh();
rayMesh.visible = false;
scene.add(rayMesh);

const cubeMesh = makeCubeMesh();
scene.add(cubeMesh);

const addMesh = (() => {
  const geometry = BufferGeometryUtils.mergeBufferGeometries([
    new THREE.BoxBufferGeometry(0.1, 0.1, 0.1),
  ]);
  const material = new THREE.MeshBasicMaterial({
    color: 0x0000FF,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
})();
addMesh.visible = false;
scene.add(addMesh);

const removeMesh = (() => {
  const geometry = BufferGeometryUtils.mergeBufferGeometries([
    new THREE.BoxBufferGeometry(0.1, 0.1, 0.1),
  ]);
  const material = new THREE.MeshBasicMaterial({
    color: 0xFF0000,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
})();
removeMesh.visible = false;
scene.add(removeMesh);

const _makeTargetMesh = (() => {
  const targetMeshGeometry = (() => {
    const targetGeometry = BufferGeometryUtils.mergeBufferGeometries([
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.1, 0)),
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.1)),
      new THREE.BoxBufferGeometry(0.03, 0.2, 0.03)
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.1, 0, 0)),
    ]);
    return BufferGeometryUtils.mergeBufferGeometries([
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, 0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, 0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, 0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(-0.5, -0.5, 0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))))
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0))))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, -0.5, -0.5)),
      targetGeometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 1, 0).normalize(), new THREE.Vector3(1, -1, 0).normalize())))
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0.5, -0.5, 0.5)),
    ])// .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.5, 0));
  })();
  const targetVsh = `
    #define M_PI 3.1415926535897932384626433832795
    uniform float uTime;
    // varying vec2 vUv;
    void main() {
      float f = 1.0 + pow(sin(uTime * M_PI), 0.5) * 0.2;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position * f, 1.);
    }
  `;
  const targetFsh = `
    uniform float uHighlight;
    uniform float uTime;
    void main() {
      float f = max(1.0 - pow(uTime, 0.5), 0.1);
      gl_FragColor = vec4(vec3(f * uHighlight), 1.0);
    }
  `;
  return p => {
    const geometry = targetMeshGeometry;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uHighlight: {
          type: 'f',
          value: 0,
        },
        uTime: {
          type: 'f',
          value: 0,
        },
      },
      vertexShader: targetVsh,
      fragmentShader: targetFsh,
      // transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  };
})();

const numSmokes = 10;
const numZs = 10;
const explosionCubeGeometry = new THREE.BoxBufferGeometry(0.04, 0.04, 0.04);
const _makeExplosionMesh = () => {
  const numPositions = explosionCubeGeometry.attributes.position.array.length * numSmokes * numZs;
  const numIndices = explosionCubeGeometry.index.array.length * numSmokes * numZs;
  const arrayBuffer = new ArrayBuffer(
    numPositions * Float32Array.BYTES_PER_ELEMENT + // position
    numPositions / 3 * Float32Array.BYTES_PER_ELEMENT + // z
    numPositions / 3 * Float32Array.BYTES_PER_ELEMENT + // maxZ
    numPositions / 3 * 4 * Float32Array.BYTES_PER_ELEMENT + // q
    numPositions / 3 * 4 * Float32Array.BYTES_PER_ELEMENT + // phase
    numPositions / 3 * Float32Array.BYTES_PER_ELEMENT + // scale
    numIndices * Int16Array.BYTES_PER_ELEMENT, // index
  );
  let index = 0;
  const positions = new Float32Array(arrayBuffer, index, numPositions);
  index += numPositions * Float32Array.BYTES_PER_ELEMENT;
  const zs = new Float32Array(arrayBuffer, index, numPositions / 3);
  index += numPositions / 3 * Float32Array.BYTES_PER_ELEMENT;
  const maxZs = new Float32Array(arrayBuffer, index, numPositions / 3);
  index += numPositions / 3 * Float32Array.BYTES_PER_ELEMENT;
  const qs = new Float32Array(arrayBuffer, index, numPositions / 3 * 4);
  index += numPositions / 3 * 4 * Float32Array.BYTES_PER_ELEMENT;
  const phases = new Float32Array(arrayBuffer, index, numPositions / 3 * 4);
  index += numPositions / 3 * 4 * Float32Array.BYTES_PER_ELEMENT;
  const scales = new Float32Array(arrayBuffer, index, numPositions / 3);
  index += numPositions / 3 * Float32Array.BYTES_PER_ELEMENT;
  const indices = new Uint16Array(arrayBuffer, index, numIndices);
  index += numIndices * Uint16Array.BYTES_PER_ELEMENT;

  const numPositionsPerSmoke = numPositions / numSmokes;
  const numPositionsPerZ = numPositionsPerSmoke / numZs;
  const numIndicesPerSmoke = numIndices / numSmokes;
  const numIndicesPerZ = numIndicesPerSmoke / numZs;

  for (let i = 0; i < numSmokes; i++) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((-1 + Math.random() * 2) * Math.PI * 2 * 0.05, (-1 + Math.random() * 2) * Math.PI * 2 * 0.05, (-1 + Math.random() * 2) * Math.PI * 2 * 0.05, 'YXZ'),
    );
    for (let j = 0; j < numPositionsPerSmoke / 3 * 4; j += 4) {
      q.toArray(qs, i * numPositionsPerSmoke / 3 * 4 + j);
    }
    const maxZ = Math.random();
    for (let j = 0; j < numZs; j++) {
      positions.set(explosionCubeGeometry.attributes.position.array, i * numPositionsPerSmoke + j * numPositionsPerZ);
      const indexOffset = i * numPositionsPerSmoke / 3 + j * numPositionsPerZ / 3;
      for (let k = 0; k < numIndicesPerZ; k++) {
        indices[i * numIndicesPerSmoke + j * numIndicesPerZ + k] = explosionCubeGeometry.index.array[k] + indexOffset;
      }

      const z = j / numZs;
      for (let k = 0; k < numPositionsPerZ / 3; k++) {
        zs[i * numPositionsPerSmoke / 3 + j * numPositionsPerZ / 3 + k] = z;
      }
      for (let k = 0; k < numPositionsPerZ / 3; k++) {
        maxZs[i * numPositionsPerSmoke / 3 + j * numPositionsPerZ / 3 + k] = maxZ;
      }
      const phase = new THREE.Vector4(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0.1 + Math.random() * 0.2, 0.1 + Math.random() * 0.2);
      for (let k = 0; k < numPositionsPerZ / 3 * 4; k += 4) {
        phase.toArray(phases, i * numPositionsPerSmoke / 3 * 4 + j * numPositionsPerZ / 3 * 4 + k);
      }
      const scale = 0.9 + Math.random() * 0.2;
      for (let k = 0; k < numPositionsPerZ / 3; k++) {
        scales[i * numPositionsPerSmoke / 3 * 4 + j * numPositionsPerZ / 3 * 4 + k] = scale;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('z', new THREE.BufferAttribute(zs, 1));
  geometry.setAttribute('maxZ', new THREE.BufferAttribute(maxZs, 1));
  geometry.setAttribute('q', new THREE.BufferAttribute(qs, 4));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 4));
  geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAnimation: {
        type: 'f',
        value: 0,
      },
    },
    vertexShader: `\
      #define PI 3.1415926535897932384626433832795

      uniform float uAnimation;
      attribute float z;
      attribute float maxZ;
      attribute vec4 q;
      attribute vec4 phase;
      attribute float scale;
      varying float vZ;

      vec3 applyQuaternion(vec3 v, vec4 q) {
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
      }
      float easeBezier(float p, vec4 curve) {
        float ip = 1.0 - p;
        return (3.0 * ip * ip * p * curve.xy + 3.0 * ip * p * p * curve.zw + p * p * p).y;
      }
      float ease(float p) {
        return easeBezier(p, vec4(0., 1., 0., 1.));
      }

      void main() {
        vZ = z;
        float forwardFactor = pow(uAnimation, 0.5);
        float upFactor = uAnimation * 0.1;
        vec2 sideFactor = vec2(sin(phase.x + uAnimation*PI*2.*phase.z), sin(phase.y + uAnimation*PI*2.*phase.w));
        vec3 p = applyQuaternion(position * scale * (1.0-uAnimation) + vec3(0., 0., -z*maxZ*forwardFactor), q) +
          vec3(0., 1., 0.) * upFactor +
          vec3(uAnimation * sideFactor.x, uAnimation * sideFactor.y, 0.)*0.1;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `\
      #define PI 3.1415926535897932384626433832795

      uniform float uAnimation;
      varying float vZ;

      vec3 c = vec3(${new THREE.Color(0xff7043).toArray().join(', ')});
      vec3 s = vec3(${new THREE.Color(0x263238).toArray().join(', ')});

      void main() {
        float factor = min(vZ + pow(uAnimation, 0.5), 1.0);
        gl_FragColor = vec4(mix(c, s, factor) * (2.0 - pow(uAnimation, 0.2)), 1.0);
      }
    `,
    // transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.trigger = (position, quaternion) => {
    material.uniform.uAnimation = 0;
  };
  return mesh;
};
let explosionMeshes = [];

const _otherSideIndex = i => i === 1 ? 0 : 1;
class MeshComposer {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(THING_SHADER.uniforms),
      vertexShader: THING_SHADER.vertexShader,
      fragmentShader: THING_SHADER.fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.meshes = [];
    this.placeMeshes = [null, null];
    this.hoveredMeshes = [null, null];
    this.targetMeshes = [_makeTargetMesh(), _makeTargetMesh()];
    for (const targetMesh of this.targetMeshes) {
      targetMesh.visible = false;
      scene.add(targetMesh);
    }

    this.placeMeshStates = [null, null];
    this.scaleState = null;
  }
  getPlaceMesh(index) {
    return this.placeMeshes[index];
  }
  setPlaceMesh(index, mesh) {
    scene.add(mesh);
    this.meshes.push(mesh);
    this.placeMeshes[index] = mesh;
    
    const transforms = _getRigTransforms();
    this.placeMeshStates[index] = {
      startPosition: transforms[index].position.clone(),
      startQuaternion: transforms[index].quaternion.clone(),
      containerStartMatrix: new THREE.Matrix4().compose(transforms[index].position, transforms[index].quaternion, new THREE.Vector3(1, 1, 1)),
    };
  }
  addMesh(mesh) {
    this.meshes.push(mesh);
    scene.add(mesh);
  }
  isLatched(mesh) {
    return this.placeMeshes.includes(mesh); 
  }
  isPinching() {
    return this.placeMeshes[0] !== null && this.placeMeshes[0] === this.placeMeshes[1];
  }
  trigger(index) {
    this.placeMeshes[index] = null;
    this.placeMeshStates[index] = null;
  }
  grab(index) {
    const mesh = this.hoveredMeshes[index];
    if (mesh) {
      const transforms = _getRigTransforms();

      this.placeMeshes[index] = mesh;
      this.placeMeshStates[index] = {
        startPosition: transforms[index].position.clone(),
        startQuaternion: transforms[index].quaternion.clone(),
        containerStartMatrix: mesh.matrix.clone(),
      };

      if (this.isPinching()) {
        this.scaleState = {
          container: mesh,
          startPosition: transforms[0].position.clone()
            .add(transforms[1].position)
            .divideScalar(2),
          startDirection: transforms[0].position.clone()
            .sub(transforms[1].position)
            .normalize(),
          startWorldWidth: transforms[0].position
            .distanceTo(transforms[1].position),
          containerStartPosition: mesh.position.clone(),
          containerStartQuaternion: mesh.quaternion.clone(),
          containerStartScale: mesh.scale.clone(),
          containerStartMatrix: mesh.matrix.clone(),
        };
      }
    }
  }
  ungrab(index) {
    if (this.isPinching()) {
      const transforms = rigManager.getRigTransforms();
      const otherSideIndex = _otherSideIndex(index);
      this.placeMeshStates[otherSideIndex] = {
        startPosition: transforms[otherSideIndex].position.clone(),
        startQuaternion: transforms[otherSideIndex].quaternion.clone(),
        containerStartMatrix: this.placeMeshes[otherSideIndex].matrix.clone(),
      };
    }
    this.placeMeshes[index] = null;
    this.placeMeshStates[index] = null;
    this.scaleState = null;
  }
  update() {
    const transforms = rigManager.getRigTransforms();
    this.hoveredMeshes = transforms.map((transform, index) => {
      const {position, quaternion} = transform;
      localMatrix.compose(position, quaternion, localVector2.set(1, 1, 1));

      let closestMesh = null;
      let closestMeshDistance = Infinity;
      for (const mesh of this.meshes) {
        localMatrix2.copy(localMatrix)
          .premultiply(localMatrix3.getInverse(mesh.matrixWorld))
          .decompose(localVector, localQuaternion, localVector2);

        if (mesh.geometry.boundingBox.containsPoint(localVector)) {
          const distance = localVector.distanceTo(position);
          if (distance < closestMeshDistance) {
            closestMesh = mesh;
            closestMeshDistance = distance;
          }
        }
      }
      return closestMesh;
    });
    if (this.isPinching()) { // pinch
      const {scaleState} = this;
      const {container} = scaleState;
      const startPosition = scaleState.startPosition.clone()
        // .applyMatrix4(new THREE.Matrix4().getInverse(scaleState.containerStartMatrix));
      const currentPosition = transforms[0].position.clone()
        .add(transforms[1].position)
        .divideScalar(2)
        // .applyMatrix4(new THREE.Matrix4().getInverse(scaleState.containerStartMatrix));
      const currentDirection = transforms[0].position.clone()
        .sub(transforms[1].position)
        .normalize();
      const currentWorldWidth = transforms[0].position
        .distanceTo(transforms[1].position);
      const currentEuler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(scaleState.startDirection, currentDirection), 'YXZ');
      currentEuler.x = 0;
      currentEuler.z = 0;
      const currentQuaternion = new THREE.Quaternion().setFromEuler(currentEuler);
      const scaleFactor = currentWorldWidth/scaleState.startWorldWidth;
      const positionDiff = currentPosition.clone().sub(startPosition);

      container.matrix
        .copy(scaleState.containerStartMatrix)
        .premultiply(localMatrix.makeTranslation(-scaleState.containerStartPosition.x, -scaleState.containerStartPosition.y, -scaleState.containerStartPosition.z))
        .premultiply(localMatrix.makeScale(scaleFactor, scaleFactor, scaleFactor))
        .premultiply(localMatrix.makeRotationFromQuaternion(currentQuaternion))
        .premultiply(localMatrix.makeTranslation(scaleState.containerStartPosition.x, scaleState.containerStartPosition.y, scaleState.containerStartPosition.z))
        .premultiply(localMatrix.makeTranslation(positionDiff.x, positionDiff.y, positionDiff.z))
        .decompose(container.position, container.quaternion, container.scale);
    } else { // move
      for (let i = 0; i < transforms.length; i++) {
        if (this.placeMeshes[i]) {
          const transform = transforms[i];
          const {position, quaternion} = transform;
          const {startPosition, startQuaternion, containerStartMatrix} = this.placeMeshStates[i];

          this.placeMeshes[i].matrix.copy(containerStartMatrix)
            .premultiply(localMatrix.makeTranslation(-startPosition.x, -startPosition.y, -startPosition.z))
            .premultiply(localMatrix.makeRotationFromQuaternion(localQuaternion.copy(startQuaternion).inverse()))
            .premultiply(localMatrix.makeRotationFromQuaternion(quaternion))
            .premultiply(localMatrix.makeTranslation(position.x, position.y, position.z))
            .decompose(this.placeMeshes[i].position, this.placeMeshes[i].quaternion, this.placeMeshes[i].scale);
        }
      }
    }
    for (let i = 0; i < transforms.length; i++) {
      this.targetMeshes[i].visible = false;

      if (this.hoveredMeshes[i]) {
        this.targetMeshes[i].position.copy(this.hoveredMeshes[i].position)
          .add(
            this.hoveredMeshes[i].geometry.boundingBox.getCenter(new THREE.Vector3())
              .multiply(this.hoveredMeshes[i].scale)
              .applyQuaternion(this.hoveredMeshes[i].quaternion)
          );
        this.targetMeshes[i].quaternion.copy(this.hoveredMeshes[i].quaternion);
        this.hoveredMeshes[i].geometry.boundingBox.getSize(this.targetMeshes[i].scale)
          .multiply(this.hoveredMeshes[i].scale);
        this.targetMeshes[i].visible = true;
      }
    }
  }
  intersect(raycaster) {
    let closestMesh = null;
    let closestMeshDistance = Infinity;
    for (const mesh of this.meshes) {
      localMatrix.compose(
        raycaster.ray.origin,
        localQuaternion.setFromUnitVectors(
          localVector2.set(0, 0, -1),
          raycaster.ray.direction
        ),
        localVector2.set(1, 1, 1)
      )
        .premultiply(localMatrix2.getInverse(mesh.matrixWorld))
        .decompose(localVector, localQuaternion, localVector2);
      localRaycaster.ray.origin.copy(localVector);
      localRaycaster.ray.direction.set(0, 0, -1).applyQuaternion(localQuaternion);
      if (mesh.geometry.boundingBox) {
        const point = localRaycaster.ray.intersectBox(mesh.geometry.boundingBox, localVector);
        if (point) {
          point.applyMatrix4(mesh.matrixWorld);
          return {
            object: mesh,
            point: point.clone(),
            anchor: null,
            uv: new THREE.Vector2(),
          };
        }
      }
    }
    return null;
  }
  async run() {
    if (this.meshes.length === 1) {
      const [mesh] = this.meshes;
      if (mesh.userData.gltfExtensions.EXT_hash) {
        const u = `${storageHost}/${mesh.userData.gltfExtensions.EXT_hash}`;
        await rigManager.setLocalAvatarUrl(u);
      }
    }
  }
  commit() {
    const {meshes} = this;
    if (meshes.length > 0) {
      const center = new THREE.Vector3();
      for (const mesh of this.meshes) {
        center.add(mesh.position);
      }
      center.divideScalar(meshes.length);
      for (const mesh of this.meshes) {
        mesh.position.sub(center);
        mesh.updateMatrixWorld();
      }

      const geometries = [];
      const textures = [];
      for (const mesh of this.meshes) {
        geometries.push(mesh.geometry);
        if (mesh.material.uniforms.map && mesh.material.uniforms.map.value) {
          textures.push(mesh.material.uniforms.map.value);
        } else {
          textures.push(null);
        }
      }

      const mesh = mergeMeshes(meshes, geometries, textures);
      const material = meshComposer.material.clone();
      material.uniforms.map.value = mesh.material.map;
      material.uniforms.map.needsUpdate = true;
      mesh.material = material;

      for (const mesh of this.meshes) {
        mesh.geometry.dispose();
        scene.remove(mesh);
      }
      this.meshes.length = 0;

      return mesh;
    } else {
      return null;
    }
  }
  cancel() {
    for (const mesh of this.meshes) {
      scene.remove(mesh);
    }
    this.meshes.length = 0;
  }
}
const meshComposer = new MeshComposer();

const MeshDrawer = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localMatrix = new THREE.Matrix4();

  const checkerboardCanvas = (() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#CCC';
    for (let x = 0; x < canvas.width; x += 64) {
      for (let y = 0; y < canvas.height; y += 64) {
        if ((x / 64) % 2 === ((y / 64) % 2)) {
          ctx.fillRect(x, y, 64, 64);
        }
      }
    }
    return canvas;
  })();
  const _makeDrawThingCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = checkerboardCanvas.width;
    canvas.height = checkerboardCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(checkerboardCanvas, 0, 0);
    canvas.ctx = ctx;
    return canvas;
  };
  return class MeshDrawer {
    constructor() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 128 * 1024), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(3 * 128 * 1024), 1));
      const uvs = new Float32Array(2 * 128 * 1024);
      for (let i = 0; i < uvs.length; i += 2*4) {
        const index = i/(2*4);
        uvs[i+1] = index;
        uvs[i+3] = index;
        uvs[i+5] = index;
        uvs[i+7] = index;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(Infinity, Infinity, Infinity),
        new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      );

      const material = makeDrawMaterial(localColor.setStyle('#' + colors[0]).getHex(), localColor.setStyle('#' + colors[1]).getHex(), 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.mesh = mesh;

      this.lastPosition = new THREE.Vector3();
      this.lastQuaternion = new THREE.Quaternion();
      this.lastValue = 0;
      this.numPositions = 0;
      this.numIndices = 0;
    }

    start(p, q, v) {
      this.lastPosition.copy(p);
      this.lastQuaternion.copy(q);
      this.numPositions = 0;
      this.numIndices = 0;
      this.mesh.geometry.setDrawRange(0, 0);
      this.mesh.geometry.boundingBox.min.set(Infinity, Infinity, Infinity);
      this.mesh.geometry.boundingBox.max.set(-Infinity, -Infinity, -Infinity);
      this.mesh.visible = false;
    }

    end(p, q, v) {
      const geometry = new THREE.BufferGeometry();
      const positions = this.mesh.geometry.attributes.position.array.slice(0, this.numPositions);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const uvs = this.mesh.geometry.attributes.uv.array.slice(0, this.numPositions/3*2);
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      /* const colors = new Float32Array(geometry.attributes.position.array.length);
      for (let i = 0; i < geometry.attributes.uv.array.length; i += 2) {
        const y = geometry.attributes.uv.array[i+1]/this.mesh.material.uniforms.numPoints.value;
        localColor.copy(this.mesh.material.uniforms.color1.value).lerp(this.mesh.material.uniforms.color2.value, y)
          .toArray(colors, i/2*3);
        geometry.attributes.uv.array[i] = -1;
        geometry.attributes.uv.array[i+1] = -1;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); */
      const indices = this.mesh.geometry.index.array.slice(0, this.numIndices);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.boundingBox = this.mesh.geometry.boundingBox.clone();
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
      // const material = _makeDrawMaterial(this.mesh.material.uniforms.color1.value.getHex(), this.mesh.material.uniforms.color2.value.getHex(), this.mesh.material.uniforms.numPoints.value);
      const mesh = new THREE.Mesh(geometry, this.mesh.material.clone());
      mesh.matrix.copy(this.mesh.matrixWorld)
        .decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.add(center);
      mesh.frustumCulled = false;
      meshComposer.addMesh(mesh);

      this.mesh.visible = false;
    }

    update(p, q, v) {
      const startPoint = this.lastPosition;
      const endPoint = p;
      const startQuaternion = this.lastQuaternion;
      const endQuaternion = q;
      const startValue = this.lastValue;
      const endValue = v;

      const oldNumPositions = this.numPositions;
      if (this.numPositions === 0) {
        localVector.set(-startValue, 0, 0)
          .applyQuaternion(startQuaternion)
          .add(startPoint)
          .toArray(this.mesh.geometry.attributes.position.array, this.numPositions);
        this.mesh.geometry.boundingBox.expandByPoint(localVector);
        this.numPositions += 3;
        localVector.set(startValue, 0, 0)
          .applyQuaternion(startQuaternion)
          .add(startPoint)
          .toArray(this.mesh.geometry.attributes.position.array, this.numPositions);
        this.mesh.geometry.boundingBox.expandByPoint(localVector);
        this.numPositions += 3;
      }
      localVector.set(-endValue, 0, 0)
        .applyQuaternion(endQuaternion)
        .add(endPoint)
        .toArray(this.mesh.geometry.attributes.position.array, this.numPositions);
      this.mesh.geometry.boundingBox.expandByPoint(localVector);
      this.numPositions += 3;
      localVector.set(endValue, 0, 0)
        .applyQuaternion(endQuaternion)
        .add(endPoint)
        .toArray(this.mesh.geometry.attributes.position.array, this.numPositions);
      this.mesh.geometry.boundingBox.expandByPoint(localVector);
      this.numPositions += 3;

      const oldNumIndices = this.numIndices;
      const a = (this.numPositions - 3*4)/3;
      const b = a+1;
      const c = b+1;
      const d = c+1;
      this.mesh.geometry.index.array[this.numIndices++] = a;
      this.mesh.geometry.index.array[this.numIndices++] = b;
      this.mesh.geometry.index.array[this.numIndices++] = c;
      this.mesh.geometry.index.array[this.numIndices++] = b;
      this.mesh.geometry.index.array[this.numIndices++] = d;
      this.mesh.geometry.index.array[this.numIndices++] = c;

      /* this.mesh.geometry.index.array[this.numIndices++] = a;
      this.mesh.geometry.index.array[this.numIndices++] = c;
      this.mesh.geometry.index.array[this.numIndices++] = b;
      this.mesh.geometry.index.array[this.numIndices++] = b;
      this.mesh.geometry.index.array[this.numIndices++] = c;
      this.mesh.geometry.index.array[this.numIndices++] = d; */

      this.mesh.geometry.attributes.position.updateRange.offset = oldNumPositions;
      this.mesh.geometry.attributes.position.updateRange.count = this.numPositions;
      this.mesh.geometry.attributes.position.needsUpdate = true;

      this.mesh.geometry.index.updateRange.offset = oldNumIndices;
      this.mesh.geometry.index.updateRange.count = this.numIndices;
      this.mesh.geometry.index.needsUpdate = true;

      renderer.geometries.update(this.mesh.geometry);
      this.mesh.geometry.setDrawRange(0, this.numIndices);
      this.mesh.material.uniforms.numPoints.value = this.numIndices/6;
      this.mesh.material.uniforms.numPoints.needsUpdate = true;
      this.mesh.visible = true;

      this.lastPosition.copy(p);
      this.lastQuaternion.copy(q);
      this.lastValue = v;
    }

    setColors(selectedColors) {
      this.mesh.material.uniforms.color1.value.setStyle('#' + colors[selectedColors[0]]);
      this.mesh.material.uniforms.color1.needsUpdate = true;
      this.mesh.material.uniforms.color2.value.setStyle('#' + colors[selectedColors[1]]);
      this.mesh.material.uniforms.color2.needsUpdate = true;
    }
  };
})();
let meshDrawer = null;
geometryManager.waitForLoad().then(() => {
  meshDrawer = new MeshDrawer();
  geometryManager.chunkMeshContainer.add(meshDrawer.mesh);
});

const _snapBuildPosition = p => {
  p.x = Math.floor(p.x / BUILD_SNAP) * BUILD_SNAP + BUILD_SNAP / 2;
  p.y = Math.floor(p.y / BUILD_SNAP) * BUILD_SNAP + BUILD_SNAP / 2;
  p.z = Math.floor(p.z / BUILD_SNAP) * BUILD_SNAP + BUILD_SNAP / 2;
  return p;
};
const _meshEquals = (a, b) => {
  if (a.position.equals(b.position)) {
    if (a.type === b.vegetationType) {
      if (a.type === 'wood_wall') {
        return Math.floor(a.quaternion.x / pid4) === Math.floor(b.quaternion.x / pid4) &&
          Math.floor(a.quaternion.y / pid4) === Math.floor(b.quaternion.y / pid4) &&
          Math.floor(a.quaternion.z / pid4) === Math.floor(b.quaternion.z / pid4) &&
          Math.floor(a.quaternion.w / pid4) === Math.floor(b.quaternion.w / pid4);
      } else {
        return true;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
};
const _makeRigCapsule = () => {
  const geometry = new THREE.BufferGeometry().fromGeometry(new CapsuleGeometry())
    .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1, 0));
  const material = new THREE.ShaderMaterial({
    vertexShader: `\
      // uniform float iTime;
      // varying vec2 uvs;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        // uvs = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        vNormal = normal;
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vWorldPosition = worldPosition.xyz;
      }
    `,
    fragmentShader: `\
      #define PI 3.1415926535897932384626433832795

      // uniform float iTime;
      // varying vec2 uvs;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      const vec3 c = vec3(${new THREE.Color(0x1565c0).toArray().join(', ')});

      void main() {
        // vec2 uv = uvs;
        // uv.x *= 1.7320508075688772;
        // uv *= 8.0;

        vec3 direction = vWorldPosition - cameraPosition;
        float d = dot(vNormal, normalize(direction));
        float glow = d < 0.0 ? max(1. + d * 2., 0.1) : 0.;

        float a = glow;
        gl_FragColor = vec4(c, a);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.geometry.computeBoundingBox();
  mesh.frustumCulled = false;
  return mesh;
};
const rigCapsule = _makeRigCapsule();
const _intersectRigs = (() => {
  const target = new THREE.Vector3();
  return raycaster => {
    localMatrix.compose(raycaster.ray.origin, localQuaternion.setFromUnitVectors(localVector2.set(0, 0, -1), raycaster.ray.direction), localVector3.set(1, 1, 1))
      .premultiply(localMatrix2.getInverse(rigCapsule.matrixWorld))
      .decompose(localRaycaster2.ray.origin, localQuaternion, localVector2);
    localRaycaster2.ray.direction.set(0, 0, -1).applyQuaternion(localQuaternion);
    const intersection = localRaycaster2.ray.intersectBox(rigCapsule.geometry.boundingBox, target);
    if (intersection) {
      const object = rigCapsule;
      const point = intersection;
      return {
        object,
        point,
        uv: null,
      };
    } else {
      return null;
    }
  };
})();
const _updateWeapons = timeDiff => {
  for (let i = 0; i < 2; i++) {
    anchorSpecs[i] = null;
  }
  raycastChunkSpec = null;
  rayMesh.visible = false;

  const _raycastWeapon = () => {
    if (['build', 'things', 'shapes', 'inventory', 'colors', 'select'].includes(selectedWeapon)) {
      const [{position, quaternion}] = rigManager.getRigTransforms();
      localRaycaster.ray.origin.copy(position);
      localRaycaster.ray.direction.set(0, 0, -1).applyQuaternion(quaternion);
      anchorSpecs[0] = intersectUi(localRaycaster, uiManager.uiMeshes) || meshComposer.intersect(localRaycaster) || _intersectRigs(localRaycaster);

      if (anchorSpecs[0]) {
        rayMesh.position.copy(position);
        rayMesh.quaternion.copy(quaternion);
        rayMesh.scale.set(1, 1, position.distanceTo(anchorSpecs[0].point));
        rayMesh.visible = true;
      }
    }
    if (anchorSpecs[0]) { // anchor raycast
      // nothing    
    } else { // no anchor raycast
      const result = geometryManager.geometryWorker.raycast(geometryManager.tracker, rigManager.localRig.inputs.leftGamepad.position, rigManager.localRig.inputs.leftGamepad.quaternion);
      raycastChunkSpec = result;
      if (raycastChunkSpec) { // world geometry raycast
        raycastChunkSpec.point = new THREE.Vector3().fromArray(raycastChunkSpec.point);
        raycastChunkSpec.normal = new THREE.Vector3().fromArray(raycastChunkSpec.normal);
        raycastChunkSpec.objectPosition = new THREE.Vector3().fromArray(raycastChunkSpec.objectPosition);
        raycastChunkSpec.objectQuaternion = new THREE.Quaternion().fromArray(raycastChunkSpec.objectQuaternion);
        cubeMesh.position.copy(raycastChunkSpec.point);
      }
    }
  };
  _raycastWeapon();

  const _selectWeapon = () => {
    const {leftGamepad: rightGamepad, rightGamepad: leftGamepad} = rigManager.localRig.inputs;
    
    [
      geometryManager.assaultRifleMesh,
      geometryManager.grenadeMesh,
      geometryManager.crosshairMesh,
      geometryManager.plansMesh,
      geometryManager.pencilMesh,
      geometryManager.pickaxeMesh,
      geometryManager.paintBrushMesh,
    ].forEach(weaponMesh => {
      if (weaponMesh) {
        weaponMesh.visible = false;
      }
    });
    const selectedWeaponModel = (() => {
      switch (selectedWeapon) {
        case 'rifle': {
          return {
            weapon: geometryManager.assaultRifleMesh,
            crosshair: geometryManager.crosshairMesh,
          };
        }
        case 'grenade': {
          return {
            weapon: geometryManager.grenadeMesh,
            crosshair: geometryManager.crosshairMesh,
          };
        }
        case 'pickaxe': {
          return geometryManager.pickaxeMesh;
        }
        case 'shovel': {
          return geometryManager.pickaxeMesh;
        }
        case 'build': {
          return [geometryManager.plansMesh, geometryManager.pencilMesh];
        }
        case 'things': {
          return geometryManager.pencilMesh;
        }
        case 'shapes': {
          return geometryManager.pencilMesh;
        }
        case 'light': {
          return geometryManager.paintBrushMesh;
        }
        case 'pencil': {
          return geometryManager.pencilMesh;
        }
        case 'paintbrush': {
          return geometryManager.paintBrushMesh;
        }
        case 'select': {
          return geometryManager.pencilMesh;
        }
        case 'physics': {
          return geometryManager.pencilMesh;
        }
        default: {
          return null;
        }
      }
    })();
    if (selectedWeaponModel) {
      if (!selectedWeaponModel.isMesh) {
        if (Array.isArray(selectedWeaponModel)) {
          // const pose2 = frame.getPose(session.inputSources[0].targetRaySpace, referenceSpace);
          // localMatrix.fromArray(pose.transform.matrix)
          // .decompose(localVector3, localQuaternion2, localVector4);

          selectedWeaponModel.forEach((weaponMesh, i) => {
            if (weaponMesh) {
              if (i === 0) {
                weaponMesh.position.copy(rightGamepad.position);
                weaponMesh.quaternion.copy(rightGamepad.quaternion);
                weaponMesh.visible = true;
              } else if (i === 1) {
                weaponMesh.position.copy(leftGamepad.position);
                weaponMesh.quaternion.copy(leftGamepad.quaternion);
                weaponMesh.visible = true;
              }
            }
          });
        } else {
          const {weapon, crosshair} = selectedWeaponModel;
          if (weapon) {
            weapon.position.copy(rightGamepad.position);
            weapon.quaternion.copy(rightGamepad.quaternion);
            weapon.visible = true;
          }
          if (crosshair) {
            crosshair.visible = true;
          }
        }
      } else {
        selectedWeaponModel.position.copy(rightGamepad.position);
        selectedWeaponModel.quaternion.copy(rightGamepad.quaternion);
        selectedWeaponModel.visible = true;
      }
    }
    addMesh.visible = false;
    removeMesh.visible = false;
    switch (selectedWeapon) {
      case 'rifle':
      case 'grenade':
      {
        if (geometryManager.crosshairMesh) {
          geometryManager.crosshairMesh.position.copy(rightGamepad.position)
            .add(localVector2.set(0, 0, -500).applyQuaternion(rightGamepad.quaternion));
          geometryManager.crosshairMesh.quaternion.copy(rightGamepad.quaternion);
          geometryManager.crosshairMesh.visible = true;
        }
        break;
      }
      case 'pickaxe':
      case 'shovel': {
        if (raycastChunkSpec) {
          removeMesh.position.copy(raycastChunkSpec.point);
          removeMesh.quaternion.setFromUnitVectors(localVector2.set(0, 1, 0), raycastChunkSpec.normal);
          removeMesh.visible = true;
        }
        break;
      }
      case 'build': {
        addMesh.position.copy(rightGamepad.position)
          .add(localVector2.set(0, 0, -2).applyQuaternion(rightGamepad.quaternion));
        addMesh.quaternion.copy(rightGamepad.quaternion);
        addMesh.visible = true;
        break;
      }
    }
  };
  _selectWeapon();

  const _handleBuild = () => {
    const {leftGamepad: rightGamepad, rightGamepad: leftGamepad} = rigManager.localRig.inputs;
    
    for (const k in geometryManager.buildMeshes) {
      for (const buildMesh of geometryManager.buildMeshes[k]) {
        buildMesh.parent && buildMesh.parent.remove(buildMesh);
      }
    }
    if (selectedWeapon === 'build') {
      const buildMesh = (() => {
        const buildMatIndex = ['wood', 'stone', 'metal'].indexOf(weaponsManager.buildMat);
        switch (weaponsManager.buildMode) {
          case 'wall': return geometryManager.buildMeshes.walls[buildMatIndex];
          case 'floor': return geometryManager.buildMeshes.platforms[buildMatIndex];
          case 'stair': return geometryManager.buildMeshes.ramps[buildMatIndex];
          default: return null;
        }
      })();

      buildMesh.position.copy(rightGamepad.position)
        .add(localVector3.set(0, 0, -BUILD_SNAP).applyQuaternion(rightGamepad.quaternion))
        .add(localVector3.set(0, -BUILD_SNAP / 2, 0));
      buildMesh.quaternion.copy(rightGamepad.quaternion);

      buildMesh.matrix.compose(buildMesh.position, buildMesh.quaternion, buildMesh.scale)
        .premultiply(localMatrix2.getInverse(geometryManager.currentChunkMesh.matrixWorld))
        .decompose(buildMesh.position, buildMesh.quaternion, buildMesh.scale);
      _snapBuildPosition(buildMesh.position);

      localVector3.set(0, 1, 0).applyQuaternion(buildMesh.quaternion);
      if (Math.abs(localVector3.x) > Math.abs(localVector3.y) && Math.abs(localVector3.x) > Math.abs(localVector3.z)) {
        localVector3.set(Math.sign(localVector3.x), 0, 0);
      } else if (Math.abs(localVector3.y) > Math.abs(localVector3.x) && Math.abs(localVector3.y) > Math.abs(localVector3.z)) {
        localVector3.set(0, Math.sign(localVector3.y), 0);
      } else {
        localVector3.set(0, 0, Math.sign(localVector3.z));
      }
      localVector4.set(0, 0, -1).applyQuaternion(buildMesh.quaternion);
      if (Math.abs(localVector4.x) > Math.abs(localVector4.y) && Math.abs(localVector4.x) > Math.abs(localVector4.z)) {
        localVector4.set(Math.sign(localVector4.x), 0, 0);
      } else if (Math.abs(localVector4.y) > Math.abs(localVector4.x) && Math.abs(localVector4.y) > Math.abs(localVector4.z)) {
        localVector4.set(0, Math.sign(localVector4.y), 0);
      } else {
        localVector4.set(0, 0, Math.sign(localVector4.z));
      }
      buildMesh.quaternion.setFromRotationMatrix(localMatrix2.lookAt(
        localVector2.set(0, 0, 0),
        localVector4,
        localVector3,
      ));

      const hasBuildMesh = (() => {
        for (const index in geometryManager.currentChunkMesh.vegetationMeshes) {
          const subparcelBuildMeshesSpec = geometryManager.currentChunkMesh.vegetationMeshes[index];
          if (subparcelBuildMeshesSpec && subparcelBuildMeshesSpec.meshes.some(m => _meshEquals(m, buildMesh))) {
            return true;
          }
        }
        return false;
      })();
      if (!hasBuildMesh) {
        buildMesh.traverse(o => {
          if (o.isMesh && o.originalMaterial) {
            o.material = o.originalMaterial;
            o.originalMaterial = null;
          }
        });
      } else {
        buildMesh.traverse(o => {
          if (o.isMesh && !o.originalMaterial) {
            o.originalMaterial = o.material;
            o.material = redBuildMeshMaterial;
          }
        });
      }

      geometryManager.currentChunkMesh.add(buildMesh);
    }
  };
  _handleBuild();

  const _handleDown = () => {
    if (ioManager.currentWeaponDown && !ioManager.lastWeaponDown) { // XXX make this dual handed
      // place
      for (let i = 0; i < 2; i++) {
        const placeMesh = meshComposer.getPlaceMesh(i);
        if (placeMesh) {
          meshComposer.trigger(i);
          return;
        }
      }
      // else
      const _applyLightfieldDelta = async (position, delta) => {
        localVector2.copy(position)
          .applyMatrix4(localMatrix.getInverse(geometryManager.currentChunkMesh.matrixWorld));
        localVector2.x = Math.floor(localVector2.x);
        localVector2.y = Math.floor(localVector2.y);
        localVector2.z = Math.floor(localVector2.z);

        const mineSpecs = _applyMineSpec(localVector2, delta, 'lightfield', SUBPARCEL_SIZE_P1, planet.getFieldIndex, delta);
        await _mine(mineSpecs, null);
      };
      const _applyHit = delta => {
        if (raycastChunkSpec) {
          if (raycastChunkSpec.objectId === 0) {
            localVector2.copy(raycastChunkSpec.point)
              .applyMatrix4(localMatrix.getInverse(geometryManager.currentChunkMesh.matrixWorld));

            geometryManager.geometryWorker.requestMine(geometryManager.tracker, localVector2, delta);
          } else {
            geometryManager.currentVegetationMesh.hitTracker.hit(raycastChunkSpec.objectId, raycastChunkSpec.objectPosition, raycastChunkSpec.objectQuaternion, 30);
          }
        }
      };
      const _hit = () => _applyHit(-0.3);
      const _unhit = () => _applyHit(0.3);
      const _light = () => {
        if (raycastChunkSpec) {
          localVector2.copy(raycastChunkSpec.point)
            .applyMatrix4(localMatrix.getInverse(geometryManager.currentChunkMesh.matrixWorld));

          geometryManager.geometryWorker.requestLight(geometryManager.tracker, localVector2, 4);

          /* if (raycastChunkSpec.mesh.isChunkMesh || raycastChunkSpec.mesh.isVegetationMesh) {
            _applyLightfieldDelta(raycastChunkSpec.point, 4);

            localVector2.copy(raycastChunkSpec.point)
              .applyMatrix4(localMatrix.getInverse(geometryManager.currentChunkMesh.matrixWorld));
            localVector2.x = Math.floor(localVector2.x / SUBPARCEL_SIZE);
            localVector2.y = Math.floor(localVector2.y / SUBPARCEL_SIZE);
            localVector2.z = Math.floor(localVector2.z / SUBPARCEL_SIZE);
            geometryManager.currentChunkMesh.updateSlab(localVector2.x, localVector2.y, localVector2.z);
          } */
        }
      };
      const _explode = (position, quaternion) => {
        const explosionMesh = _makeExplosionMesh();
        explosionMesh.position.copy(position);
        explosionMesh.quaternion.copy(quaternion);
        scene.add(explosionMesh);
        explosionMeshes.push(explosionMesh);
      };
      const _damage = dmg => {
        uiManager.hpMesh.damage(dmg);
      };
      const _openTradeMesh = (point, mesh) => {
        for (const infoMesh of uiManager.infoMeshes) {
          infoMesh.visible = false;
        }

        const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
        uiManager.tradeMesh.position.copy(point);
        localEuler.setFromQuaternion(localQuaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          uiManager.tradeMesh.position.clone().sub(xrCamera.position).normalize()
        ), 'YXZ');
        localEuler.x = 0;
        localEuler.z = 0;
        uiManager.tradeMesh.quaternion.setFromEuler(localEuler);
        uiManager.tradeMesh.visible = true;
      };
      const _openDetailsMesh = (point, mesh) => {
        for (const infoMesh of uiManager.infoMeshes) {
          infoMesh.visible = false;
        }

        const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
        uiManager.detailsMesh.position.copy(point);
        localEuler.setFromQuaternion(localQuaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          uiManager.detailsMesh.position.clone().sub(xrCamera.position).normalize()
        ), 'YXZ');
        localEuler.x = 0;
        localEuler.z = 0;
        uiManager.detailsMesh.quaternion.setFromEuler(localEuler);
        uiManager.detailsMesh.visible = true;
      };
      const _triggerAnchor = mesh => {
        for (let i = 0; i < 2; i++) {
          const anchorSpec = anchorSpecs[i];
          if (anchorSpec) {
            let match;
            if (match = anchorSpec.anchor && anchorSpec.anchor.id.match(/^icon-([0-9]+)$/)) { // menu icon
              const srcIndex = parseInt(match[1], 10);
              mesh.handleIconClick(i, srcIndex);
            } else {
              if (anchorSpec.object.click) { // menu non-icon
                anchorSpec.object.click(anchorSpec);
              } else { // non-menu
                if (anchorSpec.object === rigCapsule) {
                  _openTradeMesh(anchorSpec.point, anchorSpec.object);
                } else {
                  _openDetailsMesh(anchorSpec.point, anchorSpec.object);
                }
              }
            }
          }
        }
      };
      switch (selectedWeapon) {
        case 'rifle': {
          _hit();
          localVector2.copy(geometryManager.assaultRifleMesh.position)
            .add(localVector3.set(0, 0.09, -0.7).applyQuaternion(geometryManager.assaultRifleMesh.quaternion));
          _explode(localVector2, geometryManager.assaultRifleMesh.quaternion);
          geometryManager.crosshairMesh.trigger();
          break;
        }
        case 'grenade': {
          if (geometryManager.currentChunkMesh) {
            const pxMesh = geometryManager.grenadeMesh.clone();

            localVector2.copy(geometryManager.grenadeMesh.position)
              .applyMatrix4(localMatrix.getInverse(geometryManager.currentChunkMesh.matrixWorld));
            localQuaternion2.copy(geometryManager.grenadeMesh.quaternion)
              .premultiply(geometryManager.currentChunkMesh.getWorldQuaternion(localQuaternion3).inverse());
            pxMesh.position.copy(localVector2);
            pxMesh.velocity = new THREE.Vector3(0, 0, -10)
              .applyQuaternion(localQuaternion2);
            pxMesh.angularVelocity = new THREE.Vector3((-1 + Math.random() * 2) * Math.PI * 2 * 0.01, (-1 + Math.random() * 2) * Math.PI * 2 * 0.01, (-1 + Math.random() * 2) * Math.PI * 2 * 0.01);
            pxMesh.isBuildMesh = true;
            const startTime = Date.now();
            const endTime = startTime + 3000;
            pxMesh.update = () => {
              if (Date.now() < endTime) {
                return true;
              } else {
                pxMesh.getWorldPosition(localVector2);
                pxMesh.getWorldQuaternion(localQuaternion2);
                _explode(localVector2, localQuaternion2);
                _damage(15);
                return false;
              }
            };
            geometryManager.currentChunkMesh.add(pxMesh);
            pxMeshes.push(pxMesh);
          }
          break;
        }
        case 'pickaxe': {
          _hit();
          break;
        }
        case 'shovel': {
          _unhit();
          break;
        }
        case 'light': {
          _light();
          break;
        }
        case 'build': {
          if (anchorSpecs[0]) {
            _triggerAnchor(uiManager.buildsMesh);
          } else {
            const buildMesh = (() => {
              const buildMatIndex = ['wood', 'stone', 'metal'].indexOf(weaponsManager.buildMat);
              switch (weaponsManager.buildMode) {
                case 'wall': return geometryManager.buildMeshes.walls[buildMatIndex];
                case 'floor': return geometryManager.buildMeshes.platforms[buildMatIndex];
                case 'stair': return geometryManager.buildMeshes.ramps[buildMatIndex];
                default: return null;
              }
            })();
            const hasBuildMesh = (() => {
              for (const index in geometryManager.currentChunkMesh.vegetationMeshes) {
                const subparcelBuildMeshesSpec = geometryManager.currentChunkMesh.vegetationMeshes[index];
                if (subparcelBuildMeshesSpec && subparcelBuildMeshesSpec.meshes.some(m => _meshEquals(m, buildMesh))) {
                  return true;
                }
              }
              return false;
            })();
            if (!hasBuildMesh) {
              geometryManager.geometryWorker.requestAddObject(geometryManager.tracker, geometryManager.geometrySet, buildMesh.vegetationType, buildMesh.position, buildMesh.quaternion);
            }
          }
          break;
        }
        case 'things': {
          _triggerAnchor(uiManager.thingsMesh);
          break;
        }
        case 'shapes': {
          _triggerAnchor(uiManager.shapesMesh);
          break;
        }
        case 'inventory': {
          _triggerAnchor(uiManager.inventoryMesh);
          break;
        }
        case 'colors': {
          _triggerAnchor(uiManager.colorsMesh);
          break;
        }
        case 'select': {
          _triggerAnchor();
          if (!anchorSpecs[0] && raycastChunkSpec && raycastChunkSpec.objectId !== 0) {
            _openDetailsMesh(raycastChunkSpec.point, raycastChunkSpec.mesh);
          }
          break;
        }
      }
    }
    if (ioManager.currentWeaponValue >= 0.01) {
      switch (selectedWeapon) {
        case 'pencil': {
          let value;
          if (renderer.xr.getSession()) {
            localVector2.copy(rightGamepad.position);
            localQuaternion2.copy(rightGamepad.quaternion);
            value = ioManager.currentWeaponValue * 0.1;
          } else {
            localVector2.copy(geometryManager.pencilMesh.position)
              .add(localVector3.set(0, 0, -0.5).applyQuaternion(geometryManager.pencilMesh.quaternion));
            value = 0.1;
          }
          localMatrix2.compose(localVector2, localQuaternion2, localVector3.set(1, 1, 1))
            .premultiply(localMatrix3.getInverse(meshDrawer.mesh.parent.matrixWorld))
            .decompose(localVector2, localQuaternion2, localVector3);

          if (lastWeaponValue < 0.01) {
            meshDrawer.start(localVector2, localQuaternion2, value);
          }
          meshDrawer.update(localVector2, localQuaternion2, value);
          break;
        }
      }
    }
    if (ioManager.currentWeaponDown) {
      switch (selectedWeapon) {
        case 'paintbrush': {
          console.log('click paintbrush 1');

          if (raycastChunkSpec && raycastChunkSpec.objectId !== 0) {
            const index = meshDrawer.thingSources.findIndex(thingSource => thingSource.objectId === raycastChunkSpec.objectId);
            if (index !== -1) {
              const thingSource = meshDrawer.thingSources[index];
              const thingMesh = meshDrawer.thingMeshes[index];

              const {point, faceIndex} = raycastChunkSpec;
              const {geometryData: {positions, uvs, indices}} = thingSource;
              const ai = indices[faceIndex * 3];
              const bi = indices[faceIndex * 3 + 1];
              const ci = indices[faceIndex * 3 + 2];
              const tri = new THREE.Triangle(
                new THREE.Vector3().fromArray(positions, ai * 3).applyMatrix4(thingSource.matrixWorld),
                new THREE.Vector3().fromArray(positions, bi * 3).applyMatrix4(thingSource.matrixWorld),
                new THREE.Vector3().fromArray(positions, ci * 3).applyMatrix4(thingSource.matrixWorld),
              );
              const uva = new THREE.Vector2().fromArray(uvs, ai * 3);
              const uvb = new THREE.Vector2().fromArray(uvs, bi * 3);
              const uvc = new THREE.Vector2().fromArray(uvs, ci * 3);
              const uv = THREE.Triangle.getUV(point, tri.a, tri.b, tri.c, uva, uvb, uvc, new THREE.Vector2());
              // console.log('painting', geometryManager.currentChunkMesh, raycastChunkSpec, thingSource, tri, point.toArray(), uv.toArray());
              const f = 10;
              const canvas = thingMesh.material.uniforms.tex.value.image;
              canvas.ctx.fillStyle = '#000';
              canvas.ctx.fillRect(uv.x * canvas.width - f / 2, (1 - uv.y) * canvas.height - f / 2, f, f);
              thingMesh.material.uniforms.tex.value.needsUpdate = true;
            }
          }
          break;
        }
        case 'physics': {
          console.log('click physics 1');
          break;
        }
      }
    }
    if (ioManager.lastWeaponValue >= 0.01 && ioManager.currentWeaponValue < 0.01) {
      switch (selectedWeapon) {
        case 'pencil': {
          let value;
          if (renderer.xr.getSession()) {
            localVector2.copy(rightGamepad.position);
            localQuaternion2.copy(rightGamepad.quaternion);
            value = ioManager.currentWeaponValue * 0.1;
          } else {
            localVector2.copy(geometryManager.pencilMesh.position)
              .add(localVector3.set(0, 0, -0.5).applyQuaternion(geometryManager.pencilMesh.quaternion));
            value = 0.1;
          }
          localMatrix2.compose(localVector2, localQuaternion2, localVector3.set(1, 1, 1))
            .premultiply(localMatrix3.getInverse(meshDrawer.mesh.parent.matrixWorld))
            .decompose(localVector2, localQuaternion2, localVector3);

          meshDrawer.end(localVector2, localQuaternion2, value);
          break;
        }
      }
    }
    if (ioManager.lastWeaponDown && !ioManager.currentWeaponDown) {
      switch (selectedWeapon) {
        case 'paintbrush': {
          console.log('click paintbrush 2');
          break;
        }
        case 'physics': {
          console.log('click physics 2');
          break;
        }
      }
    }
  };
  _handleDown();

  const _handleGrab = () => {
    for (let i = 0; i < 2; i++) {
      if (ioManager.currentWeaponGrabs[i] && !ioManager.lastWeaponGrabs[i]) {
        meshComposer.grab(i);
      }
      if (!ioManager.currentWeaponGrabs[i] && ioManager.lastWeaponGrabs[i]) {
        meshComposer.ungrab(i);
      }
    }
  };
  _handleGrab();

  // select
  const _handleSelect = () => {
    for (const material of geometryManager.currentChunkMesh.material) {
      material.uniforms.uSelectRange.value.set(NaN, NaN, NaN, NaN);
      material.uniforms.uSelectRange.needsUpdate = true;
    }
    geometryManager.currentVegetationMesh.material[0].uniforms.uSelectId.value = -1;
    geometryManager.currentVegetationMesh.material[0].uniforms.uSelectId.needsUpdate = true;
    geometryManager.currentThingMesh.material[0].uniforms.uSelectId.value = -1;
    geometryManager.currentThingMesh.material[0].uniforms.uSelectId.needsUpdate = true;
    /* for (const drawThingMesh of meshDrawer.thingMeshes) {
      drawThingMesh.material.uniforms.uSelectColor.value.setHex(0xFFFFFF);
      drawThingMesh.material.uniforms.uSelectColor.needsUpdate = true;
    } */

    if (rigCapsule.parent && !uiManager.tradeMesh.visible) {
      rigCapsule.parent.remove(rigCapsule);
    }
    
    switch (selectedWeapon) {
      case 'select': {
        if (anchorSpecs[0] && anchorSpecs[0].object === rigCapsule) {
          rigCapsule.position.copy(anchorSpecs[0].object.position);
          scene.add(rigCapsule);
        } else if (raycastChunkSpec) {
          if (raycastChunkSpec.objectId === 0) {
            for (const material of geometryManager.currentChunkMesh.material) {
              const minX = Math.floor(raycastChunkSpec.point.x / SUBPARCEL_SIZE);
              const minY = Math.floor(raycastChunkSpec.point.z / SUBPARCEL_SIZE);
              const maxX = minX + 1;
              const maxY = minY + 1;
              material.uniforms.uSelectRange.value.set(minX, minY, maxX, maxY).multiplyScalar(SUBPARCEL_SIZE);
              material.uniforms.uSelectRange.needsUpdate = true;
            }
          } else {
            geometryManager.currentVegetationMesh.material[0].uniforms.uSelectId.value = raycastChunkSpec.objectId;
            geometryManager.currentVegetationMesh.material[0].uniforms.uSelectId.needsUpdate = true;
            geometryManager.currentThingMesh.material[0].uniforms.uSelectId.value = raycastChunkSpec.objectId;
            geometryManager.currentThingMesh.material[0].uniforms.uSelectId.needsUpdate = true;

            /* const index = meshDrawer.thingSources.findIndex(thingSource => thingSource.objectId === raycastChunkSpec.objectId);
            if (index !== -1) {
              const drawThingMesh = meshDrawer.thingMeshes[index];
              drawThingMesh.material.uniforms.uSelectColor.value.setHex(0x29b6f6);
              drawThingMesh.material.uniforms.uSelectColor.needsUpdate = true;
            } */
          }
        }
        break;
      }
    }
  };
  _handleSelect();
  
  const _handleMenu = () => {
    for (const menuMesh of uiManager.menuMeshes) {
      menuMesh.visible = false;
    }

    const selectedMenuMesh = (() => {
      switch (selectedWeapon) {
        case 'build': return geometryManager.buildsMesh;
        case 'things': return geometryManager.thingsMesh;
        case 'shapes': return geometryManager.shapesMesh;
        case 'inventory': return geometryManager.inventoryMesh;
        case 'colors': return geometryManager.colorsMesh;
        default: return null;
      }
    })();

    if (renderer.xr.getSession()) {
      if (selectedMenuMesh) {
        selectedMenuMesh.position.copy(leftGamepad.position)
          .add(localVector.set(0.1, 0.1, 0).applyQuaternion(leftGamepad.quaternion));
        selectedMenuMesh.quaternion.copy(leftGamepad.quaternion);
        selectedMenuMesh.scale.setScalar(1, 1, 1);
        selectedMenuMesh.visible = true;
      }
    } else {
      if (selectedMenuMesh && menuExpanded) {
        if (!lastMenuExpanded || selectedWeapon !== lastSelectedWeapon) {
          localMatrix.copy(rigManager.localRigMatrixEnabled ? rigManager.localRigMatrix : camera.matrixWorld)
            .multiply(localMatrix2.makeTranslation(0, 0, -3))
            .decompose(selectedMenuMesh.position, selectedMenuMesh.quaternion, selectedMenuMesh.scale);
          selectedMenuMesh.scale.setScalar(20);
        }
        selectedMenuMesh.visible = true;
      }
    }
  };
  _handleMenu();

  /* const currentParcel = _getCurrentParcel(localVector);
  if (!currentParcel.equals(lastParcel)) {
    if (currentParcel.x !== lastParcel.x) {
      currentParcel.z = lastParcel.z;
    } else if (currentParcel.z !== lastParcel.z) {
      currentParcel.x = lastParcel.x;
    }
    planetAnimation && _tickPlanetAnimation(1);
    const sub = lastParcel.clone().sub(currentParcel);
    const pivot = currentParcel.clone().add(lastParcel).multiplyScalar(10/2);
    _animatePlanet(planetContainer.matrix.clone(), pivot, new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sub));
    lastParcel = currentParcel;
  } */

  const _handleTeleport = () => {
    const _teleportTo = (position, quaternion) => {
      const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
      // console.log(position, quaternion, pose, avatar)
      /* localMatrix.fromArray(rigManager.localRig.model.matrix)
        .decompose(localVector2, localQuaternion2, localVector3); */

      if (renderer.xr.getSession()) {
        localMatrix.copy(xrCamera.matrix)
          .premultiply(dolly.matrix)
          .decompose(localVector2, localQuaternion2, localVector3);
        dolly.matrix
          .premultiply(localMatrix.makeTranslation(position.x - localVector2.x, position.y - localVector2.y, position.z - localVector2.z))
          // .premultiply(localMatrix.makeRotationFromQuaternion(localQuaternion3.copy(quaternion).inverse()))
          // .premultiply(localMatrix.makeTranslation(localVector2.x, localVector2.y, localVector2.z))
          .premultiply(localMatrix.makeTranslation(0, cameraManager.getFullAvatarHeight(), 0))
          .decompose(dolly.position, dolly.quaternion, dolly.scale);
      } else {
        camera.matrix
          .premultiply(localMatrix.makeTranslation(position.x - camera.position.x, position.y - camera.position.y, position.z - camera.position.z))
          // .premultiply(localMatrix.makeRotationFromQuaternion(localQuaternion3.copy(quaternion).inverse()))
          // .premultiply(localMatrix.makeTranslation(localVector2.x, localVector2.y, localVector2.z))
          .premultiply(localMatrix.makeTranslation(0, cameraManager.getFullAvatarHeight(), 0))
          .decompose(camera.position, camera.quaternion, camera.scale);
      }

      physicsManager.velocity.set(0, 0, 0);
    };

    teleportMeshes[1].update(rigManager.localRig.inputs.leftGamepad.position, rigManager.localRig.inputs.leftGamepad.quaternion, ioManager.currentTeleport, (p, q) => geometryManager.geometryWorker.raycast(geometryManager.tracker, p, q), (position, quaternion) => {
      _teleportTo(position, localQuaternion.set(0, 0, 0, 1));
    });
  };
  _handleTeleport();

  meshComposer.update();
  
  explosionMeshes = explosionMeshes.filter(explosionMesh => {
    explosionMesh.material.uniforms.uAnimation.value += timeDiff;
    if (explosionMesh.material.uniforms.uAnimation.value < 1) {
      return true;
    } else {
      scene.remove(explosionMesh);
      return false;
    }
  });
  pxMeshes = pxMeshes.filter(pxMesh => {
    if (pxMesh.update()) {
      if (!pxMesh.velocity.equals(zeroVector)) {
        localMatrix.copy(pxMesh.matrixWorld)
          .decompose(localVector, localQuaternion, localVector2);
        const collision = geometryManager.geometryWorker.collide(geometryManager.tracker, 0.2, 0, localVector, localQuaternion2.set(0, 0, 0, 1), 1);

        if (collision) {
          localVector3.fromArray(collision.direction)
            .applyQuaternion(pxMesh.parent.getWorldQuaternion(localQuaternion).inverse());
          pxMesh.position.add(localVector3);
          pxMesh.velocity.copy(zeroVector);
          // pxMesh.angularVelocity.copy(zeroVector);
        } else {
          physicsManager.applyVelocity(pxMesh.position, pxMesh.velocity, timeDiff);
          pxMesh.velocity.add(localVector.set(0, -9.8 * timeDiff, 0).applyQuaternion(pxMesh.parent.getWorldQuaternion(localQuaternion).inverse()));
          pxMesh.rotation.x += pxMesh.angularVelocity.x;
          pxMesh.rotation.y += pxMesh.angularVelocity.y;
          pxMesh.rotation.z += pxMesh.angularVelocity.z;
        }
      }
      return true;
    } else {
      pxMesh.parent.remove(pxMesh);
      return false;
    }
  });
};

renderer.domElement.addEventListener('wheel', e => {
  if (document.pointerLockElement) {
    if (anchorSpecs[0] && [thingsMesh, inventoryMesh].includes(anchorSpecs[0].object)) {
      anchorSpecs[0].object.scrollY(e.deltaY);
    }
  }
});

const weaponsManager = {
  weapons,
  cubeMesh,
  buildMode: 'wall',
  buildMat: 'wood',
  getWeapon() {
    return selectedWeapon;
  },
  setWeapon(newSelectedWeapon) {
    selectedWeapon = selectedWeapon;
  },
  update(timeDiff) {
    _updateWeapons(timeDiff);
  },
};
export default weaponsManager;