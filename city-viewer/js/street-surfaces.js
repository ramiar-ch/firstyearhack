import * as THREE from 'three';

const textures = new THREE.TextureLoader();
const root = new URL('../assets/surfaces/', import.meta.url);
export const surfaces = {};
export const tileMetres = {
  asphalt: 2.1, paving: 3.1, redBrick: 1.4, yellowBrick: 2, stone: 2,
  slate: 3, timber: 1.8, denim: 0.271, ripstop: 0.27, grass: 2, bark: [1.1, 2.2],
};

async function readTexture(file, normal = false) {
  try {
    const texture = await textures.loadAsync(new URL(file, root).href);
    texture.name = file;
    texture.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  } catch {
    return null;
  }
}

export async function loadStreetSurfaces() {
  const names = {asphalt: 'asphalt', paving: 'paving', redBrick: 'red-brick', yellowBrick: 'yellow-brick',
    stone: 'stone', slate: 'slate', timber: 'timber', denim: 'denim', ripstop: 'ripstop', bark: 'bark', grass: 'grass'};
  await Promise.all(Object.entries(names).map(async ([key, file]) => {
    const [color, normal] = await Promise.all([
      readTexture(file + '-color.jpg'),
      ['asphalt', 'paving', 'stone', 'denim'].includes(key) ? readTexture(file + '-normal.jpg', true) : null,
    ]);
    surfaces[key] = {color, normal};
  }));
}

export async function loadStreetReflection(pmrem) {
  const {RGBELoader} = await import('three/addons/loaders/RGBELoader.js');
  const source = await new RGBELoader().loadAsync(new URL('london-street.hdr', root).href);
  try {
    const reflection = pmrem.fromEquirectangular(source);
    reflection.texture.name = 'Urban Street 02 · filtered HDRI';
    return reflection;
  } finally {
    source.dispose();
  }
}
