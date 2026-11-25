export const VEHICLE_REACH = 6; // metres from the vehicle body, not its centre

export function closestVehiclePoint(vehicle, point) {
  const fx = Math.sin(vehicle.yaw), fz = Math.cos(vehicle.yaw);
  const dx = point.x - vehicle.x, dz = point.z - vehicle.z;
  const side = Math.max(-vehicle.width / 2, Math.min(vehicle.width / 2, dx * fz - dz * fx));
  const along = Math.max(-vehicle.length / 2, Math.min(vehicle.length / 2, dx * fx + dz * fz));
  return { x: vehicle.x + side * fz + along * fx, z: vehicle.z - side * fx + along * fz };
}

export function nearbyVehicles(vehicles, point, reachable = () => true, range = VEHICLE_REACH) {
  return vehicles.flatMap(vehicle => {
    if (vehicle.unavailable) return [];
    const closest = closestVehiclePoint(vehicle, point);
    const distance = Math.hypot(closest.x - point.x, closest.z - point.z);
    return distance <= range && reachable(closest, vehicle) ? [{ ...vehicle, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)));
}

export function selectedVehicle(list, previousId, step = 0) {
  if (!list.length) return null;
  let index = list.findIndex(vehicle => vehicle.id === previousId);
  if (index < 0) index = 0;
  return list[((index + step) % list.length + list.length) % list.length].id;
}
