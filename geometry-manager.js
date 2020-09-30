import * as THREE from './three.module.js';
import {BasisTextureLoader} from './BasisTextureLoader.js';
import alea from './alea.js';
import easing from './easing.js';
import {
  LAND_SHADER,
  WATER_SHADER,
  VEGETATION_SHADER,
  THING_SHADER,
  makeDrawMaterial,
} from './shaders.js';
import storage from './storage.js';
import {planet} from './planet.js';
import {makePromise} from './util.js';
import {
  PARCEL_SIZE,
  SUBPARCEL_SIZE,
  chunkDistance,
  baseHeight,
  thingTextureSize,
  objectTextureSize,
  MAX_NAME_LENGTH,
} from './constants.js';
import {renderer, scene} from './app-object.js';

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localMatrix2 = new THREE.Matrix4();

const capsuleUpQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const cubicBezier = easing(0, 1, 0, 1);

const geometryManager = new EventTarget();
geometryManager.geometrySet = null;
geometryManager.tracker = null;
geometryManager.landAllocators = null;
geometryManager.landBufferAttributes = null;
geometryManager.vegetationAllocators = null;
geometryManager.vegetationBufferAttributes = null;
geometryManager.thingAllocators = null;
geometryManager.thingBufferAttributes = null;

geometryManager.buildMeshes = {
  walls: [null, null, null],
  platforms: [null, null, null],
  ramps: [null, null, null],
};
geometryManager.woodMesh = null;
geometryManager.stoneMesh = null;
geometryManager.metalMesh = null;

geometryManager.worldContainer = new THREE.Object3D();
scene.add(geometryManager.worldContainer);
geometryManager.chunkMeshContainer = new THREE.Object3D();
geometryManager.worldContainer.add(geometryManager.chunkMeshContainer);
geometryManager.currentChunkMesh = null;
geometryManager.currentVegetationMesh = null;
geometryManager.currentThingMesh = null;

const _makeHitTracker = (onDmg, onPositionUpdate, onColorUpdate, onRemove) => {
  let animation = null;
  return {
    hit(id, position, quaternion, dmg) {
      if (animation) {
        animation.end();
        animation = null;
      }

      if (onDmg(id, dmg)) {
        const startTime = Date.now();
        const endTime = startTime + 500;
        animation = {
          update() {
            const now = Date.now();
            const factor = (now - startTime) / (endTime - startTime);
            if (factor < 1) {
              localVector2.set(-1 + Math.random() * 2, -1 + Math.random() * 2, -1 + Math.random() * 2).multiplyScalar((1 - factor) * 0.2 / 2);
              onPositionUpdate(localVector2);
            } else {
              animation.end();
              animation = null;
            }
          },
          end() {
            onPositionUpdate(localVector2.set(0, 0, 0));
            onColorUpdate(-1);
          },
        };
        onColorUpdate(id);
      } else {
        onRemove(id, position, quaternion);
      }
    },
    update() {
      animation && animation.update();
    },
  };
};

const itemMeshes = [];
const addItem = (position, quaternion) => {
  const itemMesh = (() => {
    const radius = 0.5;
    const segments = 12;
    const color = 0x66bb6a;
    const opacity = 0.5;

    const object = new THREE.Object3D();

    const matMeshes = [
      geometryManager.woodMesh,
      geometryManager.stoneMesh,
      geometryManager.metalMesh,
    ];
    const matIndex = Math.floor(Math.random() * matMeshes.length);
    const matMesh = matMeshes[matIndex];
    const matMeshClone = matMesh.clone();
    matMeshClone.position.y = 0.5;
    matMeshClone.visible = true;
    matMeshClone.isBuildMesh = true;
    object.add(matMeshClone);

    const skirtGeometry = new THREE.CylinderBufferGeometry(radius, radius, radius, segments, 1, true)
      .applyMatrix4(new THREE.Matrix4().makeTranslation(0, radius / 2, 0));
    const ys = new Float32Array(skirtGeometry.attributes.position.array.length / 3);
    for (let i = 0; i < skirtGeometry.attributes.position.array.length / 3; i++) {
      ys[i] = 1 - skirtGeometry.attributes.position.array[i * 3 + 1] / radius;
    }
    skirtGeometry.setAttribute('y', new THREE.BufferAttribute(ys, 1));
    // skirtGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.5, 0));
    const skirtMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAnimation: {
          type: 'f',
          value: 0,
        },
      },
      vertexShader: `\
        #define PI 3.1415926535897932384626433832795

        uniform float uAnimation;
        attribute float y;
        attribute vec3 barycentric;
        varying float vY;
        varying float vUv;
        varying float vOpacity;
        void main() {
          vY = y * ${opacity.toFixed(8)};
          vUv = uv.x + uAnimation;
          vOpacity = 0.5 + 0.5 * (sin(uAnimation*20.0*PI*2.0)+1.0)/2.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        #define PI 3.1415926535897932384626433832795

        uniform sampler2D uCameraTex;
        varying float vY;
        varying float vUv;
        varying float vOpacity;

        vec3 c = vec3(${new THREE.Color(color).toArray().join(', ')});

        void main() {
          float a = vY * (0.9 + 0.1 * (sin(vUv*PI*2.0/0.02) + 1.0)/2.0) * vOpacity;
          gl_FragColor = vec4(c, a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      // blending: THREE.CustomBlending,
    });
    const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
    skirtMesh.frustumCulled = false;
    skirtMesh.isBuildMesh = true;
    object.add(skirtMesh);

    let animation = null;
    object.pickUp = () => {
      if (!animation) {
        skirtMesh.visible = false;

        const now = Date.now();
        const startTime = now;
        const endTime = startTime + 1000;
        const startPosition = object.position.clone();
        animation = {
          update(posePosition) {
            const now = Date.now();
            const factor = Math.min((now - startTime) / (endTime - startTime), 1);

            if (factor < 0.5) {
              const localFactor = factor / 0.5;
              object.position.copy(startPosition)
                .lerp(posePosition, cubicBezier(localFactor));
            } else if (factor < 1) {
              const localFactor = (factor - 0.5) / 0.5;
              object.position.copy(posePosition);
            } else {
              object.parent.remove(object);
              itemMeshes.splice(itemMeshes.indexOf(object), 1);
              animation = null;
            }
          },
        };
      }
    };
    object.update = posePosition => {
      if (!animation) {
        const now = Date.now();
        skirtMaterial.uniforms.uAnimation.value = (now % 60000) / 60000;
        matMeshClone.rotation.y = (now % 5000) / 5000 * Math.PI * 2;
      } else {
        animation.update(posePosition);
      }
    };

    return object;
  })();
  itemMesh.position.copy(position).applyMatrix4(geometryManager.currentVegetationMesh.matrixWorld);
  itemMesh.quaternion.copy(quaternion);
  scene.add(itemMesh);
  itemMeshes.push(itemMesh);
};
geometryManager.addItem = addItem;

/* const _align4 = n => {
  const d = n % 4;
  return d ? (n + 4 - d) : n;
}; */
const _makeChunkMesh = async (seedString, parcelSize, subparcelSize) => {
  const rng = alea(seedString);
  const seedNum = Math.floor(rng() * 0xFFFFFF);

  const landMaterial = new THREE.ShaderMaterial({
    uniforms: LAND_SHADER.uniforms,
    vertexShader: LAND_SHADER.vertexShader,
    fragmentShader: LAND_SHADER.fragmentShader,
    extensions: {
      derivatives: true,
    },
  });
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: WATER_SHADER.uniforms,
    vertexShader: WATER_SHADER.vertexShader,
    fragmentShader: WATER_SHADER.fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    extensions: {
      derivatives: true,
    },
  });
  (async () => {
    const texture = await new Promise((accept, reject) => {
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        // texture.minFilter = THREE.NearestMipmapNearestFilter;
        texture.flipY = false;
        texture.needsUpdate = true;
        accept(texture);
      };
      img.onerror = reject;
      img.src = './ground-texture.png';

      /* basisLoader.load('ground-texture.basis', texture => {
        // console.timeEnd('basis texture load');
        texture.minFilter = THREE.LinearFilter;
        accept(texture);
      }, () => {
        // console.log('onProgress');
      }, err => {
        reject(err);
      }); */
    });
    landMaterial.uniforms.tex.value = texture;
    landMaterial.uniforms.tex.needsUpdate = true;
    waterMaterial.uniforms.tex.value = texture;
    waterMaterial.uniforms.tex.needsUpdate = true;
  })();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', geometryManager.landBufferAttributes.position);
  geometry.setAttribute('normal', geometryManager.landBufferAttributes.normal);
  geometry.setAttribute('uv', geometryManager.landBufferAttributes.uv);
  // geometry.setAttribute('barycentric', geometryManager.landBufferAttributes.barycentric);
  geometry.setAttribute('ao', geometryManager.landBufferAttributes.ao);
  geometry.setAttribute('id', geometryManager.landBufferAttributes.id);
  geometry.setAttribute('skyLight', geometryManager.landBufferAttributes.skyLight);
  geometry.setAttribute('torchLight', geometryManager.landBufferAttributes.torchLight);
  // geometry.allocators = allocators;
  // const {peeks} = bufferAttributes;
  // geometry.peeks = peeks;

  const mesh = new THREE.Mesh(geometry, [landMaterial, waterMaterial]);
  mesh.frustumCulled = false;
  mesh.seedNum = seedNum;
  mesh.seedString = seedString;
  mesh.parcelSize = parcelSize;
  mesh.subparcelSize = subparcelSize;
  mesh.isChunkMesh = true;

  const _getSlabPositionOffset = spec => spec.positionsStart / Float32Array.BYTES_PER_ELEMENT;
  const _getSlabNormalOffset = spec => spec.normalsStart / Float32Array.BYTES_PER_ELEMENT;
  const _getSlabUvOffset = spec => spec.uvsStart / Float32Array.BYTES_PER_ELEMENT;
  const _getSlabAoOffset = spec => spec.aosStart / Uint8Array.BYTES_PER_ELEMENT;
  const _getSlabIdOffset = spec => spec.idsStart / Float32Array.BYTES_PER_ELEMENT;
  const _getSlabSkyLightOffset = spec => spec.skyLightsStart / Uint8Array.BYTES_PER_ELEMENT;
  const _getSlabTorchLightOffset = spec => spec.torchLightsStart / Uint8Array.BYTES_PER_ELEMENT;

  mesh.updateGeometry = spec => {
    geometry.attributes.position.updateRange.count = spec.positionsCount / Float32Array.BYTES_PER_ELEMENT;
    if (geometry.attributes.position.updateRange.count > 0) {
      geometry.attributes.position.updateRange.offset = _getSlabPositionOffset(spec);
      geometry.attributes.position.needsUpdate = true;

      geometry.attributes.normal.updateRange.count = spec.normalsCount / Float32Array.BYTES_PER_ELEMENT;
      geometry.attributes.normal.updateRange.offset = _getSlabNormalOffset(spec);
      geometry.attributes.normal.needsUpdate = true;

      geometry.attributes.uv.updateRange.count = spec.uvsCount / Float32Array.BYTES_PER_ELEMENT;
      geometry.attributes.uv.updateRange.offset = _getSlabUvOffset(spec);
      geometry.attributes.uv.needsUpdate = true;

      geometry.attributes.ao.updateRange.count = spec.aosCount / Uint8Array.BYTES_PER_ELEMENT;
      geometry.attributes.ao.needsUpdate = true;
      geometry.attributes.ao.updateRange.offset = _getSlabAoOffset(spec);

      geometry.attributes.id.updateRange.count = spec.idsCount / Float32Array.BYTES_PER_ELEMENT;
      geometry.attributes.id.updateRange.offset = _getSlabIdOffset(spec); // XXX can be removed and moved to uniforms for vegetation via vertexId
      geometry.attributes.id.needsUpdate = true;

      geometry.attributes.skyLight.updateRange.count = spec.skyLightsCount / Uint8Array.BYTES_PER_ELEMENT;
      geometry.attributes.skyLight.updateRange.offset = _getSlabSkyLightOffset(spec);
      geometry.attributes.skyLight.needsUpdate = true;

      geometry.attributes.torchLight.updateRange.count = spec.torchLightsCount / Uint8Array.BYTES_PER_ELEMENT;
      geometry.attributes.torchLight.updateRange.offset = _getSlabTorchLightOffset(spec);
      geometry.attributes.torchLight.needsUpdate = true;

      renderer.geometries.update(geometry);
    }
  };

  const currentPosition = new THREE.Vector3(NaN, NaN, NaN);
  mesh.currentPosition = currentPosition;
  /* window.getCurrentSubparcel = () => {
    localVector.set(
      Math.floor(currentPosition.x/SUBPARCEL_SIZE),
      Math.floor(currentPosition.y/SUBPARCEL_SIZE),
      Math.floor(currentPosition.z/SUBPARCEL_SIZE)
    );
    return window.getSubparcel(localVector.x, localVector.y, localVector.z);
  }; */
  // const animalsTasks = [];
  const _updateCurrentPosition = position => {
    currentPosition.copy(position)
      .applyMatrix4(localMatrix2.getInverse(mesh.matrixWorld));
    // console.log('current position', currentPosition.toArray().join(','));
    if (isNaN(currentPosition.x)) {
      debugger;
    }
  };
  /* const _updatePackages = () => {
    const packagesNeedUpdate = false;
    if (packagesNeedUpdate) {
      if (!packagesRunning) {
        (async () => {
          packagesRunning = true;
          packagesNeedUpdate = false;

          for (let i = 0; i < neededCoords.length; i++) {
            const neededCoord = neededCoords[i];
            const {index} = neededCoord;
            const subparcel = planet.peekSubparcelByIndex(index);
            for (const pkg of subparcel.packages) {
              if (!mesh.objects.some(object => object.package === pkg)) {
                const p = await XRPackage.download(pkg.dataHash);
                p.setMatrix(
                  new THREE.Matrix4().compose(
                    new THREE.Vector3().fromArray(pkg.position),
                    new THREE.Quaternion().fromArray(pkg.quaternion),
                    new THREE.Vector3(1, 1, 1)
                  ).premultiply(mesh.matrixWorld)
                );
                await pe.add(p);
                p.package = pkg;
                mesh.objects.push(p);
              }
            }
          }
          mesh.objects.slice().forEach(p => {
            const sx = Math.floor(p.package.position[0]/subparcelSize);
            const sy = Math.floor(p.package.position[1]/subparcelSize);
            const sz = Math.floor(p.package.position[2]/subparcelSize);
            const index = planet.getSubparcelIndex(sx, sy, sz);
            if (!neededCoordIndices[index]) {
              pe.remove(p);
              mesh.objects.splice(mesh.objects.indexOf(p), 1);
            } else {
              const subparcel = planet.peekSubparcelByIndex(index);
              if (!subparcel.packages.includes(p.package)) {
                pe.remove(p);
                mesh.objects.splice(mesh.objects.indexOf(p), 1);
              }
            }
          });

          packagesRunning = false;
        })();
      }
    }
  }; */
  /* const _killAnimalsTasks = index => {
    const subparcelTasks = animalsTasks[index];
    if (subparcelTasks) {
      for (const task of subparcelTasks) {
        task.cancel();
      }
      subparcelTasks.length = 0;
    }
  };
  const _updateAnimalsRemove = () => {
    if (removedCoords.length > 0) {
      animals = animals.filter(animal => {
        if (removedCoords.some(removedCoord => removedCoord.index === animal.index)) {
          animal.parent.remove(animal);
          animal.destroy();
          return false;
        } else {
          return true;
        }
      });
      for (const removedCoord of removedCoords) {
        _killAnimalsTasks(removedCoord.index);
      }
    }
  };
  const _updateAnimalsAdd = () => {
    for (const addedCoord of addedCoords) {
      const {index} = addedCoord;
      let subparcelTasks = animalsTasks[index];
      if (!subparcelTasks) {
        subparcelTasks = [];
        animalsTasks[index] = subparcelTasks;
      }

      let live = true;
      (async () => {
        const subparcel = planet.peekSubparcelByIndex(index);
        await subparcel.load;
        if (!live) return;

        const spawners = subparcel.vegetations
          .filter(vegetation => vegetation.name === 'spawner')
          .map(vegetation => ({
            position: vegetation.position,
          }));

        for (const spawner of spawners) {
          if (!makeAnimal) {
            makeAnimal = makeAnimalFactory(geometryWorker);
          }

          localVector.fromArray(spawner.position);
          const animal = makeAnimal(localVector, Math.floor(Math.random()*0xFFFFFF), () => {
            animal.parent.remove(animal);
            animal.destroy();
            animals.splice(animals.indexOf(animal), 1);
            addItemaddItem(animal.position, animal.quaternion);
          });
          animal.index = subparcel.index;
          mesh.add(animal);
          animals.push(animal);
        }
      })()
        .finally(() => {
          if (live) {
            subparcelTasks.splice(subparcelTasks.indexOf(task), 1);
          }
        });
      const task = {
        cancel() {
          live = false;
        },
      };
      subparcelTasks.push(task);
    }
  };
  const _updateAnimals = () => {
    _updateAnimalsRemove();
    _updateAnimalsAdd();
  }; */
  mesh.update = position => {
    _updateCurrentPosition(position);
    // _updateAnimals();
  };
  return mesh;
};

planet.addEventListener('load', async e => {
  const {data: chunkSpec} = e;
  const {seedString} = chunkSpec; 
  const seed = Math.floor(alea(seedString)() * 0xFFFFFF);

  await geometryWorker.waitForLoad();

  const _initializeAllocators = () => {
    const numPositions = 2 * 1024 * 1024;

    geometryManager.landAllocators = {
      positions: geometryWorker.makeArenaAllocator(numPositions * 3 * Float32Array.BYTES_PER_ELEMENT),
      normals: geometryWorker.makeArenaAllocator(numPositions * 3 * Float32Array.BYTES_PER_ELEMENT),
      uvs: geometryWorker.makeArenaAllocator(numPositions * 2 * Float32Array.BYTES_PER_ELEMENT),
      // barycentrics: geometryWorker.makeArenaAllocator(numPositions * 3*Float32Array.BYTES_PER_ELEMENT),
      aos: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
      ids: geometryWorker.makeArenaAllocator(numPositions * Float32Array.BYTES_PER_ELEMENT),
      skyLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
      torchLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
    };
    geometryManager.vegetationAllocators = {
      positions: geometryWorker.makeArenaAllocator(numPositions * 3 * Float32Array.BYTES_PER_ELEMENT),
      uvs: geometryWorker.makeArenaAllocator(numPositions * 2 * Float32Array.BYTES_PER_ELEMENT),
      ids: geometryWorker.makeArenaAllocator(numPositions * Float32Array.BYTES_PER_ELEMENT),
      indices: geometryWorker.makeArenaAllocator(numPositions * Uint32Array.BYTES_PER_ELEMENT),
      skyLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
      torchLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
    };
    geometryManager.thingAllocators = {
      positions: geometryWorker.makeArenaAllocator(numPositions * 3 * Float32Array.BYTES_PER_ELEMENT),
      uvs: geometryWorker.makeArenaAllocator(numPositions * 2 * Float32Array.BYTES_PER_ELEMENT),
      atlasUvs: geometryWorker.makeArenaAllocator(numPositions * 2 * Float32Array.BYTES_PER_ELEMENT),
      ids: geometryWorker.makeArenaAllocator(numPositions * Float32Array.BYTES_PER_ELEMENT),
      indices: geometryWorker.makeArenaAllocator(numPositions * Uint32Array.BYTES_PER_ELEMENT),
      skyLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
      torchLights: geometryWorker.makeArenaAllocator(numPositions * Uint8Array.BYTES_PER_ELEMENT),
    };
  };
  _initializeAllocators();

  const _initializeAttributes = () => {
    geometryManager.landBufferAttributes = {
      position: new THREE.BufferAttribute(geometryManager.landAllocators.positions.getAs(Float32Array), 3),
      normal: new THREE.BufferAttribute(geometryManager.landAllocators.normals.getAs(Float32Array), 3),
      uv: new THREE.BufferAttribute(geometryManager.landAllocators.uvs.getAs(Float32Array), 2),
      // barycentric: new THREE.BufferAttribute(geometryManager.landAllocators.barycentrics.getAs(Float32Array), 3),
      ao: new THREE.BufferAttribute(geometryManager.landAllocators.aos.getAs(Uint8Array), 1),
      id: new THREE.BufferAttribute(geometryManager.landAllocators.ids.getAs(Float32Array), 1),
      skyLight: new THREE.BufferAttribute(geometryManager.landAllocators.skyLights.getAs(Uint8Array), 1),
      torchLight: new THREE.BufferAttribute(geometryManager.landAllocators.torchLights.getAs(Uint8Array), 1),
    };
    geometryManager.vegetationBufferAttributes = {
      position: new THREE.BufferAttribute(geometryManager.vegetationAllocators.positions.getAs(Float32Array), 3),
      uv: new THREE.BufferAttribute(geometryManager.vegetationAllocators.uvs.getAs(Float32Array), 2),
      id: new THREE.BufferAttribute(geometryManager.vegetationAllocators.ids.getAs(Float32Array), 1),
      index: new THREE.BufferAttribute(geometryManager.vegetationAllocators.indices.getAs(Uint32Array), 1),
      skyLight: new THREE.BufferAttribute(geometryManager.vegetationAllocators.skyLights.getAs(Uint8Array), 1),
      torchLight: new THREE.BufferAttribute(geometryManager.vegetationAllocators.torchLights.getAs(Uint8Array), 1),
    };
    geometryManager.thingBufferAttributes = {
      position: new THREE.BufferAttribute(geometryManager.thingAllocators.positions.getAs(Float32Array), 3),
      uv: new THREE.BufferAttribute(geometryManager.thingAllocators.uvs.getAs(Float32Array), 2),
      atlasUv: new THREE.BufferAttribute(geometryManager.thingAllocators.atlasUvs.getAs(Float32Array), 2),
      id: new THREE.BufferAttribute(geometryManager.thingAllocators.ids.getAs(Float32Array), 1),
      index: new THREE.BufferAttribute(geometryManager.thingAllocators.indices.getAs(Uint32Array), 1),
      skyLight: new THREE.BufferAttribute(geometryManager.thingAllocators.skyLights.getAs(Uint8Array), 1),
      torchLight: new THREE.BufferAttribute(geometryManager.thingAllocators.torchLights.getAs(Uint8Array), 1),
    };
  };
  _initializeAttributes();
  
  const _initializeTracker = () => {
    const meshId = 0;
    geometryManager.tracker = geometryWorker.makeTracker(
      seed,
      meshId,
      chunkDistance,

      geometryManager.landAllocators.positions.ptr,
      geometryManager.landAllocators.normals.ptr,
      geometryManager.landAllocators.uvs.ptr,
      // geometryManager.landAllocators.barycentrics.ptr,
      geometryManager.landAllocators.aos.ptr,
      geometryManager.landAllocators.ids.ptr,
      geometryManager.landAllocators.skyLights.ptr,
      geometryManager.landAllocators.torchLights.ptr,

      geometryManager.vegetationAllocators.positions.ptr,
      geometryManager.vegetationAllocators.uvs.ptr,
      geometryManager.vegetationAllocators.ids.ptr,
      geometryManager.vegetationAllocators.indices.ptr,
      geometryManager.vegetationAllocators.skyLights.ptr,
      geometryManager.vegetationAllocators.torchLights.ptr,

      geometryManager.thingAllocators.positions.ptr,
      geometryManager.thingAllocators.uvs.ptr,
      geometryManager.thingAllocators.atlasUvs.ptr,
      geometryManager.thingAllocators.ids.ptr,
      geometryManager.thingAllocators.indices.ptr,
      geometryManager.thingAllocators.skyLights.ptr,
      geometryManager.thingAllocators.torchLights.ptr,
    );
  };
  _initializeTracker();

  const _initializePlanetOffset = async () => {
    const chunkMesh = await _makeChunkMesh(chunkSpec.seedString, chunkSpec.parcelSize, chunkSpec.subparcelSize);
    geometryManager.chunkMeshContainer.add(chunkMesh);
    geometryManager.currentChunkMesh = chunkMesh;

    chunkMesh.updateMatrixWorld();

    const p = new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().getInverse(chunkMesh.matrixWorld));
    const ncx = Math.floor(p.x / SUBPARCEL_SIZE) * SUBPARCEL_SIZE;
    const ncy = Math.floor(p.y / SUBPARCEL_SIZE) * SUBPARCEL_SIZE;
    const ncz = Math.floor(p.z / SUBPARCEL_SIZE) * SUBPARCEL_SIZE;

    const height = geometryWorker.getHeight(chunkMesh.seedNum, ncx, ncy + SUBPARCEL_SIZE, ncz, baseHeight);
    geometryManager.worldContainer.position.y = -height // - cameraManager.getAvatarHeight();
  };
  await _initializePlanetOffset();

  const vegetationMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(VEGETATION_SHADER.uniforms),
    vertexShader: VEGETATION_SHADER.vertexShader,
    fragmentShader: VEGETATION_SHADER.fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const _makeBakedMesh = g => {
    const mesh = new THREE.Mesh(g, vegetationMaterial);
    mesh.frustumCulled = false;
    return mesh;
  };

  const [
    _meshes,
    texture,
  ] = await Promise.all([
    (async () => {
      geometryManager.geometrySet = geometryWorker.makeGeometrySet();
      await geometryWorker.requestLoadBake(geometryManager.geometrySet, './meshes.bin');
      
      const geometries = [
        'wood_wall',
        'wood_floor',
        'wood_ramp',
        'stone_wall',
        'stone_floor',
        'stone_ramp',
        'metal_wall',
        'metal_floor',
        'metal_ramp',
        'wood1',
        'stone2',
        'metal1',
        'SM_Prop_Plans_01',
        'SM_Item_Pencil_02',
        'SM_Wep_Pickaxe_01',
        'SM_Tool_Paint_Brush_02',
        'SM_Wep_Rifle_Assault_01',
        'SM_Wep_SubMGun_Lite_01',
        'SM_Wep_Grenade_01',
        'SM_Wep_Crosshair_04',
      ].map(n => geometryWorker.getGeometry(geometryManager.geometrySet, n));
      let index = 0;
      geometryManager.buildMeshes.walls[0] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.walls[0].vegetationType = 'wood_wall';
      geometryManager.buildMeshes.platforms[0] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.platforms[0].vegetationType = 'wood_floor';
      geometryManager.buildMeshes.ramps[0] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.ramps[0].vegetationType = 'wood_ramp';
      geometryManager.buildMeshes.walls[1] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.walls[1].vegetationType = 'stone_ramp';
      geometryManager.buildMeshes.platforms[1] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.platforms[1].vegetationType = 'stone_floor';
      geometryManager.buildMeshes.ramps[1] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.ramps[1].vegetationType = 'stone_ramp';
      geometryManager.buildMeshes.walls[2] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.walls[2].vegetationType = 'metal_wall';
      geometryManager.buildMeshes.platforms[2] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.platforms[2].vegetationType = 'metal_floor';
      geometryManager.buildMeshes.ramps[2] = _makeBakedMesh(geometries[index++]);
      geometryManager.buildMeshes.ramps[2].vegetationType = 'metal_ramp';
      geometryManager.woodMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.stoneMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.metalMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.plansMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.pencilMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.pickaxeMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.paintBrushMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.assaultRifleMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.smgMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.grenadeMesh = _makeBakedMesh(geometries[index++]);
      geometryManager.crosshairMesh = _makeBakedMesh(geometries[index++]);

      geometryManager.plansMesh.visible = false;
      scene.add(geometryManager.plansMesh);
      geometryManager.pencilMesh.visible = false;
      scene.add(geometryManager.pencilMesh);
      geometryManager.pickaxeMesh.visible = false;
      scene.add(geometryManager.pickaxeMesh);
      geometryManager.paintBrushMesh.visible = false;
      scene.add(geometryManager.paintBrushMesh);
      geometryManager.assaultRifleMesh.visible = false;
      scene.add(geometryManager.assaultRifleMesh);
      geometryManager.smgMesh.visible = false;
      scene.add(geometryManager.smgMesh);
      geometryManager.grenadeMesh.visible = false;
      scene.add(geometryManager.grenadeMesh);

      {
        geometryManager.crosshairMesh.scale.setScalar(5000);
        geometryManager.crosshairMesh.traverse(o => {
          if (o.isMesh) {
            o.material = new THREE.MeshBasicMaterial({
              color: 0x111111,
              depthTest: false,
              transparent: true,
            });
          }
        });
        geometryManager.crosshairMesh.visible = false;
        let animation = null;
        geometryManager.crosshairMesh.trigger = () => {
          if (animation) {
            animation.end();
            animation = null;
          }
          const startTime = Date.now();
          const endTime = startTime + 300;
          const originalScale = geometryManager.crosshairMesh.scale.clone();
          animation = {
            update() {
              const now = Date.now();
              const factor = (now - startTime) / (endTime - startTime);
              if (factor < 1) {
                geometryManager.crosshairMesh.scale.copy(originalScale)
                  .multiplyScalar(1 + (1 - factor));
              } else {
                animation.end();
                animation = null;
              }
            },
            end() {
              geometryManager.crosshairMesh.scale.copy(originalScale);
            },
          };
        };
        geometryManager.crosshairMesh.update = () => {
          animation && animation.update();
        };
        scene.add(geometryManager.crosshairMesh);
      }
    })(),
    (async () => {
      /* const image = new Image();
      await new Promise((accept, reject) => {
        image.onload = () => {
          accept();
        };
        image.onerror = reject;
        image.src = './texture.png';
      });
      const texture = new THREE.Texture(image);
      texture.flipY = false;
      texture.needsUpdate = true; */
      
      const basisLoader = new BasisTextureLoader();
      basisLoader.detectSupport(renderer);

      // console.time('basis texture load');
      const texture = await new Promise((accept, reject) => {
        basisLoader.load('meshes-texture.basis', texture => {
          // console.timeEnd('basis texture load');
          accept(texture);
        }, () => {
          // console.log('onProgress');
        }, err => {
          reject(err);
        });
      });
      return texture;
    })(),
  ]);
  vegetationMaterial.uniforms.map.value = texture;
  vegetationMaterial.uniforms.map.needsUpdate = true;

  console.log('load 2');

  const _makeVegetationMesh = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', geometryManager.vegetationBufferAttributes.position);
    geometry.setAttribute('uv', geometryManager.vegetationBufferAttributes.uv);
    geometry.setAttribute('id', geometryManager.vegetationBufferAttributes.id);
    geometry.setAttribute('skyLight', geometryManager.vegetationBufferAttributes.skyLight);
    geometry.setAttribute('torchLight', geometryManager.vegetationBufferAttributes.torchLight);
    geometry.setIndex(geometryManager.vegetationBufferAttributes.index);
    // geometry.allocators = allocators;
    const mesh = new THREE.Mesh(geometry, [vegetationMaterial]);
    mesh.frustumCulled = false;

    const slabs = {};
    const _getSlabPositionOffset = spec => spec.positionsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabUvOffset = spec => spec.uvsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabIdOffset = spec => spec.idsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabSkyLightOffset = spec => spec.skyLightsStart / Uint8Array.BYTES_PER_ELEMENT;
    const _getSlabTorchLightOffset = spec => spec.torchLightsStart / Uint8Array.BYTES_PER_ELEMENT;
    const _getSlabIndexOffset = spec => spec.indicesStart / Uint32Array.BYTES_PER_ELEMENT;

    mesh.updateGeometry = spec => {
      geometry.attributes.position.updateRange.count = spec.positionsCount / Float32Array.BYTES_PER_ELEMENT;
      if (geometry.attributes.position.updateRange.count > 0) {
        geometry.attributes.position.updateRange.offset = _getSlabPositionOffset(spec);
        geometry.attributes.position.needsUpdate = true;

        geometry.attributes.uv.updateRange.count = spec.uvsCount / Float32Array.BYTES_PER_ELEMENT;
        geometry.attributes.uv.updateRange.offset = _getSlabUvOffset(spec);
        geometry.attributes.uv.needsUpdate = true;

        geometry.attributes.id.updateRange.count = spec.idsCount / Float32Array.BYTES_PER_ELEMENT;
        geometry.attributes.id.updateRange.offset = _getSlabIdOffset(spec);
        geometry.attributes.id.needsUpdate = true;

        geometry.attributes.skyLight.updateRange.count = spec.skyLightsCount / Uint8Array.BYTES_PER_ELEMENT;
        geometry.attributes.skyLight.updateRange.offset = _getSlabSkyLightOffset(spec);
        geometry.attributes.skyLight.needsUpdate = true;

        geometry.attributes.torchLight.updateRange.count = spec.torchLightsCount / Uint8Array.BYTES_PER_ELEMENT;
        geometry.attributes.torchLight.updateRange.offset = _getSlabTorchLightOffset(spec);
        geometry.attributes.torchLight.needsUpdate = true;

        geometry.index.updateRange.count = spec.indicesCount / Uint32Array.BYTES_PER_ELEMENT;
        geometry.index.updateRange.offset = _getSlabIndexOffset(spec);
        geometry.index.needsUpdate = true;

        renderer.geometries.update(geometry);
      }
    };
    /* mesh.freeSlabIndex = index => {
      const slab = slabs[index];
      if (slab) {
        slab.free();
        geometry.groups.splice(geometry.groups.indexOf(slab.group), 1);
        slabs[index] = null;
      }
    }; */
    const hps = {};
    mesh.hitTracker = _makeHitTracker((id, dmg) => {
      if (!(id in hps)) {
        hps[id] = 100;
      }
      hps[id] = Math.max(hps[id] - dmg, 0);
      return hps[id] > 0;
    }, (positionOffset) => {
      geometryManager.currentVegetationMesh.material[0].uniforms.uHitPosition.value.copy(positionOffset);
      geometryManager.currentVegetationMesh.material[0].uniforms.uHitPosition.needsUpdate = true;
    }, id => {
      geometryManager.currentVegetationMesh.material[0].uniforms.uHitId.value = id;
      geometryManager.currentVegetationMesh.material[0].uniforms.uHitId.needsUpdate = true;
    }, (id, position, quaternion) => {
      addItem(position, quaternion);

      const subparcelPosition = new THREE.Vector3(
        Math.floor(position.x / SUBPARCEL_SIZE),
        Math.floor(position.y / SUBPARCEL_SIZE),
        Math.floor(position.z / SUBPARCEL_SIZE),
      );
      geometryWorker.requestRemoveObject(geometryManager.tracker, geometryManager.geometrySet, subparcelPosition.x, subparcelPosition.y, subparcelPosition.z, id);

      /* planet.editSubparcel(subparcelPosition.x, subparcelPosition.y, subparcelPosition.z, subparcel => {
        subparcel.removeVegetation(vegetationId);
      });
      mesh.updateSlab(subparcelPosition.x, subparcelPosition.y, subparcelPosition.z); */
    });

    return mesh;
  };
  geometryManager.currentVegetationMesh = _makeVegetationMesh();
  geometryManager.chunkMeshContainer.add(geometryManager.currentVegetationMesh);
  const context = renderer.getContext();
  geometryManager.currentVegetationMesh.onBeforeRender = () => {
    context.enable(context.SAMPLE_ALPHA_TO_COVERAGE);
  };
  geometryManager.currentVegetationMesh.onAfterRender = () => {
    context.disable(context.SAMPLE_ALPHA_TO_COVERAGE);
  };

  const _makeThingMesh = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', geometryManager.thingBufferAttributes.position);
    geometry.setAttribute('uv', geometryManager.thingBufferAttributes.uv);
    geometry.setAttribute('atlasUv', geometryManager.thingBufferAttributes.atlasUv);
    geometry.setAttribute('id', geometryManager.thingBufferAttributes.id);
    geometry.setAttribute('skyLight', geometryManager.thingBufferAttributes.skyLight);
    geometry.setAttribute('torchLight', geometryManager.thingBufferAttributes.torchLight);
    geometry.setIndex(geometryManager.thingBufferAttributes.index);

    const _getSlabPositionOffset = spec => spec.positionsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabUvOffset = spec => spec.uvsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabAtlasUvOffset = spec => spec.atlasUvsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabIdOffset = spec => spec.idsStart / Float32Array.BYTES_PER_ELEMENT;
    const _getSlabSkyLightOffset = spec => spec.skyLightsStart / Uint8Array.BYTES_PER_ELEMENT;
    const _getSlabTorchLightOffset = spec => spec.torchLightsStart / Uint8Array.BYTES_PER_ELEMENT;
    const _getSlabIndexOffset = spec => spec.indicesStart / Uint32Array.BYTES_PER_ELEMENT;

    const thingTexture = new THREE.DataTexture(
      null,
      thingTextureSize, thingTextureSize, /* ,
      THREE.RGBAFormat, THREE.UnsignedByteType, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter */
    );

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          type: 't',
          value: thingTexture,
          needsUpdate: true,
        },
        uSelectId: {
          type: 'f',
          value: -1,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        precision highp float;
        precision highp int;

        uniform float uSelectId;
        attribute vec2 atlasUv;
        attribute float id;
        // attribute float skyLight;
        // attribute float torchLight;
        varying vec3 vSelectColor;

        varying vec2 vUv;
        // varying float vSkyLight;
        // varying float vTorchLight;

        void main() {
          vUv = (atlasUv + uv) * ${(objectTextureSize / thingTextureSize).toFixed(8)};
          vec3 p = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

          vSelectColor = vec3(0.);
          if (uSelectId == id) {
            vSelectColor = vec3(${new THREE.Color(0x4fc3f7).toArray().join(', ')});
          }

          // vSkyLight = skyLight/8.0;
          // vTorchLight = torchLight/8.0;
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;

        uniform sampler2D map;
        varying vec2 vUv;
        // varying float vSkyLight;
        // varying float vTorchLight;
        varying vec3 vSelectColor;

        void main() {
          vec4 diffuseColor = texture2D(map, vUv);
          diffuseColor.rgb += vSelectColor;
          gl_FragColor = diffuseColor;
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, [material]);
    mesh.frustumCulled = false;
    mesh.updateGeometry = spec => {
      geometry.attributes.position.updateRange.count = spec.positionsCount / Float32Array.BYTES_PER_ELEMENT;
      if (geometry.attributes.position.updateRange.count > 0) {
        geometry.attributes.position.updateRange.offset = _getSlabPositionOffset(spec);
        geometry.attributes.position.needsUpdate = true;

        geometry.attributes.uv.updateRange.count = spec.uvsCount / Float32Array.BYTES_PER_ELEMENT;
        geometry.attributes.uv.updateRange.offset = _getSlabUvOffset(spec);
        geometry.attributes.uv.needsUpdate = true;

        geometry.attributes.atlasUv.updateRange.count = spec.atlasUvsCount / Float32Array.BYTES_PER_ELEMENT;
        geometry.attributes.atlasUv.updateRange.offset = _getSlabAtlasUvOffset(spec);
        geometry.attributes.atlasUv.needsUpdate = true;

        geometry.attributes.id.updateRange.count = spec.idsCount / Float32Array.BYTES_PER_ELEMENT;
        geometry.attributes.id.updateRange.offset = _getSlabIdOffset(spec);
        geometry.attributes.id.needsUpdate = true;

        geometry.attributes.skyLight.updateRange.count = spec.skyLightsCount / Uint8Array.BYTES_PER_ELEMENT;
        geometry.attributes.skyLight.updateRange.offset = _getSlabSkyLightOffset(spec);
        geometry.attributes.skyLight.needsUpdate = true;

        geometry.attributes.torchLight.updateRange.count = spec.torchLightsCount / Uint8Array.BYTES_PER_ELEMENT;
        geometry.attributes.torchLight.updateRange.offset = _getSlabTorchLightOffset(spec);
        geometry.attributes.torchLight.needsUpdate = true;

        geometry.index.updateRange.count = spec.indicesCount / Uint32Array.BYTES_PER_ELEMENT;
        geometry.index.updateRange.offset = _getSlabIndexOffset(spec);
        geometry.index.needsUpdate = true;

        renderer.geometries.update(geometry);
      }
    };
    mesh.updateTexture = data => {
      thingTexture.image.data = data;
      thingTexture.needsUpdate = true;
    };
    return mesh;
  };
  geometryManager.currentThingMesh = _makeThingMesh();
  geometryManager.chunkMeshContainer.add(geometryManager.currentThingMesh);
  
  geometryManager.dispatchEvent(new MessageEvent('load'));
});
/* planet.addEventListener('unload', () => {
  const oldChunkMesh = currentChunkMesh;
  if (oldChunkMesh) {
    chunkMeshContainer.remove(oldChunkMesh);
    currentChunkMesh = null;
  }
}); */

const geometryWorker = (() => {  
  class Allocator {
    constructor() {
      this.offsets = [];
    }

    alloc(constructor, size) {
      if (size > 0) {
        const offset = moduleInstance._malloc(size * constructor.BYTES_PER_ELEMENT);
        const b = new constructor(moduleInstance.HEAP8.buffer, moduleInstance.HEAP8.byteOffset + offset, size);
        b.offset = offset;
        this.offsets.push(offset);
        return b;
      } else {
        return new constructor(moduleInstance.HEAP8.buffer, 0, 0);
      }
    }

    freeAll() {
      for (let i = 0; i < this.offsets.length; i++) {
        moduleInstance._doFree(this.offsets[i]);
      }
      this.offsets.length = 0;
    }
  }

  const maxNumMessageArgs = 32;
  const messageSize =
    Int32Array.BYTES_PER_ELEMENT + // id
    Int32Array.BYTES_PER_ELEMENT + // method
    Int32Array.BYTES_PER_ELEMENT + // priority
    maxNumMessageArgs*Uint32Array.BYTES_PER_ELEMENT; // args
  const maxNumMessages = 1024;
  const callStackSize = maxNumMessages * messageSize;
  class CallStackMessage {
    constructor(ptr) {
      this.dataView = new DataView(moduleInstance.HEAP8.buffer, ptr, messageSize);
      this.offset = 3*Uint32Array.BYTES_PER_ELEMENT;
    }
    getId() {
      return this.dataView.getInt32(0, true);
    }
    getMethod() {
      return this.dataView.getInt32(Uint32Array.BYTES_PER_ELEMENT, true);
    }
    getPriority() {
      return this.dataView.getInt32(2*Uint32Array.BYTES_PER_ELEMENT, true);
    }
    setId(v) {
      this.dataView.setInt32(0, v, true);
    }
    setMethod(v) {
      this.dataView.setInt32(Uint32Array.BYTES_PER_ELEMENT, v, true);
    }
    setPriority(v) {
      this.dataView.setInt32(2*Uint32Array.BYTES_PER_ELEMENT, v, true);
    }
    pullU8Array(length) {
      const {offset} = this;
      this.offset += length;
      return new Uint8Array(this.dataView.buffer, this.dataView.byteOffset + offset, length);;
    }
    pullF32Array(length) {
      const {offset} = this;
      this.offset += length*Float32Array.BYTES_PER_ELEMENT;
      return new Float32Array(this.dataView.buffer, this.dataView.byteOffset + offset, length);
    }
    pullI32() {
      const {offset} = this;
      this.offset += Int32Array.BYTES_PER_ELEMENT;
      return this.dataView.getInt32(offset, true);;
    }
    pullU32() {
      const {offset} = this;
      this.offset += Uint32Array.BYTES_PER_ELEMENT;
      return this.dataView.getUint32(offset, true);;
    }
    pullF32() {
      const {offset} = this;
      this.offset += Float32Array.BYTES_PER_ELEMENT;
      return this.dataView.getFloat32(offset, true);
    }
    pushU8Array(uint8Array) {
      new Uint8Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, uint8Array.length).set(uint8Array);
      this.offset += uint8Array.byteLength;
    }
    pushF32Array(float32Array) {
      new Float32Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, float32Array.length).set(float32Array);
      this.offset += float32Array.byteLength;
    }
    pushI32(v) {
      this.dataView.setInt32(this.offset, v, true);
      this.offset += Int32Array.BYTES_PER_ELEMENT;
    }
    pushU32(v) {
      this.dataView.setUint32(this.offset, v, true);
      this.offset += Uint32Array.BYTES_PER_ELEMENT;
    }
    pushF32(v) {
      this.dataView.setFloat32(this.offset, v, true);
      this.offset += Float32Array.BYTES_PER_ELEMENT;
    }
    /* pullU8Array(length) {
      if (this.offset + length <= messageSize) {
        const result = new Uint8Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, length);
        this.offset += length;
        return result;
      } else {
        throw new Error('message overflow');
      }
    }
    pullF32Array(length) {
      if (this.offset + length*Float32Array.BYTES_PER_ELEMENT <= messageSize) {
        const result = new Float32Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, length);
        this.offset += length*Float32Array.BYTES_PER_ELEMENT;
        return result;
      } else {
        throw new Error('message overflow');
      }
    }
    pullI32() {
      if (this.offset + Int32Array.BYTES_PER_ELEMENT <= messageSize) {
        const result = this.dataView.getInt32(this.offset, true);
        this.offset += Int32Array.BYTES_PER_ELEMENT;
        return result;
      } else {
        throw new Error('message overflow');
      }
    }
    pullU32() {
      if (this.offset + Uint32Array.BYTES_PER_ELEMENT <= messageSize) {
        const result = this.dataView.getUint32(this.offset, true);
        this.offset += Uint32Array.BYTES_PER_ELEMENT;
        return result;
      } else {
        throw new Error('message overflow');
      }
    }
    pullF32() {
      if (this.offset + Float32Array.BYTES_PER_ELEMENT <= messageSize) {
        const result = this.dataView.getFloat32(this.offset, true);
        this.offset += Float32Array.BYTES_PER_ELEMENT;
        return result;
      } else {
        throw new Error('message overflow');
      }
    }
    pushU8Array(uint8Array) {
      if (this.offset + uint8Array.byteLength <= messageSize) {
        new Uint8Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, uint8Array.length).set(uint8Array);
        this.offset += uint8Array.byteLength;
      } else {
        throw new Error('message overflow');
      }
    }
    pushF32Array(float32Array) {
      if (this.offset + float32Array.byteLength <= messageSize) {
        new Float32Array(this.dataView.buffer, this.dataView.byteOffset + this.offset, float32Array.length).set(float32Array);
        this.offset += float32Array.byteLength;
      } else {
        throw new Error('message overflow');
      }
    }
    pushI32(v) {
      if (this.offset + Int32Array.BYTES_PER_ELEMENT <= messageSize) {
        this.dataView.setInt32(this.offset, v, true);
        this.offset += Int32Array.BYTES_PER_ELEMENT;
      } else {
        throw new Error('message overflow');
      }
    }
    pushU32(v) {
      if (this.offset + Uint32Array.BYTES_PER_ELEMENT <= messageSize) {
        this.dataView.setUint32(this.offset, v, true);
        this.offset += Uint32Array.BYTES_PER_ELEMENT;
      } else {
        throw new Error('message overflow');
      }
    }
    pushF32(v) {
      if (this.offset + Float32Array.BYTES_PER_ELEMENT <= messageSize) {
        this.dataView.setFloat32(this.offset, v, true);
        this.offset += Float32Array.BYTES_PER_ELEMENT;
      } else {
        throw new Error('message overflow');
      }
    } */
  }
  class CallStack {
    constructor() {
      this.ptr = moduleInstance._malloc(callStackSize * 2 + Uint32Array.BYTES_PER_ELEMENT);
      this.dataView = new DataView(moduleInstance.HEAP8.buffer, this.ptr, callStackSize);

      this.outPtr = this.ptr + callStackSize;
      this.outDataView = new DataView(moduleInstance.HEAP8.buffer, this.ptr + callStackSize, callStackSize);

      this.outNumEntriesPtr = this.ptr + callStackSize * 2;
      this.outNumEntriesU32 = new Uint32Array(moduleInstance.HEAP8.buffer, this.outNumEntriesPtr, 1);

      this.numEntries = 0;
      this.nextCbId = 0;
    }

    allocRequest(method, prio, startCb, endCb) {
      const index = this.numEntries++;
      const offset = index * messageSize;
      const startMessage = new CallStackMessage(this.ptr + offset);

      const id = ++this.nextCbId;
      startMessage.setId(id);
      startMessage.setMethod(method);
      startMessage.setPriority(+prio);
      
      startCb(startMessage);
      cbIndex.set(id, endCb);
    }

    reset() {
      this.numEntries = 0;
    }
  }
  class ScratchStack {
    constructor() {
      const size = 1024*1024;
      this.ptr = moduleInstance._malloc(size);

      this.u8 = new Uint8Array(moduleInstance.HEAP8.buffer, this.ptr, size);
      this.u32 = new Uint32Array(moduleInstance.HEAP8.buffer, this.ptr, size/4);
      this.i32 = new Int32Array(moduleInstance.HEAP8.buffer, this.ptr, size/4);
      this.f32 = new Float32Array(moduleInstance.HEAP8.buffer, this.ptr, size/4);
    }
  }
  
  const modulePromise = makePromise();
  /* const INITIAL_INITIAL_MEMORY = 52428800;
  const WASM_PAGE_SIZE = 65536;
  const wasmMemory = new WebAssembly.Memory({
    "initial": INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
    "maximum": INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
    "shared": true,
  }); */
  let localModuleInstance = null;
  let moduleInstance = null;
  let threadPool;
  let callStack;
  let scratchStack;
  // GeometryModule({
    // ENVIRONMENT_IS_PTHREAD: true,
    // wasmMemory,
    // buffer: wasmMemory.buffer,
    // noInitialRun: true,
    // noExitRuntime: true,
    Module.onRuntimeInitialized = function() {
      localModuleInstance = this;
    };
    Module.postRun = () => {
      moduleInstance = localModuleInstance;
      // moduleInstance._globalInit();
      callStack = new CallStack();
      scratchStack = new ScratchStack();
      threadPool = moduleInstance._makeThreadPool(1);
      // threadPool = moduleInstance._getThreadPool();
      modulePromise.accept();
    };
    if (Module.calledRun) {
      Module.onRuntimeInitialized();
      Module.postRun();
    }
  // });

  let methodIndex = 0;
  const METHODS = {
    NULL: methodIndex++,
    makeArenaAllocator: methodIndex++,
    arenaAlloc: methodIndex++,
    arenaFree: methodIndex++,
    makeGeometrySet: methodIndex++,
    loadBake: methodIndex++,
    getGeometry: methodIndex++,
    getGeometries: methodIndex++,
    getGeometryKeys: methodIndex++,
    getAnimalGeometry: methodIndex++,
    marchObjects: methodIndex++,
    getHeight: methodIndex++,
    noise: methodIndex++,
    marchingCubes: methodIndex++,
    bakeGeometry: methodIndex++,
    getSubparcel: methodIndex++,
    releaseSubparcel: methodIndex++,
    chunk: methodIndex++,
    mine: methodIndex++,
    releaseMine: methodIndex++,
    light: methodIndex++,
    addObject: methodIndex++,
    removeObject: methodIndex++,
    releaseAddRemoveObject: methodIndex++,
    addThingGeometry: methodIndex++,
    addThing: methodIndex++,
  };
  let messageIndex = 0;
  const MESSAGES = {
    [--messageIndex]: function updateSubparcel(m) {
      const subparcelOffset = m.pullU32();
      const subparcelSize = m.pullU32();

      // const x = moduleInstance.HEAP32[subparcelOffset/Uint32Array.BYTES_PER_ELEMENT];
      // const y = moduleInstance.HEAP32[subparcelOffset/Uint32Array.BYTES_PER_ELEMENT + 1];
      // const z = moduleInstance.HEAP32[subparcelOffset/Uint32Array.BYTES_PER_ELEMENT + 2];
      const index = moduleInstance.HEAP32[subparcelOffset / Uint32Array.BYTES_PER_ELEMENT + 3];
      const uint8Array = moduleInstance.HEAPU8.slice(subparcelOffset, subparcelOffset + subparcelSize);
      storage.setRawTemp(`subparcel:${index}`, uint8Array);
      /* .then(() => {
          console.log('set raw ok', x, y, z, `subparcel:${index}`);
        }); */
    },
    [--messageIndex]: function updateGeometry(m) {
      {
        const positionsFreeEntry = m.pullU32();
        const normalsFreeEntry = m.pullU32();
        const uvsFreeEntry = m.pullU32();
        const aosFreeEntry = m.pullU32();
        const idsFreeEntry = m.pullU32();
        const skyLightsFreeEntry = m.pullU32();
        const torchLightsFreeEntry = m.pullU32();

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const normalsStart = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const aosStart = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const normalsCount = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const aosCount = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        geometryManager.currentChunkMesh.updateGeometry({
          positionsStart,
          normalsStart,
          uvsStart,
          aosStart,
          idsStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          normalsCount,
          uvsCount,
          aosCount,
          idsCount,
          skyLightsCount,
          torchLightsCount,
        });
      }
      {
        const positionsFreeEntry = m.pullU32();
        const uvsFreeEntry = m.pullU32();
        const idsFreeEntry = m.pullU32();
        const indicesFreeEntry = m.pullU32();
        const skyLightsFreeEntry = m.pullU32();
        const torchLightsFreeEntry = m.pullU32();

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        geometryManager.currentVegetationMesh.updateGeometry({
          positionsStart,
          uvsStart,
          idsStart,
          indicesStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          uvsCount,
          idsCount,
          indicesCount,
          skyLightsCount,
          torchLightsCount,
        });
      }
      {
        const positionsFreeEntry = m.pullU32();
        const uvsFreeEntry = m.pullU32();
        const atlasUvsFreeEntry = m.pullU32();
        const idsFreeEntry = m.pullU32();
        const indicesFreeEntry = m.pullU32();
        const skyLightsFreeEntry = m.pullU32();
        const torchLightsFreeEntry = m.pullU32();

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const atlasUvsStart = moduleInstance.HEAPU32[atlasUvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const atlasUvsCount = moduleInstance.HEAPU32[atlasUvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        geometryManager.currentThingMesh.updateGeometry({
          positionsStart,
          uvsStart,
          atlasUvsStart,
          idsStart,
          indicesStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          uvsCount,
          atlasUvsCount,
          idsCount,
          indicesCount,
          skyLightsCount,
          torchLightsCount,
        });
      }
      {
        const textureOffset = m.pullU32();
        if (textureOffset) {
          // console.log('got texture update', textureOffset);
          const textureData = new Uint8Array(moduleInstance.HEAP8.buffer, textureOffset, thingTextureSize * thingTextureSize * 4);
          currentThingMesh.updateTexture(textureData);
        }
      }
      {
        const subparcelSharedPtr = m.pullU32();
        w.requestReleaseSubparcel(geometryManager.tracker, subparcelSharedPtr);
      }
    },
  };
  const cbIndex = new Map();
  const w = {};
  /* window.earcut = () => {
    const positionsData = Float32Array.from([
      0, 0, 0, 100, 100, 100, 100, 0,
    ]);
    for (let i = 0; i < positionsData.length; i++) {
      positionsData[i] /= 30;
    }
    const positions = w.alloc(Float32Array, positionsData.length);
    positions.set(positionsData);

    const holesData = Float32Array.from([
      75, 25, 75, 75, 25, 75, 25, 25,
    ]);
    for (let i = 0; i < holesData.length; i++) {
      holesData[i] /= 30;
    }
    const holes = w.alloc(Float32Array, holesData.length);
    holes.set(holesData);

    const holeCountsData = Uint32Array.from([
      4,
    ]);
    const holeCounts = w.alloc(Uint32Array, holeCountsData.length);
    holeCounts.set(holeCountsData);

    const pointsData = Float32Array.from([
      10, 10,
    ]);
    for (let i = 0; i < pointsData.length; i++) {
      pointsData[i] /= 30;
    }
    const points = w.alloc(Float32Array, pointsData.length);
    points.set(pointsData);

    const zData = Float32Array.from([
      0, 30, 10, 0,
      -10, -30, -20, -10,
      0,
    ]);
    for (let i = 0; i < zData.length; i++) {
      zData[i] /= 30;
    }
    const zs = w.alloc(Float32Array, zData.length);
    zs.set(zData);

    meshDrawer.drawPolygonize(positions, holes, holeCounts, points, 0.5, zs);
  }; */
  w.waitForLoad = () => modulePromise;
  w.alloc = (constructor, count) => {
    if (count > 0) {
      const size = constructor.BYTES_PER_ELEMENT * count;
      const ptr = moduleInstance._doMalloc(size);
      return new constructor(moduleInstance.HEAP8.buffer, ptr, count);
    } else {
      return new constructor(moduleInstance.HEAP8.buffer, 0, 0);
    }
  };
  w.free = ptr => {
    moduleInstance._doFree(ptr);
  };
  w.makeArenaAllocator = size => {
    const ptr = moduleInstance._makeArenaAllocator(size);
    const offset = moduleInstance.HEAP32[ptr / Uint32Array.BYTES_PER_ELEMENT];
    return {
      ptr,
      getAs(constructor) {
        return new constructor(moduleInstance.HEAP8.buffer, offset, size / constructor.BYTES_PER_ELEMENT);
      },
    };
  };
  w.makeGeometrySet = () => moduleInstance._makeGeometrySet();
  w.requestLoadBake = async (geometrySet, url) => {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const dataOffset = moduleInstance._malloc(uint8Array.length);
    const data = moduleInstance.HEAPU8.subarray(dataOffset, dataOffset + uint8Array.length);
    data.set(uint8Array);

    moduleInstance._loadBake(
      geometrySet,
      data.byteOffset,
      data.byteLength
    );

    w.free(data.byteOffset);
  };
  w.getGeometry = (geometrySet, name) => {
    const srcNameUint8Array = textEncoder.encode(name);
    const dstNameUint8Array = w.alloc(Uint8Array, srcNameUint8Array.byteLength);
    dstNameUint8Array.set(srcNameUint8Array);

    scratchStack.u32[0] = dstNameUint8Array.byteOffset,

    moduleInstance._getGeometry(
      geometrySet,
      dstNameUint8Array.byteOffset,
      dstNameUint8Array.byteLength,
      scratchStack.u32.byteOffset + 0*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 1*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 2*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 3*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 4*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 5*Uint32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 6*Uint32Array.BYTES_PER_ELEMENT
    );

    const positionsOffset = scratchStack.u32[0];
    const uvsOffset = scratchStack.u32[1];
    const indicesOffset = scratchStack.u32[2];
    const numPositions = scratchStack.u32[3];
    const numUvs = scratchStack.u32[4];
    const numIndices = scratchStack.u32[5];
    const aabbOffset = scratchStack.u32[6];
 
    const boundingBox = new THREE.Box3(
      new THREE.Vector3().fromArray(moduleInstance.HEAPF32.subarray(aabbOffset/Float32Array.BYTES_PER_ELEMENT, aabbOffset/Float32Array.BYTES_PER_ELEMENT + 3)),
      new THREE.Vector3().fromArray(moduleInstance.HEAPF32.subarray(aabbOffset/Float32Array.BYTES_PER_ELEMENT + 3, aabbOffset/Float32Array.BYTES_PER_ELEMENT + 6)),
    );

    const positions = new Float32Array(moduleInstance.HEAP8.buffer, positionsOffset, numPositions);
    const uvs = new Float32Array(moduleInstance.HEAP8.buffer, uvsOffset, numUvs);
    const indices = new Uint32Array(moduleInstance.HEAP8.buffer, indicesOffset, numIndices);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    renderer.geometries.update(geometry);

    geometry.boundingBox = boundingBox;
    
    w.free(dstNameUint8Array.byteOffset);
    
    return geometry;
  };
  /* w.requestGetGeometry = (geometrySet, name) => new Promise((accept, reject) => {
    let dstNameUint8Array;
    callStack.allocRequest(METHODS.getGeometry, true, m => {
      m.pushU32(geometrySet);

      const srcNameUint8Array = textEncoder.encode(name);
      dstNameUint8Array = w.alloc(Uint8Array, srcNameUint8Array.byteLength);
      dstNameUint8Array.set(srcNameUint8Array);
      m.pushU32(dstNameUint8Array.byteOffset);
      m.pushU32(dstNameUint8Array.byteLength);
    }, m => {
      const positionsOffset = m.pullU32();
      const uvsOffset = m.pullU32();
      const indicesOffset = m.pullU32();
      const numPositions = m.pullU32();
      const numUvs = m.pullU32();
      const numIndices = m.pullU32();
      const aabbOffset = m.pullU32();;
      const boundingBox = new THREE.Box3(
        new THREE.Vector3().fromArray(moduleInstance.HEAPF32.subarray(aabbOffset/Float32Array.BYTES_PER_ELEMENT, aabbOffset/Float32Array.BYTES_PER_ELEMENT + 3)),
        new THREE.Vector3().fromArray(moduleInstance.HEAPF32.subarray(aabbOffset/Float32Array.BYTES_PER_ELEMENT + 3, aabbOffset/Float32Array.BYTES_PER_ELEMENT + 6)),
      );

      const positions = new Float32Array(moduleInstance.HEAP8.buffer, positionsOffset, numPositions);
      const uvs = new Float32Array(moduleInstance.HEAP8.buffer, uvsOffset, numUvs);
      const indices = new Uint32Array(moduleInstance.HEAP8.buffer, indicesOffset, numIndices);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      renderer.geometries.update(geometry);

      geometry.boundingBox = boundingBox;

      w.free(dstNameUint8Array.byteOffset);

      accept(geometry);
    });
  }); */
  w.requestGetGeometries = (geometrySet, geometryRequests) => new Promise((accept, reject) => {
    let geometryRequestsOffset;
    callStack.allocRequest(METHODS.getGeometries, true, m => {
      m.pushU32(geometrySet);
      
      const geometryRequestSize = MAX_NAME_LENGTH + 10*Float32Array.BYTES_PER_ELEMENT;
      geometryRequestsOffset = moduleInstance._malloc(geometryRequestSize * geometryRequests.length);
      
      for (let i = 0; i < geometryRequests.length; i++) {
        const geometryRequest = geometryRequests[i];
        const {name, position, quaternion, scale} = geometryRequest;
        const geometryRequestOffset = geometryRequestsOffset + i*geometryRequestSize;

        const srcNameUint8Array = textEncoder.encode(name);
        const dstNameUint8Array = moduleInstance.HEAPU8.subarray(geometryRequestOffset, geometryRequestOffset + MAX_NAME_LENGTH);
        dstNameUint8Array.set(srcNameUint8Array);
        dstNameUint8Array[srcNameUint8Array.length] = 0;

        position.toArray(moduleInstance.HEAPF32, geometryRequestOffset/Float32Array.BYTES_PER_ELEMENT + MAX_NAME_LENGTH/Float32Array.BYTES_PER_ELEMENT);
        quaternion.toArray(moduleInstance.HEAPF32, geometryRequestOffset/Float32Array.BYTES_PER_ELEMENT + MAX_NAME_LENGTH/Float32Array.BYTES_PER_ELEMENT + 3);
        scale.toArray(moduleInstance.HEAPF32, geometryRequestOffset/Float32Array.BYTES_PER_ELEMENT + MAX_NAME_LENGTH/Float32Array.BYTES_PER_ELEMENT + 7);
      }
      
      m.pushU32(geometryRequestsOffset);
      m.pushU32(geometryRequests.length);
    }, m => {
      const positionsOffset = m.pullU32();
      const uvsOffset = m.pullU32();
      // const colorsOffset = m.pullU32();
      const indicesOffset = m.pullU32();
      const numPositions = m.pullU32();
      const numUvs = m.pullU32();
      // const numColors = m.pullU32();
      const numIndices = m.pullU32();

      const positions = new Float32Array(moduleInstance.HEAP8.buffer, positionsOffset, numPositions);
      const uvs = new Float32Array(moduleInstance.HEAP8.buffer, uvsOffset, numUvs);
      // const colors = new Float32Array(moduleInstance.HEAP8.buffer, colorsOffset, numColors);
      const indices = new Uint32Array(moduleInstance.HEAP8.buffer, indicesOffset, numIndices);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      // geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      renderer.geometries.update(geometry);

      w.free(positionsOffset);
      w.free(uvsOffset);
      // w.free(colorsOffset);
      w.free(indicesOffset);

      accept(geometry);
    });
  });
  w.requestGetGeometryKeys = geometrySet => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.getGeometryKeys, true, m => {
      m.pushU32(geometrySet);
    }, m => {
      const namesOffset = m.pullU32();
      const numNames = m.pullU32();
      
      const result = [];
      for (let i = 0; i < numNames; i++) {
        const nameOffset = namesOffset + i*MAX_NAME_LENGTH;
        const nameLength = (() => {
          let j;
          for (j = 0; j < MAX_NAME_LENGTH; j++) {
            if (moduleInstance.HEAPU8[nameOffset+j] === 0) {
              break;
            }
          }
          return j;
        })();
        const name = textDecoder.decode(moduleInstance.HEAPU8.slice(nameOffset, nameOffset + nameLength));
        result.push(name);
      }

      w.free(namesOffset);

      accept(result);
    });
  });
  w.requestAnimalGeometry = hash => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.getAnimalGeometry, false, m => {
      m.pushU32(geometrySet);
      m.pushU32(hash);
    }, m => {
      const positionsOffset = m.pullU32();
      const colorsOffset = m.pullU32();
      const indicesOffset = m.pullU32();
      const headsOffset = m.pullU32();
      const legsOffset = m.pullU32();
      const numPositions = m.pullU32();
      const numColors = m.pullU32();
      const numIndices = m.pullU32();
      const numHeads = m.pullU32();
      const numLegs = m.pullU32();
      const headPivot = m.pullF32Array(3);
      const aabb = m.pullF32Array(6);

      const positions = new Float32Array(moduleInstance.HEAP8.buffer, positionsOffset, numPositions);
      const colors = new Uint8Array(moduleInstance.HEAP8.buffer, colorsOffset, numColors);
      const indices = new Uint32Array(moduleInstance.HEAP8.buffer, indicesOffset, numIndices);
      const heads = new Float32Array(moduleInstance.HEAP8.buffer, headsOffset, numHeads);
      const legs = new Float32Array(moduleInstance.HEAP8.buffer, legsOffset, numLegs);

      accept({
        positions,
        colors,
        indices,
        heads,
        legs,
        headPivot,
        aabb,
      });
    });
  });
  /* w.requestMarchObjects = (x, y, z, geometrySet, subparcel, subparcelSpecs, allocators) => new Promise((accept, reject) => {
    let subparcelObjects;
    callStack.allocRequest(METHODS.marchObjects, false, offset => {
      const numSubparcelObjects = subparcelSpecs.length;
      subparcelObjects = w.alloc(Uint32Array, numSubparcelObjects);
      for (let i = 0; i < subparcelSpecs.length; i++) {
        subparcelObjects[i] = subparcelSpecs[i].offset;
      }

      callStack.u32[offset] = geometrySet;
      callStack.i32[offset + 1] = x;
      callStack.i32[offset + 2] = y;
      callStack.i32[offset + 3] = z;
      callStack.u32[offset + 4] = subparcel.offset;
      callStack.u32[offset + 5] = subparcelObjects.byteOffset;
      callStack.u32[offset + 6] = numSubparcelObjects;
      callStack.u32[offset + 7] = allocators.positions.ptr;
      callStack.u32[offset + 8] = allocators.uvs.ptr;
      callStack.u32[offset + 9] = allocators.ids.ptr;
      callStack.u32[offset + 10] = allocators.indices.ptr;
      callStack.u32[offset + 11] = allocators.skyLights.ptr;
      callStack.u32[offset + 12] = allocators.torchLights.ptr;
    }, offset => {
      const positionsFreeEntry = callStack.ou32[offset + 13];
      const uvsFreeEntry = callStack.ou32[offset + 14];
      const idsFreeEntry = callStack.ou32[offset + 15];
      const indicesFreeEntry = callStack.ou32[offset + 16];
      const skyLightsFreeEntry = callStack.ou32[offset + 17];
      const torchLightsFreeEntry = callStack.ou32[offset + 18];

      const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const idsStart = moduleInstance.HEAPU32[idsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];

      const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const idsCount = moduleInstance.HEAPU32[idsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];

      w.free(subparcelObjects.byteOffset);

      accept({
        positionsFreeEntry,
        uvsFreeEntry,
        idsFreeEntry,
        indicesFreeEntry,
        skyLightsFreeEntry,
        torchLightsFreeEntry,

        positionsStart,
        uvsStart,
        idsStart,
        indicesStart,
        skyLightsStart,
        torchLightsStart,

        positionsCount,
        uvsCount,
        idsCount,
        indicesCount,
        skyLightsCount,
        torchLightsCount,
      });
    });
  }); */
  w.getHeight = (hash, x, y, z, baseHeight) => {
    return moduleInstance._doGetHeight(
      hash,
      x,
      y,
      z,
      baseHeight
    );
  };
  /* const wormRate = 2;
  const wormRadiusBase = 2;
  const wormRadiusRate = 2;
  const objectsRate = 3;
  const potentialDefault = -0.5;
  w.requestNoise = (hash, x, y, z, baseHeight, subparcelOffset) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.noise, false, offset => {
      callStack.u32[offset] = hash;

      callStack.f32[offset + 1] = x;
      callStack.f32[offset + 2] = y;
      callStack.f32[offset + 3] = z;
      callStack.f32[offset + 4] = baseHeight;
      callStack.f32[offset + 5] = wormRate;
      callStack.f32[offset + 6] = wormRadiusBase;
      callStack.f32[offset + 7] = wormRadiusRate;
      callStack.f32[offset + 8] = objectsRate;
      callStack.f32[offset + 9] = potentialDefault;

      callStack.u32[offset + 10] = subparcelOffset;
    }, offset => {
      accept();
    });
  });
  w.requestMarchingCubes = (seed, meshId, x, y, z, potentials, biomes, heightfield, lightfield, allocators) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.marchingCubes, false, offset => {
      callStack.f32[offset] = meshId;

      // dims
      callStack.i32[offset + 1] = SUBPARCEL_SIZE;
      callStack.i32[offset + 2] = SUBPARCEL_SIZE;
      callStack.i32[offset + 3] = SUBPARCEL_SIZE;

      callStack.u32[offset + 4] = potentials.byteOffset;
      callStack.u32[offset + 5] = biomes.byteOffset;
      callStack.u32[offset + 6] = heightfield.byteOffset;
      callStack.u32[offset + 7] = lightfield.byteOffset;

      // shift
      callStack.f32[offset + 8] = x*SUBPARCEL_SIZE;
      callStack.f32[offset + 9] = y*SUBPARCEL_SIZE;
      callStack.f32[offset + 10] = z*SUBPARCEL_SIZE;

      // scale
      callStack.f32[offset + 11] = 1;
      callStack.f32[offset + 12] = 1;
      callStack.f32[offset + 13] = 1;

      callStack.u32[offset + 14] = allocators.positions.ptr;
      callStack.u32[offset + 15] = allocators.normals.ptr;
      callStack.u32[offset + 16] = allocators.uvs.ptr;
      // callStack.u32[offset + 17] = allocators.barycentrics.ptr;
      callStack.u32[offset + 17] = allocators.aos.ptr;
      callStack.u32[offset + 18] = allocators.ids.ptr;
      callStack.u32[offset + 19] = allocators.skyLights.ptr;
      callStack.u32[offset + 20] = allocators.torchLights.ptr;
      callStack.u32[offset + 21] = allocators.peeks.ptr;
    }, offset => {
      const positionsFreeEntry = callStack.ou32[offset + 22];
      const normalsFreeEntry = callStack.ou32[offset + 23];
      const uvsFreeEntry = callStack.ou32[offset + 24];
      const barycentricsFreeEntry = callStack.ou32[offset + 25];
      const aosFreeEntry = callStack.ou32[offset + 26];
      const idsFreeEntry = callStack.ou32[offset + 27];
      const skyLightsFreeEntry = callStack.ou32[offset + 28];
      const torchLightsFreeEntry = callStack.ou32[offset + 29];
      const peeksFreeEntry = callStack.ou32[offset + 30];

      const numOpaquePositions = callStack.ou32[offset + 31];
      const numTransparentPositions = callStack.ou32[offset + 32];

      const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const normalsStart = moduleInstance.HEAPU32[normalsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      // const barycentricsStart = moduleInstance.HEAPU32[barycentricsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const aosStart = moduleInstance.HEAPU32[aosFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const idsStart = moduleInstance.HEAPU32[idsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT];
      const peeksStart = moduleInstance.HEAPU32[peeksFreeEntry/Uint32Array.BYTES_PER_ELEMENT];

      const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const normalsCount = moduleInstance.HEAPU32[normalsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      // const barycentricsCount = moduleInstance.HEAPU32[barycentricsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const aosCount = moduleInstance.HEAPU32[aosFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const idsCount = moduleInstance.HEAPU32[idsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];
      const peeksCount = moduleInstance.HEAPU32[peeksFreeEntry/Uint32Array.BYTES_PER_ELEMENT + 1];

      const _decodeArenaEntry = (allocator, freeEntry, constructor) => {
        const positionsBase = new Uint32Array(moduleInstance.HEAP8.buffer, allocator.ptr, 1)[0];
        const positionsOffset = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry, 1)[0];
        const positionsLength = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry + Uint32Array.BYTES_PER_ELEMENT, 1)[0];
        const positions = new constructor(moduleInstance.HEAP8.buffer, positionsBase + positionsOffset, positionsLength/constructor.BYTES_PER_ELEMENT);
        return positions;
      };
      const positions = _decodeArenaEntry(allocators.positions, positionsFreeEntry, Float32Array);
      const peeks = _decodeArenaEntry(allocators.peeks, peeksFreeEntry, Uint8Array);
      // console.log('loaded positions', positions, peeks);

      accept({
        positionsFreeEntry,
        normalsFreeEntry,
        uvsFreeEntry,
        // barycentricsFreeEntry,
        aosFreeEntry,
        idsFreeEntry,
        skyLightsFreeEntry,
        torchLightsFreeEntry,
        peeksFreeEntry,

        positionsStart,
        normalsStart,
        uvsStart,
        // barycentricsStart,
        aosStart,
        idsStart,
        skyLightsStart,
        torchLightsStart,
        peeksStart,

        positionsCount,
        normalsCount,
        uvsCount,
        // barycentricsCount,
        aosCount,
        idsCount,
        skyLightsCount,
        torchLightsCount,
        peeksCount,

        numOpaquePositions,
        numTransparentPositions,

        x,
        y,
        z,
      });
    });
  }); */
  w.makeTracker = function() {
    return moduleInstance._makeTracker.apply(moduleInstance, arguments);
  };
  /* w.requestBakeGeometry = (positions, indices) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.bakeGeometry, false, offset => {
      callStack.u32[offset] = positions.byteOffset;
      callStack.u32[offset + 1] = indices ? indices.byteOffset : 0;
      callStack.u32[offset + 2] = positions.length;
      callStack.u32[offset + 3] = indices ? indices.length : 0;
    }, offset => {
      const writeStream = callStack.ou32[offset + 4];
      accept(writeStream);
    });
  });
  w.releaseBakedGeometry = writeStream => {
    moduleInstance._releaseBakedGeometry(writeStream);
  };
  w.registerBakedGeometry = (meshId, writeStream, x, y, z) => {
    scratchStack.f32[0] = x*SUBPARCEL_SIZE + SUBPARCEL_SIZE/2;
    scratchStack.f32[1] = y*SUBPARCEL_SIZE + SUBPARCEL_SIZE/2;
    scratchStack.f32[2] = z*SUBPARCEL_SIZE + SUBPARCEL_SIZE/2;

    scratchStack.f32[3] = 0;
    scratchStack.f32[4] = 0;
    scratchStack.f32[5] = 0;
    scratchStack.f32[6] = 1;

    moduleInstance._registerBakedGeometry(
      meshId,
      writeStream,
      scratchStack.f32.byteOffset,
      scratchStack.f32.byteOffset + 3*Float32Array.BYTES_PER_ELEMENT,
      scratchStack.u32.byteOffset + 7*Uint32Array.BYTES_PER_ELEMENT
    );
    return scratchStack.u32[7];
  };
  w.registerBoxGeometry = (meshId, positionData, quaternionData, w, h, d) => {
    positionData.toArray(scratchStack.f32, 0);
    quaternionData.toArray(scratchStack.f32, 3);

    moduleInstance._registerBoxGeometry(
      meshId,
      scratchStack.f32.byteOffset,
      scratchStack.f32.byteOffset + 3*Float32Array.BYTES_PER_ELEMENT,
      w,
      h,
      d,
      scratchStack.u32.byteOffset + 7*Uint32Array.BYTES_PER_ELEMENT
    );
    return scratchStack.u32[7];
  };
  w.registerCapsuleGeometry = (meshId, positionData, quaternionData, radius, halfHeight) => {
    positionData.toArray(scratchStack.f32, 0);
    quaternionData.toArray(scratchStack.f32, 3);

    moduleInstance._registerCapsuleGeometry(
      meshId,
      scratchStack.f32.byteOffset,
      scratchStack.f32.byteOffset + 3*Float32Array.BYTES_PER_ELEMENT,
      radius,
      halfHeight,
      scratchStack.u32.byteOffset + 7*Uint32Array.BYTES_PER_ELEMENT
    );
    return scratchStack.u32[7];
  };
  w.unregisterGeometry = ptr => {
    moduleInstance._unregisterGeometry(ptr);
  }; */
  w.raycast = (tracker, p, q) => {
    p.toArray(scratchStack.f32, 0);
    localVector.set(0, 0, -1)
      .applyQuaternion(q)
      .toArray(scratchStack.f32, 3);
    geometryManager.currentChunkMesh.matrixWorld.decompose(localVector, localQuaternion, localVector2);
    localVector.toArray(scratchStack.f32, 6);
    localQuaternion.toArray(scratchStack.f32, 9);

    const originOffset = scratchStack.f32.byteOffset;
    const directionOffset = scratchStack.f32.byteOffset + 3 * Float32Array.BYTES_PER_ELEMENT;
    const meshPositionOffset = scratchStack.f32.byteOffset + 6 * Float32Array.BYTES_PER_ELEMENT;
    const meshQuaternionOffset = scratchStack.f32.byteOffset + 9 * Float32Array.BYTES_PER_ELEMENT;

    const hitOffset = scratchStack.f32.byteOffset + 13 * Float32Array.BYTES_PER_ELEMENT;
    const pointOffset = scratchStack.f32.byteOffset + 14 * Float32Array.BYTES_PER_ELEMENT;
    const normalOffset = scratchStack.f32.byteOffset + 17 * Float32Array.BYTES_PER_ELEMENT;
    const distanceOffset = scratchStack.f32.byteOffset + 20 * Float32Array.BYTES_PER_ELEMENT;
    const objectIdOffset = scratchStack.u32.byteOffset + 21 * Float32Array.BYTES_PER_ELEMENT;
    const faceIndexOffset = scratchStack.u32.byteOffset + 22 * Float32Array.BYTES_PER_ELEMENT;
    const positionOffset = scratchStack.u32.byteOffset + 23 * Float32Array.BYTES_PER_ELEMENT;
    const quaternionOffset = scratchStack.u32.byteOffset + 26 * Float32Array.BYTES_PER_ELEMENT;

    /* const raycastArgs = {
      origin: allocator.alloc(Float32Array, 3),
      direction: allocator.alloc(Float32Array, 3),
      meshPosition: allocator.alloc(Float32Array, 3),
      meshQuaternion: allocator.alloc(Float32Array, 4),
      hit: allocator.alloc(Uint32Array, 1),
      point: allocator.alloc(Float32Array, 3),
      normal: allocator.alloc(Float32Array, 3),
      distance: allocator.alloc(Float32Array, 1),
      meshId: allocator.alloc(Uint32Array, 1),
      faceIndex: allocator.alloc(Uint32Array, 1),
    }; */

    moduleInstance._raycast(
      tracker,
      originOffset,
      directionOffset,
      meshPositionOffset,
      meshQuaternionOffset,
      hitOffset,
      pointOffset,
      normalOffset,
      distanceOffset,
      objectIdOffset,
      faceIndexOffset,
      positionOffset,
      quaternionOffset,
    );
    const objectId = scratchStack.u32[21];
    const faceIndex = scratchStack.u32[22];
    const objectPosition = scratchStack.f32.slice(23, 26);
    const objectQuaternion = scratchStack.f32.slice(26, 30);

    return scratchStack.u32[13] ? {
      point: scratchStack.f32.slice(14, 17),
      normal: scratchStack.f32.slice(17, 20),
      distance: scratchStack.f32[20],
      meshId: scratchStack.u32[21],
      objectId,
      faceIndex,
      objectPosition,
      objectQuaternion,
    } : null;
  };
  w.collide = (tracker, radius, halfHeight, p, q, maxIter) => {
    p.toArray(scratchStack.f32, 0);
    localQuaternion.copy(q)
      .premultiply(capsuleUpQuaternion)
      .toArray(scratchStack.f32, 3);
    geometryManager.currentChunkMesh.matrixWorld.decompose(localVector, localQuaternion, localVector2);
    localVector.toArray(scratchStack.f32, 7);
    localQuaternion.toArray(scratchStack.f32, 10);

    const positionOffset = scratchStack.f32.byteOffset;
    const quaternionOffset = scratchStack.f32.byteOffset + 3 * Float32Array.BYTES_PER_ELEMENT;
    const meshPositionOffset = scratchStack.f32.byteOffset + 7 * Float32Array.BYTES_PER_ELEMENT;
    const meshQuaternionOffset = scratchStack.f32.byteOffset + 10 * Float32Array.BYTES_PER_ELEMENT;

    const hitOffset = scratchStack.f32.byteOffset + 14 * Float32Array.BYTES_PER_ELEMENT;
    const directionOffset = scratchStack.f32.byteOffset + 15 * Float32Array.BYTES_PER_ELEMENT;
    const groundedOffset = scratchStack.f32.byteOffset + 18 * Float32Array.BYTES_PER_ELEMENT;

    /* const collideArgs = {
      position: allocator.alloc(Float32Array, 3),
      quaternion: allocator.alloc(Float32Array, 4),
      meshPosition: allocator.alloc(Float32Array, 3),
      meshQuaternion: allocator.alloc(Float32Array, 4),
      hit: allocator.alloc(Uint32Array, 1),
      direction: allocator.alloc(Float32Array, 3),
      grounded: allocator.alloc(Uint32Array, 1),
    }; */

    moduleInstance._collide(
      tracker,
      radius,
      halfHeight,
      positionOffset,
      quaternionOffset,
      meshPositionOffset,
      meshQuaternionOffset,
      maxIter,
      hitOffset,
      directionOffset,
      groundedOffset,
    );

    return scratchStack.u32[14] ? {
      direction: scratchStack.f32.slice(15, 18),
      grounded: !!scratchStack.u32[18],
    } : null;
  };
  w.getSubparcelArenaSpec = subparcelOffset => {
    const subparcelArenaSpecOffset = scratchStack.u32.byteOffset;
    moduleInstance._getSubparcelArenaSpec(subparcelOffset, subparcelArenaSpecOffset);
    const subparcelArenaSpecOffset32 = subparcelArenaSpecOffset/Uint32Array.BYTES_PER_ELEMENT;

    let index = 0;
    let landArenaSpec, vegetationArenaSpec, thingArenaSpec;
    {
      const positionsFreeEntry = scratchStack.u32[index++];
      const normalsFreeEntry = scratchStack.u32[index++];
      const uvsFreeEntry = scratchStack.u32[index++];
      const aosFreeEntry = scratchStack.u32[index++];
      const idsFreeEntry = scratchStack.u32[index++];
      const skyLightsFreeEntry = scratchStack.u32[index++];
      const torchLightsFreeEntry = scratchStack.u32[index++];

      landArenaSpec = {
        positionsFreeEntry,
        normalsFreeEntry,
        uvsFreeEntry,
        aosFreeEntry,
        idsFreeEntry,
        skyLightsFreeEntry,
        torchLightsFreeEntry,
      };
    }
    {
      const positionsFreeEntry = scratchStack.u32[index++];
      const uvsFreeEntry = scratchStack.u32[index++];
      const idsFreeEntry = scratchStack.u32[index++];
      const indicesFreeEntry = scratchStack.u32[index++];
      const skyLightsFreeEntry = scratchStack.u32[index++];
      const torchLightsFreeEntry = scratchStack.u32[index++];

      vegetationArenaSpec = {
        positionsFreeEntry,
        uvsFreeEntry,
        idsFreeEntry,
        indicesFreeEntry,
        skyLightsFreeEntry,
        torchLightsFreeEntry,
      };
    }
    {
      const positionsFreeEntry = scratchStack.u32[index++];
      const uvsFreeEntry = scratchStack.u32[index++];
      const atlasUvsFreeEntry = scratchStack.u32[index++];
      const idsFreeEntry = scratchStack.u32[index++];
      const indicesFreeEntry = scratchStack.u32[index++];
      const skyLightsFreeEntry = scratchStack.u32[index++];
      const torchLightsFreeEntry = scratchStack.u32[index++];

      thingArenaSpec = {
        positionsFreeEntry,
        uvsFreeEntry,
        atlasUvsFreeEntry,
        idsFreeEntry,
        indicesFreeEntry,
        skyLightsFreeEntry,
        torchLightsFreeEntry,
      };
    }
    return [landArenaSpec, vegetationArenaSpec, thingArenaSpec];
  };
  w.tickCull = (tracker, position, matrix) => {
    position.toArray(scratchStack.f32, 0);
    matrix.toArray(scratchStack.f32, 3);

    const positionOffset = scratchStack.f32.byteOffset;
    const matrixOffset = scratchStack.f32.byteOffset + 3 * Float32Array.BYTES_PER_ELEMENT;
    const numLandCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16) * Float32Array.BYTES_PER_ELEMENT;
    const numVegetationCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16 + 1) * Float32Array.BYTES_PER_ELEMENT;
    const numThingCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16 + 2) * Float32Array.BYTES_PER_ELEMENT;
    const landCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16 + 3) * Float32Array.BYTES_PER_ELEMENT;
    const vegetationCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16 + 3 + 4096) * Float32Array.BYTES_PER_ELEMENT;
    const thingCullResultsOffset = scratchStack.f32.byteOffset + (3 + 16 + 3 + 4096 * 2) * Float32Array.BYTES_PER_ELEMENT;

    moduleInstance._tickCull(
      tracker,
      positionOffset,
      matrixOffset,
      landCullResultsOffset,
      numLandCullResultsOffset,
      vegetationCullResultsOffset,
      numVegetationCullResultsOffset,
      thingCullResultsOffset,
      numThingCullResultsOffset,
    );

    const numLandCullResults = scratchStack.u32[3 + 16];
    const landCullResults = Array(numLandCullResults);
    for (let i = 0; i < landCullResults.length; i++) {
      landCullResults[i] = {
        start: scratchStack.u32[3 + 16 + 3 + i * 3],
        count: scratchStack.u32[3 + 16 + 3 + i * 3 + 1],
        materialIndex: scratchStack.u32[3 + 16 + 3 + i * 3 + 2],
      };
    }
    const numVegetationCullResults = scratchStack.u32[3 + 16 + 1];
    const vegetationCullResults = Array(numVegetationCullResults);
    for (let i = 0; i < vegetationCullResults.length; i++) {
      vegetationCullResults[i] = {
        start: scratchStack.u32[3 + 16 + 3 + 4096 + i * 3],
        count: scratchStack.u32[3 + 16 + 3 + 4096 + i * 3 + 1],
        materialIndex: scratchStack.u32[3 + 16 + 3 + 4096 + i * 3 + 2],
      };
    }
    const numThingCullResults = scratchStack.u32[3 + 16 + 1];
    const thingCullResults = Array(numThingCullResults);
    for (let i = 0; i < thingCullResults.length; i++) {
      thingCullResults[i] = {
        start: scratchStack.u32[3 + 16 + 3 + 4096 * 2 + i * 3],
        count: scratchStack.u32[3 + 16 + 3 + 4096 * 2 + i * 3 + 1],
        materialIndex: scratchStack.u32[3 + 16 + 3 + 4096 * 2 + i * 3 + 2],
      };
    }
    return [landCullResults, vegetationCullResults, thingCullResults];
  };
  /* w.getSubparcel = (tracker, x, y, z) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.getSubparcel, true, offset => {
      callStack.u32[offset] = tracker;
      callStack.u32[offset + 1] = x;
      callStack.u32[offset + 2] = y;
      callStack.u32[offset + 3] = z;
    }, offset => {
      const subparcelPtr = callStack.ou32[offset++];
      const subparcelSharedPtr = callStack.ou32[offset++];
      if (subparcelSharedPtr) {
        const numObjects = moduleInstance.HEAPU32[(subparcelPtr + planet.Subparcel.offsets.numObjects)/Uint32Array.BYTES_PER_ELEMENT];
        console.log('got num objects', numObjects);

        w.requestReleaseSubparcel()
          .then(accept, reject);
      } else {
        console.log('no subparcel');
      }
    });
  }); */
  // window.getSubparcel = (x, y, z) => w.getSubparcel(tracker, x, y, z);
  w.requestReleaseSubparcel = (tracker, subparcelSharedPtr) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.releaseSubparcel, true, m => {
      m.pushU32(tracker);
      m.pushU32(subparcelSharedPtr);
    }, m => {
      accept();
    });
  });
  w.requestAddObject = (tracker, geometrySet, name, position, quaternion) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.addObject, true, m => {
      m.pushU32(tracker);
      m.pushU32(geometrySet);

      const srcNameUint8Array = textEncoder.encode(name);
      const srcNameUint8Array2 = new Uint8Array(MAX_NAME_LENGTH);
      srcNameUint8Array2.set(srcNameUint8Array);
      srcNameUint8Array2[srcNameUint8Array.byteLength] = 0;
      m.pushU8Array(srcNameUint8Array2);

      m.pushF32Array(position.toArray(new Float32Array(3)));
      m.pushF32Array(quaternion.toArray(new Float32Array(4)));
    }, m => {
      const objectId = m.pullU32();
      const numSubparcels = m.pullU32();
      // console.log('num subparcels add', numSubparcels);
      for (let i = 0; i < numSubparcels; i++) {
        const subparcelOffset = m.pullU32();
        const [landArenaSpec, vegetationArenaSpec, thingArenaSpec] = geometryWorker.getSubparcelArenaSpec(subparcelOffset);
        const {
          positionsFreeEntry,
          uvsFreeEntry,
          idsFreeEntry,
          indicesFreeEntry,
          skyLightsFreeEntry,
          torchLightsFreeEntry,
        } = vegetationArenaSpec;

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        /* const _decodeArenaEntry = (allocator, freeEntry, constructor) => {
          const positionsBase = new Uint32Array(moduleInstance.HEAP8.buffer, allocator.ptr, 1)[0];
          const positionsOffset = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry, 1)[0];
          const positionsLength = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry + Uint32Array.BYTES_PER_ELEMENT, 1)[0];
          const positions = new constructor(moduleInstance.HEAP8.buffer, positionsBase + positionsOffset, positionsLength/constructor.BYTES_PER_ELEMENT);
          return positions;
        };
        const positions = _decodeArenaEntry(vegetationAllocators.positions, positionsFreeEntry, Float32Array);
        const uvs = _decodeArenaEntry(vegetationAllocators.uvs, uvsFreeEntry, Float32Array);
        const ids = _decodeArenaEntry(vegetationAllocators.ids, idsFreeEntry, Float32Array);
        const indices = _decodeArenaEntry(vegetationAllocators.indices, indicesFreeEntry, Uint32Array);
        const skyLights = _decodeArenaEntry(vegetationAllocators.skyLights, skyLightsFreeEntry, Uint8Array);
        const torchLights = _decodeArenaEntry(vegetationAllocators.torchLights, torchLightsFreeEntry, Uint8Array);
        console.log('got positions', {positions, uvs, ids, indices, skyLights, torchLights}); */

        geometryManager.currentVegetationMesh.updateGeometry({
          positionsStart,
          uvsStart,
          idsStart,
          indicesStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          uvsCount,
          idsCount,
          indicesCount,
          skyLightsCount,
          torchLightsCount,
        });
      }
      callStack.allocRequest(METHODS.releaseAddRemoveObject, true, m2 => {
        m2.pushU32(tracker);
        m2.pushU32(numSubparcels);
        for (let i = 0; i < numSubparcels; i++) {
          m2.pushU32(m.pullU32());
        }
      }, m => {
        // console.log('done release', numSubparcels);
        accept({
          objectId,
        });
      });
    });
  });
  w.requestRemoveObject = (tracker, geometrySet, sx, sy, sz, objectId) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.removeObject, true, m => {
      m.pushU32(tracker);
      m.pushU32(geometrySet);
      m.pushI32(sx);
      m.pushI32(sy);
      m.pushI32(sz);
      m.pushU32(objectId);
    }, m => {
      const numSubparcels = m.pullU32();
      for (let i = 0; i < numSubparcels; i++) {
        const subparcelOffset = m.pullU32();
        const [landArenaSpec, vegetationArenaSpec, thingArenaSpec] = geometryWorker.getSubparcelArenaSpec(subparcelOffset);
        const {
          positionsFreeEntry,
          uvsFreeEntry,
          idsFreeEntry,
          indicesFreeEntry,
          skyLightsFreeEntry,
          torchLightsFreeEntry,
        } = vegetationArenaSpec;

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        /* const _decodeArenaEntry = (allocator, freeEntry, constructor) => {
          const positionsBase = new Uint32Array(moduleInstance.HEAP8.buffer, allocator.ptr, 1)[0];
          const positionsOffset = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry, 1)[0];
          const positionsLength = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry + Uint32Array.BYTES_PER_ELEMENT, 1)[0];
          const positions = new constructor(moduleInstance.HEAP8.buffer, positionsBase + positionsOffset, positionsLength/constructor.BYTES_PER_ELEMENT);
          return positions;
        };
        const positions = _decodeArenaEntry(vegetationAllocators.positions, positionsFreeEntry, Float32Array);
        const uvs = _decodeArenaEntry(vegetationAllocators.uvs, uvsFreeEntry, Float32Array);
        const ids = _decodeArenaEntry(vegetationAllocators.ids, idsFreeEntry, Float32Array);
        const indices = _decodeArenaEntry(vegetationAllocators.indices, indicesFreeEntry, Uint32Array);
        const skyLights = _decodeArenaEntry(vegetationAllocators.skyLights, skyLightsFreeEntry, Uint8Array);
        const torchLights = _decodeArenaEntry(vegetationAllocators.torchLights, torchLightsFreeEntry, Uint8Array);
        console.log('got positions', {positions, uvs, ids, indices, skyLights, torchLights}); */

        geometryManager.currentVegetationMesh.updateGeometry({
          positionsStart,
          uvsStart,
          idsStart,
          indicesStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          uvsCount,
          idsCount,
          indicesCount,
          skyLightsCount,
          torchLightsCount,
        });
      }
      callStack.allocRequest(METHODS.releaseAddRemoveObject, true, m2 => {
        m2.pushU32(tracker);
        m2.pushU32(numSubparcels);
        for (let i = 0; i < numSubparcels; i++) {
          m2.pushU32(m.pullU32());
        }
      }, m => {
        // console.log('done release', numSubparcels);
        accept();
      });
    });
  });
  w.requestMine = (tracker, p, delta) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.mine, true, m => {
      m.pushU32(tracker);
      m.pushF32Array(p.toArray(new Float32Array(3)));
      m.pushF32(delta);
    }, m => {
      const numSubparcels = m.pullU32();
      for (let i = 0; i < numSubparcels; i++) {
        const subparcelOffset = m.pullU32();
        const [landArenaSpec, vegetationArenaSpec, thingArenaSpec] = geometryWorker.getSubparcelArenaSpec(subparcelOffset);
        const {
          positionsFreeEntry,
          normalsFreeEntry,
          uvsFreeEntry,
          aosFreeEntry,
          idsFreeEntry,
          skyLightsFreeEntry,
          torchLightsFreeEntry,
        } = landArenaSpec;

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const normalsStart = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const aosStart = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const normalsCount = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const aosCount = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        /* const _decodeArenaEntry = (allocator, freeEntry, constructor) => {
          const positionsBase = new Uint32Array(moduleInstance.HEAP8.buffer, allocator.ptr, 1)[0];
          const positionsOffset = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry, 1)[0];
          const positionsLength = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry + Uint32Array.BYTES_PER_ELEMENT, 1)[0];
          const positions = new constructor(moduleInstance.HEAP8.buffer, positionsBase + positionsOffset, positionsLength/constructor.BYTES_PER_ELEMENT);
          return positions;
        };
        const positions = _decodeArenaEntry(landAllocators.positions, positionsFreeEntry, Float32Array);
        const normals = _decodeArenaEntry(landAllocators.normals, normalsFreeEntry, Float32Array);
        const uvs = _decodeArenaEntry(landAllocators.uvs, uvsFreeEntry, Float32Array);
        const aos = _decodeArenaEntry(landAllocators.aos, aosFreeEntry, Uint8Array);
        const skyLights = _decodeArenaEntry(landAllocators.skyLights, skyLightsFreeEntry, Uint8Array);
        const torchLights = _decodeArenaEntry(landAllocators.torchLights, torchLightsFreeEntry, Uint8Array);
        console.log('got positions', {positions, normals, uvs, aos, skyLights, torchLights}); */

        geometryManager.currentChunkMesh.updateGeometry({
          positionsStart,
          normalsStart,
          uvsStart,
          aosStart,
          idsStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          normalsCount,
          uvsCount,
          aosCount,
          idsCount,
          skyLightsCount,
          torchLightsCount,
        });
      }

      callStack.allocRequest(METHODS.releaseAddRemoveObject, true, m2 => {
        m2.pushU32(tracker);
        m2.pushU32(numSubparcels);
        for (let i = 0; i < numSubparcels; i++) {
          m2.pushU32(m.pullU32());
        }
      }, m => {
        // console.log('done release', numSubparcels);
        accept();
      });
    });
  });
  w.requestLight = (tracker, p, delta) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.light, true, m => {
      m.pushU32(tracker);
      m.pushF32Array(p.toArray(new Float32Array(3)));
      m.pushF32(delta);
    }, m => {
      const numSubparcels = m.pullU32();
      for (let i = 0; i < numSubparcels; i++) {
        {
          const positionsFreeEntry = m.pullU32();
          const normalsFreeEntry = m.pullU32();
          const uvsFreeEntry = m.pullU32();
          const aosFreeEntry = m.pullU32();
          const idsFreeEntry = m.pullU32();
          const skyLightsFreeEntry = m.pullU32();
          const torchLightsFreeEntry = m.pullU32();

          const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const normalsStart = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const aosStart = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

          const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const normalsCount = moduleInstance.HEAPU32[normalsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const aosCount = moduleInstance.HEAPU32[aosFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

          geometryManager.currentChunkMesh.updateGeometry({
            positionsStart,
            normalsStart,
            uvsStart,
            aosStart,
            idsStart,
            skyLightsStart,
            torchLightsStart,

            positionsCount,
            normalsCount,
            uvsCount,
            aosCount,
            idsCount,
            skyLightsCount,
            torchLightsCount,
          });
        }
        {
          const positionsFreeEntry = m.pullU32();
          const uvsFreeEntry = m.pullU32();
          const idsFreeEntry = m.pullU32();
          const indicesFreeEntry = m.pullU32();
          const skyLightsFreeEntry = m.pullU32();
          const torchLightsFreeEntry = m.pullU32();

          const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
          const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

          const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
          const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

          geometryManager.currentVegetationMesh.updateGeometry({
            positionsStart,
            uvsStart,
            idsStart,
            indicesStart,
            skyLightsStart,
            torchLightsStart,

            positionsCount,
            uvsCount,
            idsCount,
            indicesCount,
            skyLightsCount,
            torchLightsCount,
          });
        }
      }
      callStack.allocRequest(METHODS.releaseAddRemoveObject, true, m2 => {
        m2.pushU32(tracker);
        m2.pushU32(numSubparcels);
        for (let i = 0; i < numSubparcels; i++) {
          m2.pushU32(m.pullU32());
        }
      }, m => {
        // console.log('done release', numSubparcels);
        accept();
      });
    });
  });
  w.requestAddThingGeometry = (tracker, geometrySet, name, positions, uvs, indices, texture) => new Promise((accept, reject) => {
    let positionOffset, uvOffset, indexOffset, textureOffset;
    callStack.allocRequest(METHODS.addThingGeometry, true, m => {
      m.pushU32(tracker);
      m.pushU32(geometrySet);

      if (typeof name === 'string') {
        const srcNameUint8Array = textEncoder.encode(name);
        const srcNameUint8Array2 = new Uint8Array(MAX_NAME_LENGTH);
        srcNameUint8Array2.set(srcNameUint8Array);
        srcNameUint8Array2[srcNameUint8Array.byteLength] = 0;
        m.pushU8Array(srcNameUint8Array2);
      } else {
        const srcNameUint8Array2 = new Uint8Array(MAX_NAME_LENGTH);
        srcNameUint8Array2.set(name);
        srcNameUint8Array2[name.byteLength] = 0;
        m.pushU8Array(srcNameUint8Array2);
      }

      positionOffset = moduleInstance._malloc(positions.length * Float32Array.BYTES_PER_ELEMENT);
      moduleInstance.HEAPF32.set(positions, positionOffset/Float32Array.BYTES_PER_ELEMENT);
      m.pushU32(positions);

      uvOffset = moduleInstance._malloc(uvs.length * Float32Array.BYTES_PER_ELEMENT);
      moduleInstance.HEAPF32.set(positions, uvOffset/Float32Array.BYTES_PER_ELEMENT);
      m.pushU32(uvOffset);

      indexOffset = moduleInstance._malloc(indices.length * Uint32Array.BYTES_PER_ELEMENT);
      moduleInstance.HEAPU32.set(indices, indexOffset/Uint32Array.BYTES_PER_ELEMENT);
      m.pushU32(indexOffset);

      m.pushU32(positions.length);
      m.pushU32(uvs.length);
      m.pushU32(indices.length);

      textureOffset = moduleInstance._malloc(texture.length);
      moduleInstance.HEAPU8.set(texture, textureOffset);
      m.pushU32(textureOffset);
    }, m => {
      accept();
      
      w.free(positionOffset);
      w.free(uvOffset);
      w.free(indexOffset);
      w.free(textureOffset);
    });
  });
  w.requestAddThing = (tracker, geometrySet, name, position, quaternion, scale) => new Promise((accept, reject) => {
    callStack.allocRequest(METHODS.addThing, true, offset => {
      m.pushU32(tracker);
      m.pushU32(geometrySet);

      if (typeof name === 'string') {
        const srcNameUint8Array = textEncoder.encode(name);
        const srcNameUint8Array2 = new Uint8Array(MAX_NAME_LENGTH);
        srcNameUint8Array2.set(srcNameUint8Array);
        srcNameUint8Array2[srcNameUint8Array.byteLength] = 0;
        m.pushU8Array(srcNameUint8Array2);
      } else {
        const srcNameUint8Array2 = new Uint8Array(MAX_NAME_LENGTH);
        srcNameUint8Array2.set(name);
        srcNameUint8Array2[name.byteLength] = 0;
        m.pushU8Array(srcNameUint8Array2);
      }

      m.pushF32Array(position.toArray(new Float32Array(3)));
      m.pushF32Array(quaternion.toArray(new Float32Array(4)));
      m.pushF32Array(scale.toArray(new Float32Array(4)));
    }, m => {
      const objectId = m.pullU32();
      const textureOffset = m.pullU32();
      if (textureOffset) {
        const textureData = new Uint8Array(moduleInstance.HEAP8.buffer, textureOffset, thingTextureSize * thingTextureSize * 4);
        currentThingMesh.updateTexture(textureData);
      }

      const numSubparcels = m.pullU32();
      for (let i = 0; i < numSubparcels; i++) {
        const subparcelOffset = m.pullU32();
        const [landArenaSpec, vegetationArenaSpec, thingArenaSpec] = geometryWorker.getSubparcelArenaSpec(subparcelOffset);
        const {
          positionsFreeEntry,
          uvsFreeEntry,
          atlasUvsFreeEntry,
          idsFreeEntry,
          indicesFreeEntry,
          skyLightsFreeEntry,
          torchLightsFreeEntry,
        } = thingArenaSpec;

        const positionsStart = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const uvsStart = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const atlasUvsStart = moduleInstance.HEAPU32[atlasUvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const idsStart = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const indicesStart = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const skyLightsStart = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];
        const torchLightsStart = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT];

        const positionsCount = moduleInstance.HEAPU32[positionsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const uvsCount = moduleInstance.HEAPU32[uvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const atlasUvsCount = moduleInstance.HEAPU32[atlasUvsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const idsCount = moduleInstance.HEAPU32[idsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const indicesCount = moduleInstance.HEAPU32[indicesFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const skyLightsCount = moduleInstance.HEAPU32[skyLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];
        const torchLightsCount = moduleInstance.HEAPU32[torchLightsFreeEntry / Uint32Array.BYTES_PER_ELEMENT + 1];

        /* const _decodeArenaEntry = (allocator, freeEntry, constructor) => {
          const positionsBase = new Uint32Array(moduleInstance.HEAP8.buffer, allocator.ptr, 1)[0];
          const positionsOffset = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry, 1)[0];
          const positionsLength = new Uint32Array(moduleInstance.HEAP8.buffer, freeEntry + Uint32Array.BYTES_PER_ELEMENT, 1)[0];
          const positions = new constructor(moduleInstance.HEAP8.buffer, positionsBase + positionsOffset, positionsLength/constructor.BYTES_PER_ELEMENT);
          return positions;
        };
        const positions = _decodeArenaEntry(thingAllocators.positions, positionsFreeEntry, Float32Array);
        const uvs = _decodeArenaEntry(thingAllocators.uvs, uvsFreeEntry, Float32Array);
        const atlasUvs = _decodeArenaEntry(thingAllocators.atlasUvs, atlasUvsFreeEntry, Float32Array);
        const ids = _decodeArenaEntry(thingAllocators.ids, idsFreeEntry, Float32Array);
        const indices = _decodeArenaEntry(thingAllocators.indices, indicesFreeEntry, Uint32Array);
        const skyLights = _decodeArenaEntry(thingAllocators.skyLights, skyLightsFreeEntry, Uint8Array);
        const torchLights = _decodeArenaEntry(thingAllocators.torchLights, torchLightsFreeEntry, Uint8Array);
        console.log('got positions', {positions, uvs, atlasUvs, ids, indices, skyLights, torchLights}); */

        currentThingMesh.updateGeometry({
          positionsStart,
          uvsStart,
          atlasUvsStart,
          idsStart,
          indicesStart,
          skyLightsStart,
          torchLightsStart,

          positionsCount,
          uvsCount,
          atlasUvsCount,
          idsCount,
          indicesCount,
          skyLightsCount,
          torchLightsCount,
        });
      }

      callStack.allocRequest(METHODS.releaseAddRemoveObject, true, m2 => {
        m2.pushU32(tracker);
        m2.pushU32(numSubparcels);
        for (let i = 0; i < numSubparcels; i++) {
          m2.pushU32(m.pullU32());
        }
      }, m => {
        // console.log('done release', numSubparcels);
        accept();
      });
    });
  });
  w.convexHull = (positionsData, cameraPosition) => {
    const positions = geometryWorker.alloc(Float32Array, positionsData.length);
    positions.set(positionsData);

    cameraPosition.toArray(scratchStack.f32, 0);
    const convexHullResult = moduleInstance._convexHull(positions.byteOffset, positions.length, scratchStack.f32.byteOffset);

    const pointsOffset = moduleInstance.HEAPU32[convexHullResult / Uint32Array.BYTES_PER_ELEMENT];
    const numPoints = moduleInstance.HEAPU32[convexHullResult / Uint32Array.BYTES_PER_ELEMENT + 1];
    const points = moduleInstance.HEAPF32.slice(pointsOffset / Float32Array.BYTES_PER_ELEMENT, pointsOffset / Float32Array.BYTES_PER_ELEMENT + numPoints);
    const planeNormal = new THREE.Vector3().fromArray(moduleInstance.HEAPF32, convexHullResult / Float32Array.BYTES_PER_ELEMENT + 2);
    const planeConstant = moduleInstance.HEAPF32[convexHullResult / Uint32Array.BYTES_PER_ELEMENT + 5];
    const center = new THREE.Vector3().fromArray(moduleInstance.HEAPF32, convexHullResult / Float32Array.BYTES_PER_ELEMENT + 6);
    const tang = new THREE.Vector3().fromArray(moduleInstance.HEAPF32, convexHullResult / Float32Array.BYTES_PER_ELEMENT + 9);
    const bitang = new THREE.Vector3().fromArray(moduleInstance.HEAPF32, convexHullResult / Float32Array.BYTES_PER_ELEMENT + 12);

    w.free(positions.byteOffset);
    moduleInstance._deleteConvexHullResult(convexHullResult);

    return {
      points,
      planeNormal,
      planeConstant,
      center,
      tang,
      bitang,
    };
  };
  /* w.earcut = (tracker, ps, holes, holeCounts, points, z, zs, objectId, position, quaternion) => {
    const inPs = w.alloc(Float32Array, ps.length);
    inPs.set(ps);
    const inHoles = w.alloc(Float32Array, holes.length);
    inHoles.set(holes);
    const inHoleCounts = w.alloc(Uint32Array, holeCounts.length);
    inHoleCounts.set(holeCounts);
    const inPoints = w.alloc(Float32Array, points.length);
    inPoints.set(points);
    const inZs = w.alloc(Float32Array, zs.length);
    inZs.set(zs);
    position.toArray(scratchStack.f32, 0);
    const positionOffset = scratchStack.f32.byteOffset;
    quaternion.toArray(scratchStack.f32, 3);
    const quaternionOffset = scratchStack.f32.byteOffset + 3 * Float32Array.BYTES_PER_ELEMENT;
    const resultOffset = moduleInstance._earcut(tracker, inPs.byteOffset, inPs.length / 2, inHoles.byteOffset, inHoleCounts.byteOffset, inHoleCounts.length, inPoints.byteOffset, inPoints.length, z, inZs.byteOffset, objectId, positionOffset, quaternionOffset);

    const outPositionsOffset = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT];
    const outNumPositions = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 1];
    const outUvsOffset = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 2];
    const outNumUvs = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 3];
    const outIndicesOffset = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 4];
    const outNumIndices = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 5];
    const trianglePhysicsGeometry = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 6];
    const convexPhysicsGeometry = moduleInstance.HEAPU32[resultOffset / Uint32Array.BYTES_PER_ELEMENT + 7];

    const positions = moduleInstance.HEAPF32.subarray(outPositionsOffset / Float32Array.BYTES_PER_ELEMENT, outPositionsOffset / Float32Array.BYTES_PER_ELEMENT + outNumPositions);
    const uvs = moduleInstance.HEAPF32.subarray(outUvsOffset / Float32Array.BYTES_PER_ELEMENT, outUvsOffset / Float32Array.BYTES_PER_ELEMENT + outNumUvs);
    const indices = moduleInstance.HEAPU32.subarray(outIndicesOffset / Uint32Array.BYTES_PER_ELEMENT, outIndicesOffset / Uint32Array.BYTES_PER_ELEMENT + outNumIndices);

    w.free(inPs.byteOffset);
    w.free(inHoles.byteOffset);
    w.free(inHoleCounts.byteOffset);
    w.free(inPoints.byteOffset);
    w.free(inZs.byteOffset);

    return {
      resultOffset,

      positions,
      uvs,
      indices,
      trianglePhysicsGeometry,
      convexPhysicsGeometry,

      destroy() {
        moduleInstance._deleteEarcutResult(tracker, resultOffset);
      },
    };
  }; */
  w.update = () => {
    if (moduleInstance) {
      if (geometryManager.currentChunkMesh) {
        const neededCoordsOffset = moduleInstance._updateNeededCoords(
          geometryManager.tracker,
          geometryManager.currentChunkMesh.currentPosition.x,
          geometryManager.currentChunkMesh.currentPosition.y,
          geometryManager.currentChunkMesh.currentPosition.z,
        );
        if (neededCoordsOffset) {
          const addedSubparcelsOffset = moduleInstance.HEAPU32[neededCoordsOffset / Uint32Array.BYTES_PER_ELEMENT];
          const numAddedSubparcels = moduleInstance.HEAPU32[neededCoordsOffset / Uint32Array.BYTES_PER_ELEMENT + 1];

          (async () => {
            for (let i = 0; i < numAddedSubparcels; i++) {
              const subparcelOffset = moduleInstance.HEAP32[addedSubparcelsOffset / Uint32Array.BYTES_PER_ELEMENT + i];
              const index = moduleInstance.HEAP32[subparcelOffset / Uint32Array.BYTES_PER_ELEMENT + 3];
              const uint8Array = await storage.getRawTemp(`subparcel:${index}`);
              moduleInstance._subparcelUpdate(
                geometryManager.tracker,
                threadPool,
                geometryManager.geometrySet,
                neededCoordsOffset,
                subparcelOffset,
                1
              );
            }
          })().then(() => {
            moduleInstance._finishUpdate(
              geometryManager.tracker,
              neededCoordsOffset,
            );
          });
        }
      }

      callStack.outNumEntriesU32[0] = maxNumMessages;
      moduleInstance._tick(
        threadPool,
        callStack.ptr,
        callStack.numEntries,
        callStack.outPtr,
        callStack.outNumEntriesPtr,
      );
      callStack.reset();
      const numMessages = callStack.outNumEntriesU32[0];
      for (let i = 0; i < numMessages; i++) {
        const offset = i*messageSize;
        const endMessage = new CallStackMessage(callStack.outPtr + offset);
        const id = endMessage.getId();
        const method = endMessage.getMethod();

        if (id > 0) {
          const cb = cbIndex.get(id);
          if (cb) {
            cb(endMessage);
            cbIndex.delete(id);
          } else {
            throw new Error('invalid callback id: ' + id);
          }
        } else if (id === -1) {
          const cb = MESSAGES[method];
          if (cb) {
            cb(endMessage);
          } else {
            throw new Error('invalid message method: ' + method);
          }
        } else {
          throw new Error('invalid id: ' + id);
        }
      }
    }
  };
  return w;
})();
geometryManager.geometryWorker = geometryWorker;

const _updateGeometry = () => {
  geometryManager.crosshairMesh.update();
  
  geometryWorker.update();
};
geometryManager.update = _updateGeometry;

const _updatePhysics = p => {
  localVector.copy(p).add(localVector2.set(0, -1, 0));
  
  for (let i = 0; i < itemMeshes.length; i++) {
    const itemMesh = itemMeshes[i];
    if (itemMesh.getWorldPosition(localVector).distanceTo(p) < 1) {
      itemMesh.pickUp();
    }
    itemMesh.update(p);
  }

  /* for (const animal of animals) {
    if (!animal.isHeadAnimating()) {
      animal.lookAt(p);
    }
  } */
};
geometryManager.updatePhysics = _updatePhysics;

export default geometryManager;