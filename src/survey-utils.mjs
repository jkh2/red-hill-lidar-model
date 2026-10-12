// Pure helpers, inlined into the single-file viewer by scripts/build_viewer.py.
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-7 && x >= Math.min(ax,bx)-1e-7 && x <= Math.max(ax,bx)+1e-7
        && y >= Math.min(ay,by)-1e-7 && y <= Math.max(ay,by)+1e-7) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function associatePileOutlines(piles, rings) {
  // Outlines precede the generator's volume sort; array positions are NOT IDs.
  const candidates = rings.map(ring => piles.filter(p => pointInRing(p.x, p.y, ring)));
  const unique = candidates.map(list => list.length === 1 ? list[0] : null);
  const result = unique.map(p => p && unique.filter(q => q?.id === p.id).length === 1 ? p : null);
  const used = new Set(result.filter(Boolean).map(p => p.id));
  const missing = piles.filter(p => !used.has(p.id));
  const unmatched = result.map((p,i) => p ? -1 : i).filter(i => i >= 0);
  // Handles this payload's one concave pile whose centroid is outside its boundary.
  // Only use elimination when the association is unambiguous.
  if (missing.length === 1 && unmatched.length === 1) result[unmatched[0]] = missing[0];
  return result;
}

export function physicalPoint(point, exaggeration) {
  if (!Number.isFinite(exaggeration) || exaggeration <= 0) throw new RangeError('Invalid exaggeration');
  return {x:point.x, y:point.y, z:point.z / exaggeration};
}

export function surveyDistance(a, b) {
  const horizontal = Math.hypot(b.x-a.x, b.y-a.y), dz = b.z-a.z;
  return {horizontal, dz, spatial:Math.hypot(horizontal,dz)};
}

export function niceScaleBar(pixelsPerMetre, targetPixels=100) {
  if(!Number.isFinite(pixelsPerMetre) || pixelsPerMetre<=0) return null;
  const raw=targetPixels/pixelsPerMetre, power=10**Math.floor(Math.log10(raw));
  const metres=(raw>=5*power?5:raw>=2*power?2:1)*power;
  return {metres,pixels:metres*pixelsPerMetre};
}

export function dampingAlpha(seconds) {
  // Preserve the original 0.07 decay at 60 Hz without a long low-FPS tail.
  const dt=Math.max(1/240,Math.min(.25,Number.isFinite(seconds)?seconds:1/60));
  return 1-Math.pow(.93,dt*60);
}
