import * as THREE from "three";
import metaversefile from "metaversefile";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getModelGeoMat } from "./model";
// import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
// import { getCaretAtPoint } from "troika-three-text";
// import { inappPreviewHost } from "../../constants";

const {
  useApp,
  useCamera,
  useLocalPlayer,
  useMaterials,
  useFrame,
  useText,
  // useInternals,
  // usePhysics,
} = metaversefile;

const localVector4D = new THREE.Vector4();
const { WebaverseShaderMaterial } = useMaterials();
const Text = useText();
const gltfLoader = new GLTFLoader();
const destroyForLocalPlayer = true;
const height = 0.3;

async function makeNameplateMesh({}) {
  const nameplateModelUrl = "./models/nameplate.glb";
  const nameplateModel = await new Promise((resolve, reject) => {
    gltfLoader.load(nameplateModelUrl, resolve, console.log, reject);
  });
  const { geometry, material } = getModelGeoMat(nameplateModel);
  console.log("nameplate_geometry", geometry);
  const nameplateMesh = new THREE.Mesh(geometry, material);
  // nameplateMesh.updateMatrix();
  // nameplateMesh.updateMatrixWorld();
  // nameplateMesh.matrixWorldNeedsUpdate = true;
  return nameplateMesh;
}

async function makeTextMesh(
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
  let name = app.player.name;
  const lastPosition = new THREE.Vector3();
  const lastAppToCamera = new THREE.Vector3();

  (async () => {
    const font = "./fonts/GeosansLight.ttf";
    const fontSize = 0.18;
    const anchorX = "center";
    const anchorY = "top";
    const color = 0xffffff;
    textMesh = await makeTextMesh(
      name,
      font,
      fontSize,
      anchorX,
      anchorY,
      color
    );
    textMesh.position.set(0, 0.2, 0.001);

    const nameplateMesh = await makeNameplateMesh({});
    nameplateMesh.scale.set(4, 4, 4);
    nameplateMesh.add(textMesh);
    app.add(nameplateMesh);
  })();

  useFrame(() => {
    if (!textMesh || !app.player) return;
    app.updateMatrixWorld();
    app.position.set(
      app.player.position.x,
      app.player.position.y + height,
      app.player.position.z
    );
    lastPosition.copy(app.position);
    // app and camera are both THREE.Object3D type
    // write a function the makes app face camera
    // const appToCamera = new THREE.Vector3().subVectors(
    //   camera.position,
    //   app.position
    // );
    // if (!lastAppToCamera.equals(appToCamera)) {
    //   const appToCameraAngle = Math.atan2(appToCamera.x, appToCamera.z);
    //   app.rotation.y = appToCameraAngle;
    //   lastAppToCamera.copy(appToCamera);
    // }
    // name change
    // TODO: This should be an event listener
    app.player.name = "Test";
    if (name !== app.player.name) {
      name = app.player.name;
      // textMesh.text = name;
      // textMesh.sync();
    }
  });

  return app;
};
