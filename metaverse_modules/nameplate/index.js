import * as THREE from "three";
import metaversefile from "metaversefile";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getModelGeoMat } from "./model";
import { Matrix4 } from "three";

const { useApp, useCamera, useLocalPlayer, useMaterials, useFrame, useText } =
  metaversefile;

const Text = useText();
const gltfLoader = new GLTFLoader();
const height = 0.3;
let nameplateMesh = null;

async function createNameplateMesh() {
  if (nameplateMesh) return;
  const nameplateModelUrl = "./models/nameplate.glb";
  const nameplateModel = await new Promise((resolve, reject) => {
    gltfLoader.load(nameplateModelUrl, resolve, () => {}, reject);
  });
  const { geometry, material } = getModelGeoMat(nameplateModel);
  nameplateMesh = new THREE.InstancedMesh(geometry, material, 1000);
}

const createNameplateInstance = () => {
  if (!nameplateMesh) return 0;
  if (!nameplateMesh.instanceIndex) nameplateMesh.instanceIndex = 0;
  return nameplateMesh.instanceIndex++;
};

async function getTextMesh(
  text = "",
  font = "./fonts/Plaza Regular.ttf",
  fontSize = 0.75,
  anchorX = "left",
  anchorY = "middle",
  color = 0x000000
) {
  const textMesh = new Text();
  textMesh.text = text;
  textMesh.font = font;
  textMesh.fontSize = fontSize;
  textMesh.color = color;
  textMesh.anchorX = anchorX;
  textMesh.anchorY = anchorY;
  textMesh.frustumCulled = false;
  await new Promise((resolve) => {
    textMesh.sync(resolve);
  });
  return textMesh;
}

export default () => {
  const app = useApp();
  const localPlayer = useLocalPlayer();
  // if (app.player === localPlayer) return app;
  const camera = useCamera();
  let textMesh = null;
  let lastPlateToCamera = new THREE.Vector3();
  let instIndex = -1;
  let plateToCameraAngle = 0;

  (async () => {
    if (!nameplateMesh) {
      await createNameplateMesh();
      app.add(nameplateMesh);
    }
    instIndex = createNameplateInstance();
    const font = "./fonts/GeosansLight.ttf";
    const fontSize = 0.06;
    const anchorX = "center";
    const anchorY = "top";
    const color = 0xffffff;
    textMesh = await getTextMesh(
      app.player.name,
      font,
      fontSize,
      anchorX,
      anchorY,
      color
    );
    let box = new THREE.Box3().setFromObject(textMesh);
    let boundingBoxSize = box.max.sub(box.min);
    let height = boundingBoxSize.y;
    textMesh.position.set(0, height * 1.001, 0.001);
    app.add(textMesh);
    app.add(new THREE.AxesHelper(10));
  })();

  useFrame(() => {
    if (!app.player || instIndex < 0) return;
    let nameplateMatrix = new THREE.Matrix4();
    nameplateMesh.getMatrixAt(instIndex, nameplateMatrix);
    const plateToCamera = new THREE.Vector3().subVectors(
      camera.position,
      new THREE.Vector3().setFromMatrixPosition(nameplateMatrix)
    );
    if (!lastPlateToCamera.equals(plateToCamera)) {
      plateToCameraAngle = Math.atan2(plateToCamera.x, plateToCamera.z);
      lastPlateToCamera.copy(plateToCamera);
    }
    nameplateMatrix.copy(
      new Matrix4()
        .multiplyMatrices(
          new Matrix4().makeScale(4, 4, 4),
          new Matrix4().makeRotationY(plateToCameraAngle)
        )
        .setPosition(
          app.player.position.x,
          app.player.position.y + height,
          app.player.position.z
        )
    );
    nameplateMesh.setMatrixAt(instIndex, nameplateMatrix);
    nameplateMesh.instanceMatrix.needsUpdate = true;
    textMesh.geometry.applyMatrix4(nameplateMatrix);
  });

  return app;
};
