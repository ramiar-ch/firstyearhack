const { test } = require('node:test');
const assert = require('node:assert/strict');

test('dragging freely looks around without steering until the forward key is held', async () => {
  const { DriveLook } = await import('../game/driveLook.js');
  const look = new DriveLook();
  look.drag(100, 30);
  assert.ok(look.yaw < 0);
  assert.ok(look.pitch > 0);
  assert.equal(look.steer(1 / 60, false, 0), 0);
  assert.ok(look.steer(1 / 60, true, 0) < 0);
  const target = look.yaw;
  look.followTurn(-0.1);
  assert.ok(Math.abs(look.yaw) < Math.abs(target));
  assert.equal(look.steer(1 / 60, true, 1), 1);
});

test('mouse inactivity centers the view without continuing to steer the car', async () => {
  const { DriveLook, LOOK_IDLE } = await import('../game/driveLook.js');
  const look = new DriveLook();
  look.drag(-120, 50);
  assert.ok(look.steer(LOOK_IDLE / 2, true, 0) > 0);
  assert.equal(look.steer(LOOK_IDLE / 2, true, 0), 0);
  for (let i = 0; i < 100; i++) look.steer(1 / 60, true, 0);
  assert.ok(Math.abs(look.yaw) < 0.01);
  assert.ok(Math.abs(look.pitch) < 0.01);
});
