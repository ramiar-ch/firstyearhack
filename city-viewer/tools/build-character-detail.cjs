// Convert the pinned CC0 source exports into only the visible, game-sized parts.
const fs = require('node:fs');
const path = require('node:path');
const [sourceDir, destination] = process.argv.slice(2);
if (!sourceDir || !destination) throw new Error('Usage: node build-character-detail.cjs SOURCE_DIR OUTPUT.glb');

const add = (a,b) => a.map((x,i)=>x+b[i]);
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const scale = (a,k) => a.map(x=>x*k);
const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross = ([x,y,z],[a,b,c]) => [y*c-z*b,z*a-x*c,x*b-y*a];
const unit = a => scale(a,1/(Math.hypot(...a)||1));

function source(name) {
  const contents = fs.readFileSync(path.join(sourceDir,name+'.glb'));
  const jsonEnd=20+contents.readUInt32LE(12);
  return {json:JSON.parse(contents.toString('utf8',20,jsonEnd)),bytes:contents.subarray(jsonEnd+8)};
}

const formats = {5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],
  5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
const lanes = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(file,index) {
  const a=file.json.accessors[index], view=file.json.bufferViews[a.bufferView];
  const [size,get,divisor]=formats[a.componentType], width=lanes[a.type];
  const bytes=new DataView(file.bytes.buffer,file.bytes.byteOffset,file.bytes.byteLength);
  const array=new Float32Array(a.count*width);
  const read=(i,offset)=>{
    for(let j=0;j<width;j++){
      const n=bytes[get](offset+j*size,true);
      array[i*width+j]=a.normalized?Math.max(-1,n/divisor):n;
    }
  };
  if(view){
    const offset=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||size*width;
    for(let i=0;i<a.count;i++)read(i,offset+i*stride);
  }
  if(a.sparse){
    const {indices,values,count}=a.sparse;
    const [indexSize,indexRead]=formats[indices.componentType];
    const start=part=>(file.json.bufferViews[part.bufferView].byteOffset||0)+(part.byteOffset||0);
    for(let i=0;i<count;i++)read(bytes[indexRead](start(indices)+i*indexSize,true),start(values)+i*size*width);
  }
  return array;
}

const body=source('base_body');
const short=source('hair_short02'),bob=source('hair_bob01');
const jacket=source('clothing_jacket'),jeans=source('clothing_jeans'),shoes=source('clothing_shoes');
const shirt=source('clothing_shirt'),tshirt=source('clothing_tshirt');
const names=body.json.skins[0].joints.map(i=>body.json.nodes[i].name);
const inverse=accessor(body,body.json.skins[0].inverseBindMatrices);
const jointPositions=new Map(names.map((name,i)=>{
  const m=inverse.subarray(i*16,i*16+16);
  return [name,[0,4,8].map(row=>-dot([...m.subarray(row,row+3)],[...m.subarray(12,15)]))];
}));
const bone = name => jointPositions.get(name);
// These are the neutral joints in protagonist.js, in the same order as the game palette.
const joints=[[0,.919,0],[0,.954,0]];
for(const sign of [-1,1])joints.push([sign*.184,1.400,0],[sign*.203,1.130,0],
  [sign*.088,.919,0],[sign*.088,.476,0],[sign*.088,.055,0]);

function align(a,b) {
  const axis=cross(a,b),cos=dot(a,b);
  return vector=>{
    const v=cross(axis,vector);
    return add(add(vector,v),scale(cross(axis,v),1/(1+cos)));
  };
}
function segment(from,to,start,end) {
  const sourceDirection=sub(bone(to),bone(from)),targetDirection=sub(end,start);
  const axis=unit(sourceDirection),rotate=align(axis,unit(targetDirection));
  const ratio=Math.hypot(...targetDirection)/Math.hypot(...sourceDirection);
  return {
    point(point){
      const relative=sub(point,bone(from));
      return add(start,rotate(add(relative,scale(axis,dot(axis,relative)*(ratio-1)))));
    },
    normal:rotate,
  };
}
const torsoY=(1.400-.919)/(bone('upperarm_l')[1]-bone('pelvis')[1]);
const torso={point:([x,y,z])=>[x*1.03,.919+(y-bone('pelvis')[1])*torsoY,z-.018],normal:n=>n};
const clips={};
const remap=names.map(name=>{
  if(!/_(l|r)$/.test(name))return {index:/Root|pelvis/.test(name)?0:1,transform:torso};
  const side=name.endsWith('_l')?'l':'r', sign=side==='l'?1:-1, start=side==='l'?7:2;
  const id=role=>role+'_'+side;
  if(!clips[side]){
    const shoulder=joints[start],elbow=joints[start+1],hip=joints[start+2],knee=joints[start+3],foot=joints[start+4];
    const wrist=add(elbow,[0,-.242,0]);
    clips[side]={
      upper:segment(id('upperarm'),id('lowerarm'),shoulder,elbow),
      lower:segment(id('lowerarm'),id('hand'),elbow,wrist),
      thigh:segment(id('thigh'),id('calf'),hip,knee),
      calf:segment(id('calf'),id('foot'),knee,foot),
      foot:{point:([x,y,z])=>[x-bone(id('foot'))[0]+foot[0],-.026+(y+.002)*.84,z-.032],normal:n=>n},
      elbow,footOrigin:foot,sign,
    };
  }
  const c=clips[side];
  if(name.startsWith('clavicle'))return {index:1,transform:torso};
  if(name.startsWith('upperarm'))return {index:start,transform:c.upper};
  if(name.startsWith('thigh'))return {index:start+2,transform:c.thigh};
  if(name.startsWith('calf'))return {index:start+3,transform:c.calf};
  if(/^(foot|ball)/.test(name))return {index:start+4,transform:c.foot};
  return {index:start+1,transform:c.lower};
});

const json={asset:{version:'2.0',generator:'Strand detail asset build'},scenes:[{nodes:[]}],scene:0,nodes:[],meshes:[],
  materials:[],textures:[],images:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]};
const chunks=[];
function bytes(buffer,target) {
  const byteOffset=json.buffers[0].byteLength;
  const view={buffer:0,byteOffset,byteLength:buffer.length};
  if(target)view.target=target;
  const pad=(4-buffer.length%4)%4;
  json.buffers[0].byteLength+=buffer.length+pad;
  chunks.push(buffer,Buffer.alloc(pad));
  return json.bufferViews.push(view)-1;
}
function writeAccessor(values,width,kind,target) {
  const arr=kind===5123?Uint16Array.from(values):Float32Array.from(values);
  const item={bufferView:bytes(Buffer.from(arr.buffer),target),componentType:kind,count:arr.length/width,
    type:Object.keys(lanes).find(k=>lanes[k]===width)};
  if(width===3&&target===34962){
    item.min=[Infinity,Infinity,Infinity];item.max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<arr.length;i++){const j=i%3;item.min[j]=Math.min(item.min[j],arr[i]);item.max[j]=Math.max(item.max[j],arr[i]);}
  }
  return json.accessors.push(item)-1;
}
const copied=new Map();
function mapTexture(file,number) {
  const image=file.json.images[file.json.textures[number].source];
  if(copied.has(image.name))return copied.get(image.name);
  const view=file.json.bufferViews[image.bufferView],offset=view.byteOffset||0;
  const bufferView=bytes(file.bytes.subarray(offset,offset+view.byteLength));
  const source=json.images.push({bufferView,mimeType:image.mimeType,name:image.name})-1;
  const texture=json.textures.push({source})-1;
  copied.set(image.name,texture);
  return texture;
}
function material(file,index) {
  const source=file.json.materials[index];
  const known=json.materials.findIndex(m=>m.name===source.name);
  if(known>=0)return known;
  const mat=JSON.parse(JSON.stringify(source));
  for(const tex of [mat.pbrMetallicRoughness.baseColorTexture,mat.normalTexture]){
    if(tex)tex.index=mapTexture(file,tex.index);
  }
  return json.materials.push(mat)-1;
}
function addPart(name,file,mesh,primitive,morphs,include,project,skinned=false) {
  const src=mesh.primitives[primitive],at=src.attributes;
  const p=accessor(file,at.POSITION),n=accessor(file,at.NORMAL),uv=accessor(file,at.TEXCOORD_0);
  const weights=skinned?accessor(file,at.WEIGHTS_0):null,palette=skinned?accessor(file,at.JOINTS_0):null;
  const positions=[], normals=[],texcoords=[],indices=[],outPalette=[],outWeights=[],closed=[];
  const morph=Object.entries(morphs).map(([key,value])=>[delta(key),value]);
  const blink= name.startsWith('face-')||name.startsWith('lashes-') ? [delta('blink_left'),delta('blink_right')] : [];
  const visited=new Map();
  function delta(key){
    const i=mesh.extras.targetNames.indexOf(key);
    return accessor(file,src.targets[i].POSITION);
  }
  function vertex(index) {
    if(visited.has(index))return visited.get(index);
    const i=index*3,v=[...p.subarray(i,i+3)],normal=[...n.subarray(i,i+3)];
    for(const [movement,strength] of morph)for(let j=0;j<3;j++)v[j]+=movement[i+j]*strength;
    const result=project(v,normal,index,weights,palette);
    if(blink.length){
      const posed=v.map((x,j)=>x+blink[0][i+j]+blink[1][i+j]);
      closed.push(...sub(project(posed,normal,index).point,result.point));
    }
    const id=positions.length/3;
    visited.set(index,id);
    positions.push(...result.point);normals.push(...unit(result.normal));texcoords.push(uv[index*2],uv[index*2+1]);
    if(skinned){outPalette.push(...result.joints);outWeights.push(...result.weights);}
    return id;
  }
  const tris=accessor(file,src.indices);
  for(let i=0;i<tris.length;i+=3){
    const ids=[tris[i],tris[i+1],tris[i+2]];
    if(!include||ids.every(id=>include(p.subarray(id*3,id*3+3))))indices.push(...ids.map(vertex));
  }
  if(!indices.length)throw new Error('Empty geometry '+name);
  const attributes={POSITION:writeAccessor(positions,3,5126,34962),NORMAL:writeAccessor(normals,3,5126,34962),
    TEXCOORD_0:writeAccessor(texcoords,2,5126,34962)};
  if(skinned){
    attributes.JOINTS_0=writeAccessor(outPalette,4,5123,34962);
    attributes.WEIGHTS_0=writeAccessor(outWeights,4,5126,34962);
  }
  const part={attributes,indices:writeAccessor(indices,1,5123,34963),material:material(file,src.material)};
  if(closed.length)part.targets=[{POSITION:writeAccessor(closed,3,5126,34962)}];
  const item={name,primitives:[part]};
  if(closed.length){item.weights=[0];item.extras={targetNames:['blink']};}
  const meshId=json.meshes.push(item)-1;
  json.scenes[0].nodes.push(json.nodes.push({name,mesh:meshId})-1);
}

const profiles={
  man:{gender_male:.72,face_jaw_width_incr:.24}, woman:{gender_female:.86,face_cheekbones_incr:.20},
  older:{gender_male:.64,age_old:.8,face_eye_size_decr:.16}, olderWoman:{gender_female:.76,age_old:.80,face_cheekbones_incr:.24},
  child:{age_child:.82,face_eye_size_incr:.20}, teen:{gender_male:.45,age_child:.30,face_chin_decr:.23},
  worker:{gender_male:.81,face_nose_width_incr:.27,face_mouth_width_incr:.18},
};
const head = v=>v[1]>=1.395;
for(const [style,morph] of Object.entries(profiles)){
  const base=body.json.meshes[0],raw=accessor(body,base.primitives[0].attributes.POSITION);
  const deltas=Object.entries(morph).map(([key,strength])=>[
    accessor(body,base.primitives[0].targets[base.extras.targetNames.indexOf(key)].POSITION),strength]);
  let low=Infinity,high=-Infinity,back=Infinity,front=-Infinity;
  for(let i=0;i<raw.length;i+=3)if(head(raw.subarray(i,i+3))){
    const y=deltas.reduce((v,[d,k])=>v+d[i+1]*k,raw[i+1]);
    const z=deltas.reduce((v,[d,k])=>v+d[i+2]*k,raw[i+2]);
    low=Math.min(low,y);high=Math.max(high,y);back=Math.min(back,z);front=Math.max(front,z);
  }
  const fit=(style==='child'?.292:style==='teen'?.265:.253)/(high-low),center=(back+front)/2;
  const project=([x,y,z],normal)=>({point:[x*fit,-.065+(y-low)*fit,(z-center)*fit+.007],normal});
  // Continue the textured neck below the collar, without bringing the torso into view.
  addPart('face-'+style,body,base,0,morph,v=>head(v)||(v[1]>=1.343&&Math.abs(v[0])<.115),project);
  for(const [prefix,mi,pi] of [['brows',1,0],['lashes',2,0],['eyes',3,0],['iris',3,1]]){
    addPart(prefix+'-'+style,body,body.json.meshes[mi],pi,morph,null,project);
  }
  const hair=style==='woman'||style==='olderWoman'?bob:short;
  addPart('hair-'+style,hair,hair.json.meshes[0],0,morph,null,project);
}

function retarget(v,n,i,weights,palette) {
  let point=[0,0,0],normal=[0,0,0];
  const joints=[], coefficients=[];
  for(let j=0;j<4;j++){
    const bone=remap[palette[i*4+j]],w=weights[i*4+j];
    point=add(point,scale(bone.transform.point(v),w));
    normal=add(normal,scale(bone.transform.normal(n),w));
    joints.push(bone.index);
    coefficients.push(w);
  }
  return {point,normal,joints,weights:coefficients};
}
addPart('jacket',jacket,jacket.json.meshes[0],0,{},null,retarget,true);
addPart('jeans',jeans,jeans.json.meshes[0],0,{},null,retarget,true);
addPart('shirt',shirt,shirt.json.meshes[0],0,{},null,retarget,true);
addPart('tshirt',tshirt,tshirt.json.meshes[0],0,{},null,retarget,true);
addPart('arms',body,body.json.meshes[0],0,{},p=>Math.abs(p[0])>.18&&p[1]>.87,retarget,true);
for(const side of ['l','r']){
  const c=clips[side];
  const wrist=bone('hand_'+side),direction=unit(sub(wrist,bone('lowerarm_'+side)));
  const handGeometry=p=>c.sign*p[0]>.30&&dot(sub(p,wrist),direction)>-.031;
  function handPoint(p,n,grip=false){
    const [x,y,z]=sub(c.lower.point(p),c.elbow);
    const point=[x*.83,-.242+(y+.242)*.89,z*.83];
    const normal=c.lower.normal(n);
    const finger=grip?Math.max(0,-point[1]-.285):0;
    if(finger>0){
      const a=Math.min(2.6,finger/.035);
      point[1]=-.285-Math.sin(a)*.035;
      point[2]+=(1-Math.cos(a))*.035;
      return {point,normal:[normal[0],normal[1]*Math.cos(a)+normal[2]*Math.sin(a),-normal[1]*Math.sin(a)+normal[2]*Math.cos(a)]};
    }
    return {point,normal};
  }
  addPart('hand-'+side,body,body.json.meshes[0],0,{},handGeometry,(p,n)=>handPoint(p,n));
  addPart('grip-'+side,body,body.json.meshes[0],0,{},handGeometry,(p,n)=>handPoint(p,n,true));
  addPart('shoe-'+side,shoes,shoes.json.meshes[0],0,{},p=>c.sign*p[0]>0,
    (p,n)=>({point:sub(c.foot.point(p),c.footOrigin),normal:n}));
}
const description=Buffer.from(JSON.stringify(json));
const jsonPadding=Buffer.alloc((4-description.length%4)%4,32);
const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),dataHeader=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);
jsonHeader.writeUInt32LE(description.length+jsonPadding.length,0);jsonHeader.write('JSON',4);
dataHeader.writeUInt32LE(json.buffers[0].byteLength,0);dataHeader.write('BIN\0',4);
header.writeUInt32LE(28+description.length+jsonPadding.length+json.buffers[0].byteLength,8);
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,Buffer.concat([header,jsonHeader,description,jsonPadding,dataHeader,...chunks]));
console.log('Wrote',json.meshes.length,'parts and',json.images.length,'texture maps');
