// game/playArea.js - the part of London you can drive/walk in.
//
// The viewer shows 2 km of city, but the GAME happens in a smaller circle
// around KCL (the Strand, Aldwych, Kingsway, Waterloo Bridge, Somerset House).
// Smaller area = missions are quicker, judges recognise every street, and
// it runs smoother. The rest of the city is still there as scenery.
// Orbit/Fly modes can still go everywhere.

import * as THREE from 'three';

export const PLAY_RADIUS = 750; // metres from the KCL Strand Building (0, 0)

/** A soft orange line on the ground showing the edge of the play area. */
export function createPlayAreaRing() {
  const geo = new THREE.RingGeometry(PLAY_RADIUS - 1.2, PLAY_RADIUS + 1.2, 360).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff8c1a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 0.25; // just above the roads
  ring.renderOrder = 2;
  return ring;
}
