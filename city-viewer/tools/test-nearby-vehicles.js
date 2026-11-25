const test = require('node:test');
const assert = require('node:assert/strict');

test('boarding reach is measured from the body, including long and rotated vehicles', async () => {
  const { nearbyVehicles } = await import('../game/nearbyVehicles.js');
  const bus = {id:'bus',x:0,z:0,yaw:0,width:3.2,length:11.4};
  assert.equal(nearbyVehicles([bus],{x:0,z:11.5}).length,1);
  assert.equal(nearbyVehicles([bus],{x:0,z:11.8}).length,0);
  assert.equal(nearbyVehicles([{...bus,yaw:Math.PI/2}],{x:11.5,z:0}).length,1);
  assert.equal(nearbyVehicles([{...bus,yaw:Math.PI/2}],{x:0,z:8}).length,0);
});

test('unavailable vehicles and vehicles behind walls cannot be selected', async () => {
  const { nearbyVehicles } = await import('../game/nearbyVehicles.js');
  const body={x:2,z:0,yaw:0,width:2,length:4};
  const nearby=nearbyVehicles([{...body,id:'hidden',unavailable:true},{...body,id:'wall'},{...body,id:'clear'}],{x:0,z:0},(_point,v)=>v.id!=='wall');
  assert.deepEqual(nearby.map(v=>v.id),['clear']);
});

test('selection remains attached to a vehicle when distances change and cycles in both directions', async () => {
  const { selectedVehicle } = await import('../game/nearbyVehicles.js');
  const list=[{id:'a'},{id:'b'},{id:'c'}];
  assert.equal(selectedVehicle(list,'b'), 'b');
  assert.equal(selectedVehicle([...list].reverse(),'b'), 'b');
  assert.equal(selectedVehicle(list,'a',-1),'c');
  assert.equal(selectedVehicle(list,'c',1),'a');
  assert.equal(selectedVehicle([{id:'c'}],'b'),'c');
  assert.equal(selectedVehicle([],'b'),null);
});

test('adding the new shortcuts preserves existing user bindings', async () => {
  const { defaultBindings, normalizeBindings } = await import('../js/keybindings.js');
  const old=defaultBindings();delete old.KeyJ;delete old.KeyB;delete old.KeyU;
  old.KeyW='KeyJ';
  const upgraded=normalizeBindings(old);
  assert.equal(upgraded.KeyW,'KeyJ');
  assert.notEqual(upgraded.KeyJ,'KeyJ');
  assert.equal(new Set(Object.values(upgraded)).size,Object.keys(upgraded).length);
  assert.equal(upgraded.KeyF,'KeyF');assert.equal(upgraded.KeyG,'KeyG');assert.equal(upgraded.KeyH,'KeyH');
});
