// relay.js - passes messages between the phone controller and the game.
//
// No extra packages: uses plain HTTP.
//   Phone  --POST /api/input-->  server  --live stream-->  game   (driving)
//   Game   --POST /api/haptic--> server  --live stream-->  phone  (vibrate)
// The "live stream" is Server-Sent Events: the page opens /api/events and
// the server keeps the connection open, writing a line whenever there's news.
// GET /api/info tells the game this laptop's Wi-Fi address (for the QR code).

const os = require('os');
const { writePoliceReport, dispatchRoute } = require('./snowflake.js');

const rooms = new Map();
const validId = id => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);
const validPlayer = player => player === 1 || player === 2;

function event(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
function presence(room) {
  event(room.game, 'phones', { slots: [...room.phones.keys()].sort() });
}
function sendPhones(room, player, type, data) {
  for (const [slot, phone] of room.phones) {
    if (player == null || player === slot) event(phone.res, type, data);
  }
}

// Keep the streams alive (some networks close quiet connections).
setInterval(() => {
  for (const room of rooms.values()) {
    room.game.write(': ping\n\n');
    for (const {res} of room.phones.values()) res.write(': ping\n\n');
  }
}, 15000).unref();

function readJson(req, done, maxLength = 10000) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > maxLength) req.destroy(); });
  req.on('end', () => { try { done(JSON.parse(body || '{}')); } catch { done(null); } });
}

/** This computer's local network addresses, home/hotspot ones first. */
function lanAddresses() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return ips.sort((a, b) => score(a) - score(b));
}

/** Handles /api/... requests. Returns true if it dealt with the request. */
function handle(req, res, port) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  if (url.pathname === '/api/events') {
    const role = url.searchParams.get('role'), id = url.searchParams.get('room');
    if (!validId(id) || (role !== 'phone' && role !== 'game')) {
      res.writeHead(400).end();
      return true;
    }
    let room = rooms.get(id);
    if (role === 'phone' && !room) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      event(res, 'session-closed', {});
      res.end();
      return true;
    }
    const slot = Number(url.searchParams.get('player')), client = url.searchParams.get('client');
    if (role === 'phone' && (!validPlayer(slot) || !validId(client))) {
      res.writeHead(400).end();
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    if (role === 'game') {
      const previous = room?.game;
      if (!room) { room = { game: res, phones: new Map() }; rooms.set(id, room); }
      room.game = res;
      previous?.end();
      presence(room);
      res.on('close', () => {
        if (room.game !== res) return;
        rooms.delete(id);
        for (const phone of room.phones.values()) {
          event(phone.res, 'session-closed', {});
          phone.res.end();
        }
      });
    } else {
      const previous = room.phones.get(slot);
      if (previous && previous.client !== client) {
        event(res, 'slot-busy', { player: slot });
        res.end();
        return true;
      }
      room.phones.set(slot, { client, res });
      previous?.res.end();
      event(res, 'paired', { player: slot });
      presence(room);
      res.on('close', () => {
        if (rooms.get(id) !== room || room.phones.get(slot)?.res !== res) return;
        room.phones.delete(slot);
        presence(room);
      });
    }
    return true;
  }
  if (req.method === 'POST' && ['/api/input', '/api/scan', '/api/haptic', '/api/phone-message'].includes(url.pathname)) {
    const type = url.pathname.slice(5);
    readJson(req, data => {
      const room = data && rooms.get(data.room);
      if (!room) { res.writeHead(404).end(); return; }
      const {player} = data;
      if (type === 'input' || type === 'scan') {
        if (!validPlayer(player) || room.phones.get(player)?.client !== data.client) {
          res.writeHead(409).end();
          return;
        }
        if (type === 'scan') {
          if (typeof data.image !== 'string' || !data.image.startsWith('data:image/')) { res.writeHead(400).end(); return; }
          event(room.game, 'scan', { player, image: data.image, cut: !!data.cut });
        } else {
          const clip = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
          event(room.game, 'input', { player, throttle: clip(data.throttle, 0, 1), brake: clip(data.brake, 0, 1),
            steer: clip(data.steer, -1, 1), handbrake: !!data.handbrake, action: data.action, throw: data.throw });
        }
      } else if (player == null || validPlayer(player)) {
        if (type === 'haptic' && Array.isArray(data.pattern)) sendPhones(room, player, 'haptic', { pattern: data.pattern });
        if (type === 'phone-message' && typeof data.text === 'string') sendPhones(room, player, 'message', { text: data.text.slice(0, 200), pager: !!data.pager });
      }
      res.writeHead(204).end();
    }, type === 'scan' ? 3_000_000 : 10000);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/dispatch') {
    // Mission guidance: Snowflake works out distance + direction, the phone shows it.
    readJson(req, async (d) => {
      let route = null;
      try { if (d && d.from && d.to) route = await dispatchRoute(d.from, d.to); } catch (e) { console.log('Snowflake dispatch:', e.message); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ route }));
    });
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/report') {
    // Game finished: ask Snowflake Cortex for the police report (null = use the backup).
    readJson(req, async (stats) => {
      let result = null, error = null;
      try { result = await writePoliceReport(stats || {}); } catch (e) { error = e.message; console.log('Snowflake:', error); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: result && result.text, log: result && result.log, error }));
    });
    return true;
  }
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ port, ips: lanAddresses() }));
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}

module.exports = { handle };
