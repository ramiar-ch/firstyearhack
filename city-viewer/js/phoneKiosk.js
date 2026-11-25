import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let template;

function createKiosk() {
  const root = new THREE.Group();
  root.name = 'Red telephone kiosk';
  const frame = [], hardware = [], glazing = [], signs = [];
  const box = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  box(frame,1.02,0.13,1.02,0,0.065,0);
  box(frame,0.97,0.13,0.97,0,2.442,0);
  const profile = [[0.69,2.483],[0.65,2.527],[0.53,2.616],[0.32,2.653],[0,2.663]];
  frame.push(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),4,Math.PI/4));
  for (const x of [-0.425,0.425]) for (const z of [-0.425,0.425]) {
    box(frame,0.087,2.39,0.087,x,1.26,z);
  }
  for (let side = 0; side < 4; side++) {
    const pieces = [[],[],[],[]];
    const [rim, metal, glass, headers] = pieces;
    box(rim,0.86,0.48,0.063,0,0.364,0.445);
    box(rim,0.82,0.29,0.062,0,2.21,0.444);
    box(glass,0.81,1.44,0.017,0,1.335,0.443);
    for(const x of [-0.135,0.135])box(rim,0.025,1.46,0.047,x,1.335,0.466);
    for(let i=0;i<7;i++)box(rim,0.84,0.024,0.046,0,0.606+i*0.242,0.465);
    const header = new THREE.PlaneGeometry(0.70,0.151).translate(0,2.225,0.478);
    headers.push(header);
    if(side===0){
      box(metal,0.08,0.16,0.039,0.326,1.068,0.494);
      for(const y of [0.61,2.04])box(metal,0.045,0.089,0.038,-0.412,y,0.484);
    }
    for(const items of pieces)for(const geo of items)geo.rotateY(side*Math.PI/2);
    frame.push(...rim);hardware.push(...metal);glazing.push(...glass);signs.push(...headers);
  }
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e6dcc5';ctx.fillRect(0,0,256,64);
  ctx.fillStyle='#2b2a27';ctx.font='bold 28px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('TELEPHONE',128,34);
  const sign=new THREE.CanvasTexture(canvas);
  sign.colorSpace=THREE.SRGBColorSpace;
  for(const [list,material] of [
    [frame,new THREE.MeshStandardMaterial({color:0xa8232c,roughness:0.51,metalness:0.24})],
    [glazing,new THREE.MeshStandardMaterial({color:0x354147,roughness:0.26,metalness:0.36})],
    [hardware,new THREE.MeshStandardMaterial({color:0x9b8455,roughness:0.44,metalness:0.56})],
    [signs,new THREE.MeshStandardMaterial({map:sign,roughness:0.71})],
  ]){
    const mesh=new THREE.Mesh(mergeGeometries(list),material);
    for(const geo of list)geo.dispose();
    mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  }
  return root;
}

export function telephoneKiosk() {
  template ??= createKiosk();
  return template.clone(true);
}
