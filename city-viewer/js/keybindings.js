// Canonical codes keep all keyboard consumers (including P2) on one mapping.
export const ACTIONS = [
  ['KeyW','Forward / accelerate','前进 / 油门'],['KeyS','Back / brake','后退 / 刹车'],
  ['KeyA','Left','向左'],['KeyD','Right','向右'],['Space','Jump / handbrake / fly up','跳跃 / 手刹 / 上升'],
  ['ShiftLeft','Jog / boost','跑步 / 加速'],['ShiftRight','Jog / boost (alternate)','跑步 / 加速（备用）'],
  ['KeyE','Phone box / fly up','电话亭 / 上升'],['KeyQ','Orbit left / fly down','环绕左转 / 下降'],
  ['KeyV','View / next vehicle','切换视角 / 换车'],['KeyC','Driving camera / fly down','驾驶镜头 / 下降'],
  ['ControlLeft','Fly down (alternate)','下降（备用）'],['KeyR','Time travel / reset vehicle','穿越年代 / 车辆复位'],
  ['KeyF','Enter / exit nearby vehicle','上下附近载具'],['KeyG','Previous nearby vehicle','上一个附近载具'],['KeyH','Next nearby vehicle','下一个附近载具'],
  ['KeyJ','Use item (P1)','使用道具（P1）'],['KeyB','Two-player split screen','双人分屏'],
  ['KeyP','Phone controllers','手机控制器'],['KeyK','Incident report','事件报告'],
  ['KeyT','Run / pause time','时间流动 / 暂停'],['KeyU','Hide / show HUD','隐藏 / 显示界面'],
  ['Digit1','Orbit (Sightseeing)','环绕（观光）'],['Digit2','Walk','步行'],
  ['Digit3','Fly (Sightseeing)','飞行（观光）'],['Digit4','Drive (Sightseeing)','驾驶（观光）'],['Digit5','Drive (GTA)','驾驶（GTA）'],
  ['ArrowUp','P2 forward / alternate forward','P2 前进 / 备用前进'],['ArrowDown','P2 brake / alternate back','P2 刹车 / 备用后退'],
  ['ArrowLeft','P2 left / alternate left','P2 左转 / 备用左转'],['ArrowRight','P2 right / alternate right','P2 右转 / 备用右转'],
  ['ControlRight','P2 handbrake','P2 手刹'],['Enter','P2 phone box','P2 电话亭'],['Slash','P2 use item','P2 使用道具'],
  ['BracketLeft','Camera closer','镜头拉近'],['BracketRight','Camera farther','镜头拉远'],
  ['Minus','Camera closer (alternate)','镜头拉近（备用）'],['Equal','Camera farther (alternate)','镜头拉远（备用）'],
];
export const defaultBindings = () => Object.fromEntries(ACTIONS.map(([code]) => [code, code]));
export const allowedKey = code => /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Space|Enter|Slash|BracketLeft|BracketRight|Minus|Equal|Backquote|Backslash|Semicolon|Quote|Comma|Period)$/.test(code);
export function normalizeBindings(value) {
  const defaults = defaultBindings();
  if (!value || typeof value !== 'object') return defaults;
  const result = Object.fromEntries(Object.keys(defaults).filter(code => value[code] != null).map(code => [code, value[code]]));
  if (Object.values(result).some(code => !allowedKey(code)) || new Set(Object.values(result)).size !== Object.keys(result).length) return defaults;
  // Prefer each action's default; preserve existing custom bindings when adding actions.
  const missing = Object.keys(defaults).filter(code => !Object.hasOwn(result, code));
  for (const code of missing) {
    if (!Object.values(result).includes(code)) result[code] = code;
    else if (['KeyJ','KeyB','KeyU'].includes(code)) {
      result[code] = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', c => 'Key' + c).find(key => !Object.values(result).includes(key) && !missing.includes(key));
      if (!result[code]) return defaults;
    } else return defaults;
  }
  return result;
}
export function translateKey(physical, bindings) {
  const match = Object.keys(bindings).find(code => bindings[code] === physical);
  return match ?? (Object.hasOwn(bindings, physical) ? null : physical);
}
export function keyLabel(code) {
  return ({Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',BracketLeft:'[',BracketRight:']',Minus:'−',Equal:'=',Slash:'/',Backquote:'`',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Escape:'Esc'})[code] ?? code.replace(/^Key|^Digit/, '').replace('Arrow', '↑↓←→'[['Up','Down','Left','Right'].indexOf(code.slice(5))] || 'Arrow');
}
