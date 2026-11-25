const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const glb = fs.readFileSync(path.join(__dirname,'../assets/characters/close-characters.glb'));
const jsonEnd = 20 + glb.readUInt32LE(12);
const kit = JSON.parse(glb.toString('utf8',20,jsonEnd));
const mesh = name => kit.meshes.find(mesh => mesh.name === name).primitives[0];
const asset = (index,kind) => {
  const accessor = kit.accessors[index];
  const view = kit.bufferViews[accessor.bufferView];
  const start = jsonEnd + 8 + view.byteOffset;
  const size = kind === 'float' ? 4 : 2;
  const values = view.byteLength / size;
  return Array.from({length:values},(_,i)=>kind==='float'?glb.readFloatLE(start+i*size):glb.readUInt16LE(start+i*size));
};

test('each close pedestrian has its own textured face with a blink morph',()=>{
  assert.equal(glb.toString('ascii',0,4),'glTF');
  assert.equal(glb.readUInt32LE(8),glb.length);
  for(const style of ['man','woman','older','olderWoman','child','teen','worker']){
    const face = mesh('face-'+style);
    for(const part of ['brows','lashes','eyes','iris','hair'])assert.ok(mesh(part+'-'+style));
    assert.ok(kit.accessors[face.attributes.POSITION].count>2000);
    assert.ok(kit.accessors[face.attributes.TEXCOORD_0].count>2000);
    const blink=asset(face.targets[0].POSITION,'float');
    assert.ok(blink.some(value=>Math.abs(value)>0.002));
    assert.ok(blink.every(Number.isFinite));
  }
  assert.ok(mesh('hand-l')&&mesh('grip-l')&&mesh('shoe-l'));
});

test('garment skinning uses normalized weights on the twelve game joints',()=>{
  for(const part of ['jacket','shirt','tshirt','arms','jeans']){
    const {attributes}=mesh(part);
    const joints=asset(attributes.JOINTS_0,'word'),weights=asset(attributes.WEIGHTS_0,'float');
    assert.equal(joints.length,weights.length);
    assert.ok(joints.every(index=>index<12));
    assert.ok(weights.every(weight=>weight>=0&&weight<=1));
    for(let i=0;i<weights.length;i+=4)
      assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<0.0001,part);
  }
});
