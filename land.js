import * as THREE from './three.module.js';
import {BufferGeometryUtils} from './BufferGeometryUtils.js';
import {
  SUBPARCEL_SIZE,
} from './constants.js';

const wallGeometry = (() => {
  const panelGeometries = [];
  for (let x = -SUBPARCEL_SIZE/2; x <= SUBPARCEL_SIZE/2; x++) {
    panelGeometries.push(
      new THREE.BoxBufferGeometry(0.01, 2, 0.01)
        .applyMatrix4(new THREE.Matrix4().makeTranslation(x, 1, -SUBPARCEL_SIZE/2))
    );
  }
  for (let h = 0; h <= 2; h++) {
    panelGeometries.push(
      new THREE.BoxBufferGeometry(SUBPARCEL_SIZE, 0.01, 0.01)
        .applyMatrix4(new THREE.Matrix4().makeTranslation(0, h, -SUBPARCEL_SIZE/2))
    );
  }
  return BufferGeometryUtils.mergeBufferGeometries(panelGeometries);
})();
const topWallGeometry = wallGeometry.clone()
  // .applyMatrix(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5));
const leftWallGeometry = wallGeometry.clone()
  .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), Math.PI/2))
  // .applyMatrix(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5));
const rightWallGeometry = wallGeometry.clone()
  .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), -Math.PI/2))
  // .applyMatrix(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5));
const bottomWallGeometry = wallGeometry.clone()
  .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), Math.PI))
  // .applyMatrix(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5));
const distanceFactor = 64;
export function GuardianMesh(extents, color) {
  const geometry = (() => {
    const geometries = [];
    const [[x1, y1, x2, y2]] = extents;
    const ax1 = (x1+SUBPARCEL_SIZE/2)/SUBPARCEL_SIZE;
    const ay1 = (y1+SUBPARCEL_SIZE/2)/SUBPARCEL_SIZE;
    const ax2 = (x2+SUBPARCEL_SIZE/2)/SUBPARCEL_SIZE;
    const ay2 = (y2+SUBPARCEL_SIZE/2)/SUBPARCEL_SIZE;
    for (let x = ax1; x < ax2; x++) {
      geometries.push(
        topWallGeometry.clone()
          .applyMatrix4(new THREE.Matrix4().makeTranslation(x*SUBPARCEL_SIZE, 0, ay1*SUBPARCEL_SIZE))
      );
      geometries.push(
        bottomWallGeometry.clone()
          .applyMatrix4(new THREE.Matrix4().makeTranslation(x*SUBPARCEL_SIZE, 0, (ay2-1)*SUBPARCEL_SIZE))
      );
    }
    for (let y = ay1; y < ay2; y++) {
      geometries.push(
        leftWallGeometry.clone()
          .applyMatrix4(new THREE.Matrix4().makeTranslation(ax1*SUBPARCEL_SIZE, 0, y*SUBPARCEL_SIZE))
      );
      geometries.push(
        rightWallGeometry.clone()
          .applyMatrix4(new THREE.Matrix4().makeTranslation((ax2-1)*SUBPARCEL_SIZE, 0, y*SUBPARCEL_SIZE))
      );
    }
    return BufferGeometryUtils.mergeBufferGeometries(geometries);
  })();
  const gridVsh = `
    // varying vec3 vWorldPos;
    // varying vec2 vUv;
    varying float vDepth;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      // vUv = uv;
      // vWorldPos = abs(position);
      vDepth = gl_Position.z / ${distanceFactor.toFixed(8)};
    }
  `;
  const gridFsh = `
    // uniform sampler2D uTex;
    uniform vec3 uColor;
    // uniform float uAnimation;
    // varying vec3 vWorldPos;
    varying float vDepth;
    void main() {
      gl_FragColor = vec4(uColor, (1.0-vDepth));
    }
  `;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: {
        type: 'c',
        value: new THREE.Color(color),
      },
    },
    vertexShader: gridVsh,
    fragmentShader: gridFsh,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.setColor = c => {
    mesh.material.uniforms.uColor.value.setHex(c);
  };
  return mesh;
};
