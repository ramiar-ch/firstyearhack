const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const {handle} = require('../relay.js');

const ROOM = 'a'.repeat(24);
const OTHER_ROOM = 'b'.repeat(24);
const FIRST_PHONE = '1'.repeat(24);
const SECOND_PHONE = '2'.repeat(24);

function request(url, data) {
  const req = Object.assign(new EventEmitter(), {url, method: data ? 'POST' : 'GET'});
  const res = Object.assign(new EventEmitter(), {
    code: 0, body: '', ended: false,
    writeHead(code) { this.code = code; return this; },
    write(part) { this.body += part; },
    end(part = '') { this.write(part); this.ended = true; this.emit('close'); return this; },
    messages(name) {
      return [...this.body.matchAll(new RegExp(`event: ${name}\\ndata: (.+)\\n`, 'g'))].map(match => JSON.parse(match[1]));
    },
  });
  assert.equal(handle(req, res, 8080), true);
  if (data) { req.emit('data', JSON.stringify(data)); req.emit('end'); }
  return res;
}

function game(room) { return request(`/api/events?role=game&room=${room}`); }
function phone(room, player, client) { return request(`/api/events?role=phone&room=${room}&player=${player}&client=${client}`); }

test('two paired phones keep independent driving, action, and scan slots', () => {
  const main = game(ROOM), other = game(OTHER_ROOM);
  const p1 = phone(ROOM, 1, FIRST_PHONE), p2 = phone(ROOM, 2, SECOND_PHONE);
  assert.deepEqual(main.messages('phones').at(-1), {slots:[1,2]});
  assert.equal(request('/api/input', {room:ROOM, player:1, client:FIRST_PHONE, throttle:1, action:1}).code, 204);
  assert.equal(request('/api/input', {room:ROOM, player:2, client:SECOND_PHONE, steer:-1, throw:2}).code, 204);
  assert.deepEqual(main.messages('input').map(input => [input.player,input.throttle,input.steer,input.action,input.throw]),
    [[1,1,0,1,undefined],[2,0,-1,undefined,2]]);
  assert.deepEqual(other.messages('input'), []);
  assert.equal(request('/api/scan', {room:ROOM, player:2, client:SECOND_PHONE, image:'data:image/png;base64,YQ==', cut:true}).code, 204);
  assert.equal(main.messages('scan')[0].player, 2);
  assert.equal(request('/api/input', {room:ROOM, player:2, client:FIRST_PHONE, throttle:1}).code, 409);
  assert.equal(request('/api/haptic', {room:ROOM, player:2, pattern:[70]}).code, 204);
  assert.deepEqual(p2.messages('haptic'), [{pattern:[70]}]);
  assert.deepEqual(p1.messages('haptic'), []);
  assert.equal(request('/api/phone-message', {room:ROOM, text:'1997', pager:true}).code, 204);
  assert.deepEqual(p1.messages('message'), [{text:'1997', pager:true}]);
  assert.deepEqual(p2.messages('message'), [{text:'1997', pager:true}]);
  main.end(); other.end();
});

test('an occupied slot rejects a second device and ending the game disconnects its phones', () => {
  const main = game(ROOM);
  const p1 = phone(ROOM, 1, FIRST_PHONE);
  assert.deepEqual(phone(ROOM, 1, SECOND_PHONE).messages('slot-busy'), [{player:1}]);
  p1.end();
  assert.deepEqual(main.messages('phones').at(-1), {slots:[]});
  const replacement = phone(ROOM, 1, SECOND_PHONE);
  assert.deepEqual(replacement.messages('paired'), [{player:1}]);
  main.end();
  assert.deepEqual(replacement.messages('session-closed'), [{}]);
  assert.equal(replacement.ended, true);
  assert.deepEqual(phone(ROOM, 1, FIRST_PHONE).messages('session-closed'), [{}]);
});
