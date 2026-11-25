const test = require('node:test');
const assert = require('node:assert/strict');

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const snapshot = () => ({
  activity: 'street', mode: 'strand', hours: 15.5, camera: [0,10,20], target: [0,0,0],
  walker: { position: [0,0,0], yaw: 0, pitch: 0 },
  car: { position: [1,0,2], velocity: [0,0,0], heading: 0 }, split: false,
  missions: { money: 25, moneyBy: [15,10], passed: 5, state: 'escape', timeLeft: 90, wait: 0,
    item: 'exam papers', escape: { name: 'phone box', x: 2, z: 3 }, script: [] },
  wanted: { level: 2, farTime: 0, driver: 'p1' }, patrols: [],
});

test('rebinding changes both continuous controls and action keys without retaining the old key', async () => {
  const { defaultBindings, translateKey, normalizeBindings } = await import('../js/keybindings.js');
  const bindings = normalizeBindings({ ...defaultBindings(), KeyW: 'KeyI', KeyE: 'KeyO' });
  assert.equal(translateKey('KeyI', bindings), 'KeyW');
  assert.equal(translateKey('KeyW', bindings), null);
  assert.equal(translateKey('KeyO', bindings), 'KeyE');
  assert.equal(translateKey('KeyE', bindings), null);
  assert.equal(translateKey('ArrowUp', bindings), 'ArrowUp');
  assert.equal(translateKey('Escape', bindings), 'Escape');
});

test('invalid, conflicting or reserved stored bindings fall back to working defaults', async () => {
  const { defaultBindings, normalizeBindings } = await import('../js/keybindings.js');
  for (const invalid of [{KeyW:'KeyS'}, {KeyW:'Escape'}, {KeyW:'F5'}, {KeyW:null,KeyS:17}]) {
    assert.deepEqual(normalizeBindings(invalid), defaultBindings());
  }
});

test('separate mode saves survive serialization with mission progress intact', async () => {
  const { readSave, writeSave } = await import('../js/savegame.js');
  const db = storage();
  const street = writeSave(snapshot(), db);
  const sightseeing = writeSave({ ...snapshot(), activity: 'sightseeing', mode: 'orbit', hours: 21 }, db);
  assert.deepEqual(readSave('street', db), street);
  assert.deepEqual(readSave('sightseeing', db), sightseeing);
  assert.equal(readSave('street', db).missions.money, 25);
  assert.equal(readSave('street', db).missions.state, 'escape');
});

test('new saloon and estate body types survive a save and restore', async () => {
  const { readSave, writeSave } = await import('../js/savegame.js');
  const db = storage();
  const street = snapshot();
  street.car = { ...street.car, kind: 'estate', colour: 0x56695d };
  street.streetParked = [{ ...street.car, kind: 'saloon' }];
  writeSave(street, db);
  assert.equal(readSave('street', db).car.kind, 'estate');
  assert.equal(readSave('street', db).streetParked[0].kind, 'saloon');
});

test('corrupt and incompatible saves are rejected before touching live state', async () => {
  const { readSave, writeSave } = await import('../js/savegame.js');
  const db = storage(), valid = writeSave(snapshot(), db);
  for (const invalid of ['{bad', JSON.stringify({...valid,version:99}), JSON.stringify({...valid,activity:'sightseeing'}),
    JSON.stringify({...valid,car:{...valid.car,position:[null,0,0]}}),
    JSON.stringify({...valid,missions:{...valid.missions,escape:null}}),
    JSON.stringify({...valid,missions:{...valid.missions,script:[null]}})]) {
    db.setItem('kclCitySave:street', invalid);
    assert.equal(readSave('street', db), null);
  }
});

test('storage failures are reported and do not replace the existing save', async () => {
  const { readSave, writeSave } = await import('../js/savegame.js');
  const db = storage(), saved = writeSave(snapshot(), db);
  db.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => writeSave({...snapshot(),hours:20},db), /Quota exceeded/);
  assert.deepEqual(readSave('street',db),saved);
});
