import * as THREE from 'three';
import dc from './dual-contouring.js';
import { makePromise } from './util.js';
import { defaultChunkSize } from './constants.js';

//

const chunkWorldSize = defaultChunkSize;

//

const localVector = new THREE.Vector3();

//

// const ports = [];

//

const _cloneTerrainMeshData = (meshData) => {
  if (meshData) {
    const sizeRequired = meshData.positions.length * meshData.positions.constructor.BYTES_PER_ELEMENT +
      meshData.normals.length * meshData.normals.constructor.BYTES_PER_ELEMENT +
      // meshData.biomes.length * meshData.biomes.constructor.BYTES_PER_ELEMENT +
      meshData.biomesWeights.length * meshData.biomesWeights.constructor.BYTES_PER_ELEMENT +
      meshData.biomesUvs1.length * meshData.biomesUvs1.constructor.BYTES_PER_ELEMENT +
      meshData.biomesUvs2.length * meshData.biomesUvs2.constructor.BYTES_PER_ELEMENT +
      meshData.indices.length * meshData.indices.constructor.BYTES_PER_ELEMENT +
      meshData.skylights.length * meshData.skylights.constructor.BYTES_PER_ELEMENT +
      meshData.aos.length * meshData.aos.constructor.BYTES_PER_ELEMENT;
    const arrayBuffer = new ArrayBuffer(sizeRequired);
    let index = 0;

    const positions = new meshData.positions.constructor(arrayBuffer, index, meshData.positions.length);
    positions.set(meshData.positions);
    index += meshData.positions.length * meshData.positions.constructor.BYTES_PER_ELEMENT;
    
    const normals = new meshData.normals.constructor(arrayBuffer, index, meshData.normals.length);
    normals.set(meshData.normals);
    index += meshData.normals.length * meshData.normals.constructor.BYTES_PER_ELEMENT;
    
    // const biomes = new meshData.biomes.constructor(arrayBuffer, index, meshData.biomes.length);
    // biomes.set(meshData.biomes);
    // index += meshData.biomes.length * meshData.biomes.constructor.BYTES_PER_ELEMENT;

    const biomesWeights = new meshData.biomesWeights.constructor(arrayBuffer, index, meshData.biomesWeights.length);
    biomesWeights.set(meshData.biomesWeights);
    index += meshData.biomesWeights.length * meshData.biomesWeights.constructor.BYTES_PER_ELEMENT;
    
    const biomesUvs1 = new meshData.biomesUvs1.constructor(arrayBuffer, index, meshData.biomesUvs1.length);
    biomesUvs1.set(meshData.biomesUvs1);
    index += meshData.biomesUvs1.length * meshData.biomesUvs1.constructor.BYTES_PER_ELEMENT;

    const biomesUvs2 = new meshData.biomesUvs2.constructor(arrayBuffer, index, meshData.biomesUvs2.length);
    biomesUvs2.set(meshData.biomesUvs2);
    index += meshData.biomesUvs2.length * meshData.biomesUvs2.constructor.BYTES_PER_ELEMENT;

    const indices = new meshData.indices.constructor(arrayBuffer, index, meshData.indices.length);
    indices.set(meshData.indices);
    index += meshData.indices.length * meshData.indices.constructor.BYTES_PER_ELEMENT;

    const skylights = new meshData.skylights.constructor(arrayBuffer, index, meshData.skylights.length);
    skylights.set(meshData.skylights);
    index += meshData.skylights.length * meshData.skylights.constructor.BYTES_PER_ELEMENT;

    const aos = new meshData.aos.constructor(arrayBuffer, index, meshData.aos.length);
    aos.set(meshData.aos);
    index += meshData.aos.length * meshData.aos.constructor.BYTES_PER_ELEMENT;

    return {
      // bufferAddress: arrayBuffer.byteOffset,
      arrayBuffer,
      positions,
      normals,
      // biomes,
      biomesWeights,
      biomesUvs1,
      biomesUvs2,
      indices,
      skylights,
      aos,
    };
  } else {
    return null;
  }
};
const _cloneLiquidMeshData = (meshData) => {
  if (meshData) {
    /* return {
      arrayBuffer: new ArrayBuffer(1),
      positions: meshData.positions.slice(),
      normals: meshData.normals.slice(),
      biomes: meshData.biomes.slice(),
      biomesWeights: meshData.biomesWeights.slice(),
      indices: meshData.indices.slice(),
    }; */

    const sizeRequired = meshData.positions.length * meshData.positions.constructor.BYTES_PER_ELEMENT +
      meshData.normals.length * meshData.normals.constructor.BYTES_PER_ELEMENT +
      meshData.biomes.length * meshData.biomes.constructor.BYTES_PER_ELEMENT +
      meshData.indices.length * meshData.indices.constructor.BYTES_PER_ELEMENT;
    const arrayBuffer = new ArrayBuffer(sizeRequired);
    let index = 0;

    const positions = new meshData.positions.constructor(arrayBuffer, index, meshData.positions.length);
    positions.set(meshData.positions);
    index += meshData.positions.length * meshData.positions.constructor.BYTES_PER_ELEMENT;
    
    const normals = new meshData.normals.constructor(arrayBuffer, index, meshData.normals.length);
    normals.set(meshData.normals);
    index += meshData.normals.length * meshData.normals.constructor.BYTES_PER_ELEMENT;
    
    const biomes = new meshData.biomes.constructor(arrayBuffer, index, meshData.biomes.length);
    biomes.set(meshData.biomes);
    index += meshData.biomes.length * meshData.biomes.constructor.BYTES_PER_ELEMENT;
    
    const indices = new meshData.indices.constructor(arrayBuffer, index, meshData.indices.length);
    indices.set(meshData.indices);
    index += meshData.indices.length * meshData.indices.constructor.BYTES_PER_ELEMENT;

    return {
      // bufferAddress: arrayBuffer.byteOffset,
      arrayBuffer,
      positions,
      normals,
      biomes,
      indices,
    };
  } else {
    return null;
  }
};

const instances = new Map();

let loaded = false;
// let running = false;
let queue = [];
const _handleMethod = async ({method, args, instance: instanceKey, taskId}) => {
  // console.log('worker handle method', method, args);

  /* const _injectDamages = (chunks, instance) => {
    // console.log("Instance : " + instance);
    // inject the damage to peer workers
    const method = 'injectDamages';
    const args = {
      chunks,
      instance,
    };
    for (const port of ports) {
      // console.log('got port', port);
      port.postMessage({
        method,
        args,
      });
    }
  }; */
  const _chunksToResult = chunks => chunks.map(({ position }) => ({ position }));

  switch (method) {
    case 'initialize': {
      const {chunkSize, seed, numThreads} = args;
      return dc.initialize(chunkSize, seed, numThreads);
    }
    /* case 'port': {
      const { port } = args;
      port.onmessage = (e) => {
        _handleMessage({
          data: e.data,
          port,
        });
      };
      ports.push(port);
      return;
    } */
    case 'ensureInstance': {
      const { instance: instanceKey } = args;
      // console.log(instanceKey);
      let instance = instances.get(instanceKey);
      if (!instance) {
        instance = dc.createInstance();
        instances.set(instanceKey, instance);
      }
      return true;
    }
    case 'deleteInstance': {
      const { instance: instanceKey } = args;
      const instance = instances.get(instanceKey);
      if (instance) {
        dc.deleteInstance(instance);
        instances.delete(instanceKey);
        return true;
      } else {
        return false;
      }
    }
    case 'setClipRange': {
      const {instance: instanceKey, range} = args;
      const instance = instances.get(instanceKey);
      dc.setClipRange(instance, range);
      return true;
    }
    case 'generateTerrainChunk': {
      const {chunkPosition, lodArray} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('generateTerrainChunk : instance not found');
      
      localVector.fromArray(chunkPosition)
        .multiplyScalar(chunkWorldSize);
        
      const meshData = await dc.createTerrainChunkMeshAsync(instance, taskId, localVector.x, localVector.y, localVector.z, lodArray);
      const meshData2 = _cloneTerrainMeshData(meshData);
      meshData && dc.free(meshData.bufferAddress);

      if (meshData2) {
        const spec = {
          result: meshData2,
          transfers: [meshData2.arrayBuffer],
        };
        return spec;
      } else {
        return null;
      }
    }
    case 'generateTerrainChunkRenderable': {
      const {chunkPosition, lodArray} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('generateTerrainChunkRenderable : instance not found');

      const position = new THREE.Vector3().fromArray(chunkPosition)
        .multiplyScalar(chunkWorldSize);
      // console.log('got position', position.toArray().join(','));
      const meshData = await dc.createTerrainChunkMeshAsync(instance, taskId, position.x, position.y, position.z, lodArray);
      // console.log('got mesh data result 1', meshData);
      const meshData2 = _cloneTerrainMeshData(meshData);
      // console.log('got mesh data result 2', meshData2);
      meshData && dc.free(meshData.bufferAddress);

      if (meshData2) {
        const lod = lodArray[0];
        {
          const taskId = Math.floor(Math.random() * 0xFFFFFF);
          // console.log('skylight task id', taskId);
          meshData2.skylights = await dc.getChunkSkylightAsync(
            instance,
            taskId,
            position.x,
            position.y,
            position.z,
            lod
          );
        }
        {
          const taskId = Math.floor(Math.random() * 0xFFFFFF);
          // console.log('ao task id', taskId);
          meshData2.aos = await dc.getChunkAoAsync(
            instance,
            taskId,
            position.x,
            position.y,
            position.z,
            lod
          );
        }

        const spec = {
          result: meshData2,
          transfers: [
            meshData2.arrayBuffer,
            meshData2.skylights.buffer,
            meshData2.aos.buffer,
          ],
        };
        return spec;
      } else {
        return null;
      }
    }
    case 'generateLiquidChunk': {
      const {chunkPosition, lodArray} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('generateLiquidChunk : instance not found');
      
      localVector.fromArray(chunkPosition)
        .multiplyScalar(chunkWorldSize);
      const meshData = await dc.createLiquidChunkMeshAsync(instance, taskId, localVector.x, localVector.y, localVector.z, lodArray);
      const meshData2 = _cloneLiquidMeshData(meshData);
      meshData && dc.free(meshData.bufferAddress);

      if (meshData2) {
        const spec = {
          result: meshData2,
          transfers: [meshData2.arrayBuffer],
        };
        return spec;
      } else {
        return null;
      }
    }
    case 'getChunkHeightfield': {
      const {x, z, lod} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('getChunkHeightfield : instance not found');
      
      const heightfield = await dc.getChunkHeightfieldAsync(instance, taskId, x, z, lod);
      const spec = {
        result: heightfield,
        transfers: [heightfield.buffer],
      };
      return spec;
    }
    /* case 'getHeightfieldRange': {
      const { instance: instanceKey, x, z, w, h, lod } = args;
      const instance = instances.get(instanceKey);
      if (!instance)
        throw new Error('getHeightfieldRange : instance not found');
      const heights = dc.getHeightfieldRange(instance, x, z, w, h, lod);

      const spec = {
        result: heights,
        transfers: [heights.buffer],
      };
      return spec;
    }
    case 'getSkylightFieldRange': {
      const { instance: instanceKey, x, y, z, w, h, d, lod } = args;
      const instance = instances.get(instanceKey);
      if (!instance)
        throw new Error('getSkylightFieldRange : instance not found');
      const skylights = dc.getSkylightFieldRange(
        instance,
        x,
        y,
        z,
        w,
        h,
        d,
        lod
      );

      const spec = {
        result: skylights,
        transfers: [skylights.buffer],
      };
      return spec;
    }
    case 'getAoFieldRange': {
      const { instance: instanceKey, x, y, z, w, h, d, lod } = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('getAoFieldRange : instance not found');
      const aos = dc.getAoFieldRange(instance, x, y, z, w, h, d, lod);

      const spec = {
        result: aos,
        transfers: [aos.buffer],
      };
      return spec;
    } */
    case 'createGrassSplat': {
      const {x, z, lod} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('createGrassSplat : instance not found');
      
      const {
        ps,
        qs,
        instances: instancesResult,
      } = await dc.createGrassSplatAsync(instance, taskId, x, z, lod);

      const spec = {
        result: {
          ps,
          qs,
          instances: instancesResult,
        },
        transfers: [ps.buffer, qs.buffer, instancesResult.buffer],
      };
      return spec;
    }
    case 'createVegetationSplat': {
      const {x, z, lod} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('createVegetationSplat : instance not found');
      
      const {
        ps,
        qs,
        instances: instancesResult,
      } = await dc.createVegetationSplatAsync(instance, taskId, x, z, lod);

      const spec = {
        result: {
          ps,
          qs,
          instances: instancesResult,
        },
        transfers: [ps.buffer, qs.buffer, instancesResult.buffer],
      };
      return spec;
    }
    case 'createMobSplat': {
      const {x, z, lod} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('createMobSplat : instance not found');
      
      const {
        ps,
        qs,
        instances: instancesResult,
      } = await dc.createMobSplatAsync(instance, taskId, x, z, lod);

      const spec = {
        result: {
          ps,
          qs,
          instances: instancesResult,
        },
        transfers: [ps.buffer, qs.buffer, instancesResult.buffer],
      };
      return spec;
    }
    case 'drawCubeDamage': {
      const {position, quaternion, scale} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('drawCubeDamage : instance not found');

      // console.log('dc worker draw cube damage', {position, quaternion, scale});
      const chunks = dc.drawCubeDamage(
        instance,
        position[0],
        position[1],
        position[2],
        quaternion[0],
        quaternion[1],
        quaternion[2],
        quaternion[3],
        scale[0],
        scale[1],
        scale[2]
      );
      // console.log('draw cube damage chunks', chunks);

      if (chunks) {
        return {
          result: _chunksToResult(chunks),
          transfers: [],
        };
      } else {
        return null;
      }
    }
    case 'eraseCubeDamage': {
      const {position, quaternion, scale} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('eraseCubeDamage : instance not found');

      const chunks = dc.drawCubeDamage(
        instance,
        position[0],
        position[1],
        position[2],
        quaternion[0],
        quaternion[1],
        quaternion[2],
        quaternion[3],
        scale[0],
        scale[1],
        scale[2]
      );

      if (chunks) {
        return {
          result: _chunksToResult(chunks),
          transfers: [],
        };
      } else {
        return null;
      }
    }
    case 'drawSphereDamage': {
      const {position, radius} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('drawSphereDamage : instance not found');

      const chunks = dc.drawSphereDamage(
        instance,
        position[0],
        position[1],
        position[2],
        radius
      );

      if (chunks) {
        return {
          result: _chunksToResult(chunks),
          transfers: [],
        };
      } else {
        return null;
      }
    }
    case 'eraseSphereDamage': {
      const {position, radius} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('eraseSphereDamage : instance not found');
      const chunks = dc.eraseSphereDamage(
        instance,
        position[0],
        position[1],
        position[2],
        radius
      );

      if (chunks) {
        return {
          result: _chunksToResult(chunks),
          transfers: [],
        };
      } else {
        return null;
      }
    }
    case 'cancelTask': {
      const {taskId} = args;
      const instance = instances.get(instanceKey);
      if (!instance) throw new Error('cancelTask : instance not found');

      await dc.cancelTask(instance, taskId);
      const spec = {
        result: null,
        transfers: [],
      };
      return spec;
    }
    default: {
      throw new Error(`unknown method: ${method}`);
    }
  }
};
const _handleMessage = async m => {
  const {data, port} = m;
  const {taskId} = data;
  const p = makePromise();
  // try {
    const spec = await _handleMethod(data);
    p.accept(spec);
  // } catch (err) {
  //   p.reject(err);
  // }

  if (taskId) {
    p.then(
      (spec) => {
        const { result = null, transfers = [] } = spec ?? {};
        port.postMessage(
          {
            method: 'response',
            taskId,
            result,
          },
          transfers
        );
      },
      (err) => {
        port.postMessage({
          method: 'response',
          taskId,
          error: err.message,
        });
      }
    );
  }
};
self.onmessage = (e) => {
  const m = {
    data: e.data,
    port: self,
  };
  if (loaded) {
    _handleMessage(m);
  } else {
    queue.push(m);
  }
};

(async () => {
  await dc.waitForLoad();

  loaded = true;
  for (let i = 0; i < queue.length; i++) {
    _handleMessage(queue[i]);
  }
  queue.length = 0;
})();
