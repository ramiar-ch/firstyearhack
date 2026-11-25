const PREFIX = 'kclCitySave:';
const VEHICLES = new Set(['cab','car','van','bus','routemaster','bike','saloon','estate']);
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e9;
const vec = value => Array.isArray(value) && value.length === 3 && value.every(finite);
const pose = value => value && vec(value.position) && vec(value.velocity) && finite(value.heading) &&
  (value.kind == null || VEHICLES.has(value.kind)) &&
  (value.colour == null || (Number.isInteger(value.colour) && value.colour >= 0 && value.colour <= 0xffffff)) &&
  (value.sourceId == null || (Number.isInteger(value.sourceId) && value.sourceId > 0));
export function validSave(s) {
  if (!s || s.version !== 1 || !['street','sightseeing'].includes(s.activity)) return false;
  if (!(s.activity === 'street' ? ['strand','walk'] : ['orbit','walk','fly','drive']).includes(s.mode)) return false;
  if (!finite(s.savedAt) && !(Number.isSafeInteger(s.savedAt) && s.savedAt > 0)) return false;
  if (!finite(s.hours) || s.hours < 0 || s.hours >= 24 || !vec(s.camera) || !vec(s.target)) return false;
  if (!s.walker || !vec(s.walker.position) || !finite(s.walker.yaw) || !finite(s.walker.pitch)) return false;
  if (s.activity === 'street') {
    if (!pose(s.car) || (s.car2 && !pose(s.car2)) || (s.split && !s.car2)) return false;
    if (s.streetParked != null && (!Array.isArray(s.streetParked) || s.streetParked.length > 400 || !s.streetParked.every(pose))) return false;
    const m = s.missions;
    if (!m || !['waiting','pickup','escape','dropoff'].includes(m.state)) return false;
    if (!['money','passed','timeLeft','wait'].every(k => finite(m[k]) && m[k] >= 0)) return false;
    if (!Array.isArray(m.moneyBy) || m.moneyBy.length !== 2 || !m.moneyBy.every(n => finite(n) && n >= 0)) return false;
    const place = p => p && typeof p.name === 'string' && finite(p.x) && finite(p.z);
    if ((m.state === 'pickup' || m.state === 'dropoff') && !place(m.pickup)) return false;
    if (m.state === 'dropoff' && !place(m.dropoff)) return false;
    if (m.state === 'escape' && !place(m.escape)) return false;
    if (!Array.isArray(m.script) || m.script.length > 10 || m.script.some(job => !job || typeof job.pickup !== 'string' || typeof job.dropoff !== 'string' || (job.escape && !place(job.escape))) || typeof m.item !== 'string') return false;
    if ([m.plannedDropoff,m.plannedEscape,m.escape].some(p => p != null && !place(p))) return false;
    if (!s.wanted || !Number.isInteger(s.wanted.level) || s.wanted.level < 0 || s.wanted.level > 5 || !finite(s.wanted.farTime)) return false;
    if (!Array.isArray(s.patrols) || s.patrols.length > 3 || s.patrols.some(p => p && !pose(p))) return false;
  }
  if (s.mode === 'drive' && (!s.drive || !VEHICLES.has(s.drive.kind) || !['x','z','yaw','vx','vz'].every(k => finite(s.drive[k])))) return false;
  return true;
}
export function readSave(activity, storage = localStorage) {
  try {
    const raw = storage.getItem(PREFIX + activity);
    if (!raw || raw.length > 1_000_000) return null;
    const save = JSON.parse(raw);
    return validSave(save) && save.activity === activity ? save : null;
  } catch { return null; }
}
export function writeSave(snapshot, storage = localStorage) {
  const save = { ...snapshot, version: 1, savedAt: Date.now() };
  if (!validSave(save)) throw new Error('Invalid game state');
  // Let quota/access failures reach the UI; never report an unsuccessful save.
  storage.setItem(PREFIX + save.activity, JSON.stringify(save));
  return save;
}
