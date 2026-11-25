import * as THREE from 'three';

const parts = new Map();
const headParts = ['face','brows','lashes','eyes','iris','hair'];
const styles = ['man','woman','older','olderWoman','child','teen','worker'];
let loading;

export function loadCharacterDetail() {
  loading ??= (async()=>{
    try {
      const {GLTFLoader} = await import('three/addons/loaders/GLTFLoader.js');
      const {scene} = await new GLTFLoader().loadAsync(new URL('../assets/characters/close-characters.glb',import.meta.url).href);
      scene.traverse(object=>{if(object.isMesh)parts.set(object.name,object);});
      const required=['jacket','shirt','tshirt','arms','jeans','hand-l','hand-r','grip-l','grip-r','shoe-l','shoe-r',
        ...styles.flatMap(style=>headParts.map(part=>part+'-'+style))];
      if(!required.every(name=>parts.has(name)))throw new Error('Incomplete close character kit');
      return true;
    } catch (error) {
      parts.clear();
      console.warn('Close character art unavailable',error);
      return false;
    }
  })();
  return loading;
}

export const hasCharacterDetail=()=>parts.size>0;

export function attachCharacterDetail({root,pelvis,chest,head,arms,legs},avatar,colour) {
  const style=styles.includes(avatar.style)?avatar.style:'man';
  const older=style==='older'||style==='olderWoman';
  const upper=style==='teen'?'tshirt':style==='woman'||style==='olderWoman'?'shirt':'jacket';
  const materials=new Map(), blinkMeshes=[];
  const ownedGeometry=[],hands=[];
  let faceTime=0;
  function materialFor(part) {
    const original=part.material;
    if(!materials.has(original.name)){
      const material=original.clone();
      for(const map of [material.map,material.normalMap])if(map)map.anisotropy=8;
      materials.set(original.name,material);
    }
    return materials.get(original.name);
  }
  function rigid(name,parent) {
    const source=parts.get(name);
    const mesh=new THREE.Mesh(source.geometry,materialFor(source));
    mesh.name=name;
    const eye=/^(eyes|iris)-/.test(name);
    mesh.castShadow=!/^(eyes|iris|brows|lashes)-/.test(name);
    mesh.receiveShadow=!eye;
    if(mesh.morphTargetInfluences)blinkMeshes.push(mesh);
    parent.add(mesh);
    return mesh;
  }
  for(const part of headParts)rigid(part+'-'+style,head);
  function accessory(parent,geometry,colour,x,y,z) {
    if(!materials.has(colour))materials.set(colour,new THREE.MeshStandardMaterial({color:colour,roughness:.78}));
    const mesh=new THREE.Mesh(geometry,materials.get(colour));
    mesh.position.set(x,y,z);
    mesh.castShadow=mesh.receiveShadow=true;
    ownedGeometry.push(geometry);
    parent.add(mesh);
    return mesh;
  }
  const collar=[[.137,.442],[.105,.488],[.074,.521],[.070,.544],[.063,.544],[.060,.522]];
  accessory(chest,new THREE.LatheGeometry(collar.map(([r,y])=>new THREE.Vector2(r,y)),32).scale(1,1,.82),
    0x39373c,0,0,.014);
  if(older){
    for(const side of [-1,1])accessory(head,new THREE.TorusGeometry(.019,.0015,6,18),0x585657,side*.031,.088,.091);
    accessory(head,new THREE.BoxGeometry(.024,.0027,.005),0x585657,0,.093,.094);
  }
  if(style==='child'){
    accessory(chest,new THREE.SphereGeometry(1,18,10).scale(.126,.145,.057),0x536479,0,.285,-.137);
    accessory(chest,new THREE.SphereGeometry(1,16,8).scale(.110,.043,.027),0x414e60,0,.215,-.186);
    for(const side of [-1,1]){
      const strap=accessory(chest,new THREE.TorusGeometry(1,.07,8,16).scale(.023,.144,.103).rotateY(Math.PI/2),0x3f4754,side*.102,.34,0);
      strap.rotation.z=side*.09;
    }
  }
  if(style==='worker'){
    const rim=new THREE.CylinderGeometry(.103,.105,.010,24).scale(1,1,1.19);
    accessory(head,rim,0xc4a14c,0,.160,.012);
    accessory(head,new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2).scale(.099,.051,.104),0xd9b055,0,.163,.001);
    for(const side of [-1,1]){
      accessory(chest,new THREE.BoxGeometry(.029,.24,.009),0xd6a93d,side*.109,.342,.139);
      accessory(chest,new THREE.BoxGeometry(.024,.21,.011),0xb7b9b0,side*.109,.347,.145);
    }
  }
  for(let i=0;i<arms.length;i++){
    const side=i?'l':'r';
    if(upper!=='tshirt'){
      const hand=rigid('hand-'+side,arms[i].elbow);
      hands.push({hand,rest:hand.geometry,grip:parts.get('grip-'+side).geometry});
    }
    rigid('shoe-'+side,legs[i].foot);
  }
  // The baked garment weights refer to these same neutral game joints.
  const bones=[pelvis,chest];
  arms.forEach(({shoulder,elbow},i)=>{
    const {hip,knee,foot}=legs[i];
    bones.push(shoulder,elbow,hip,knee,foot);
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const skinParts=upper==='tshirt'?[upper,'jeans','arms']:[upper,'jeans'];
  for(const name of skinParts){
    const source=parts.get(name);
    const mesh=new THREE.SkinnedMesh(source.geometry,materialFor(source));
    mesh.name=name==='arms'?'Textured forearms':'Tailored '+name;
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.frustumCulled=false;
    root.add(mesh);
    mesh.bind(skeleton,new THREE.Matrix4());
  }

  const skin=materials.get('Skin');
  skin.roughness=.55;
  if(skin.normalMap)skin.normalScale.set(.58,.58);
  const tint=new THREE.Color(),reference=new THREE.Color(0xd6a484);
  const cloth=new THREE.Color(),grey=new THREE.Color(0x595b5f);
  const limit=THREE.MathUtils.clamp;
  function setAppearance(data,coat) {
    if(Number.isFinite(data.blinkOffset))faceTime=data.blinkOffset;
    tint.setHex(data.skin);
    skin.color.setRGB(limit(1.19*tint.r/reference.r,.14,1.65),limit(.97*tint.g/reference.g,.14,1.5),
      limit(.80*tint.b/reference.b,.12,1.36));
    const garment=materials.get('Cloth_'+upper);
    garment.color.copy(cloth.setHex(coat).lerp(grey,.19)).multiplyScalar(3.15);
    garment.roughness=.77;
    materials.get('Cloth_jeans').color.setHex(data.trousers).multiplyScalar(2.1);
    materials.get('Cloth_shoes').color.setHex(0x727476);
  }
  for(const part of materials.values()){
    if(/^Hair/.test(part.name)){part.color.setHex(older?0xa3a2a0:0x6e5140);part.roughness=.70;}
    if(older&&/^Eyebrow/.test(part.name))part.color.setHex(0x88837c);
  }
  setAppearance(avatar,colour);
  function blink(dt) {
    faceTime+=dt;
    const t=faceTime%3.85;
    const amount=t>=3.66?Math.sin((t-3.66)/.19*Math.PI):0;
    for(const mesh of blinkMeshes)mesh.morphTargetInfluences[0]=amount;
  }
  function dispose() {
    skeleton.dispose();
    for(const material of materials.values())material.dispose();
    for(const geometry of ownedGeometry)geometry.dispose();
  }
  function grip(active){
    for(const {hand,rest,grip:closed} of hands)hand.geometry=active?closed:rest;
  }
  return {setAppearance,blink,dispose,grip};
}
