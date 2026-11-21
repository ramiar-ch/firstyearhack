const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../city-traffic.js'), 'utf8');
const {footprint, vehicleOverlap, circleOverlap, wallOverlap, createSpace, sweep} = vm.runInNewContext(`${source}\nCityTraffic`);
const car = ({x, z, yaw}) => footprint(x, z, yaw, 2.25, 4.55);
const bus = ({x, z, yaw}) => footprint(x, z, yaw, 3.21, 11.4);
const bike = ({x, z, yaw}) => footprint(x, z, yaw, 0.88, 2.04);

test('a fast car stops in front of a bicycle instead of crossing it', () => {
  const space = createSpace();
  const cyclist = {};
  space.place(cyclist, bike({x: 0, z: 7, yaw: 0}));
  const result = sweep({x: 0, z: 0, yaw: 0}, 0, 16, 0, 3, p => space.hit(car(p)));
  assert.equal(result.hit, cyclist);
  assert.ok(result.pose.z > 3.69 && result.pose.z <= 3.705);
  assert.equal(space.hit(car(result.pose)), undefined);
});

test('crossing traffic cannot overlap a vehicle already in the intersection', () => {
  const space = createSpace();
  const approachingCar = {}, crossingBus = {};
  const start = {x: 0, z: 0, yaw: 0}, crossing = {x: -8, z: 5, yaw: Math.PI / 2};
  space.place(approachingCar, car(start));
  space.place(crossingBus, bus(crossing));
  const first = sweep(start, 0, 8, 0, 3, p => space.hit(car(p), approachingCar));
  space.place(approachingCar, car(first.pose));
  const second = sweep(crossing, 18, 0, 0, 6, p => space.hit(bus(p), crossingBus));
  assert.equal(second.hit, approachingCar);
  assert.equal(vehicleOverlap(car(first.pose), bus(second.pose)), false);
});

test('a long bus cannot turn its front corner through a wall', () => {
  const start = {x: 0, z: 0, yaw: 0};
  const wall = box => wallOverlap(box, 2.1, -10, 2.1, 10);
  const result = sweep(start, 0, 0, Math.PI / 2, 6, p => wall(bus(p)));
  assert.ok(result.hit);
  assert.ok(result.pose.yaw > 0 && result.pose.yaw < 0.12);
  assert.equal(wall(bus(result.pose)), false);
});

test('a stationary obstacle and a narrow lane can coexist without a false contact', () => {
  const parked = bike({x: 1.8, z: 0, yaw: 0});
  assert.equal(vehicleOverlap(parked, car({x: 0, z: 0, yaw: 0})), false);
  assert.equal(circleOverlap(parked, 2.45, 0, 0.13), false);
  assert.equal(circleOverlap(parked, 1.8, 1.07, 0.13), true);
});

test('moving and removing an actor updates all of its occupied cells', () => {
  const space = createSpace();
  const vehicle = {};
  const at = bike({x: 11.7, z: -12.1, yaw: 0});
  space.place(vehicle, bus({x: 13, z: -12.1, yaw: Math.PI / 2}));
  assert.equal(space.hit(at), vehicle);
  assert.equal(space.hit(at, vehicle), undefined);
  space.place(vehicle, bus({x: 40, z: 40, yaw: 0}));
  assert.equal(space.hit(at), undefined);
  const moved = bike({x: 40, z: 44, yaw: 0});
  assert.equal(space.hit(moved), vehicle);
  space.remove(vehicle);
  assert.equal(space.hit(moved), undefined);
});
