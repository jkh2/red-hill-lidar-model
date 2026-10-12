"""
Red Hill Lava Products, Inc. — 4000 US Hwy 285, Antonito, CO 81120
3D site model generator.

Sources
  Terrain / structures / stockpiles : USGS 3DEP LiDAR, CO_SanLuisJuanMiguel_2020_D20
                                      (1 m nominal, NAD83(2011) UTM 13N + NAVD88/Geoid18)
  Roads, rail, drainage             : OpenStreetMap (ODbL)
  Site identification only          : Google Places (name, street address, gate coords)

Model coordinate system (right-handed, metres)
  X = UTM 13N easting  - 411048.0
  Y = UTM 13N northing - 4101191.0
  Z = NAVD88 elevation - 2390.0
"""
import numpy as np, json, math, os
from scipy import ndimage
from skimage import measure
from shapely.geometry import Polygon, LineString
from pyproj import Transformer

# ---------------------------------------------------------------- parameters
ORIG_E, ORIG_N, ORIG_Z = 411048.0, 4101191.0, 2390.0
XMIN, XMAX, YMIN, YMAX = -760.0, 520.0, -175.0, 520.0     # model extents, m
TERRAIN_STEP = 2.0            # OBJ terrain sampling, m
STL_STEP     = 2.5            # STL terrain sampling, m
VIEW_STEP    = 4.0            # web viewer sampling, m
OUT = os.environ.get('RED_HILL_OUTPUT_DIR', 'outputs')
os.makedirs(OUT, exist_ok=True)

G = json.load(open('grids_meta.json'))
CX, CY, HALF, N = G['cx'], G['cy'], G['half'], G['n']
dtm    = np.load('dtm.npy').astype(float)      # index [row=north, col=east], origin SW
struct = np.load('struct_h.npy').astype(float)
resid  = np.load('resid.npy').astype(float)

gx0 = CX - HALF - ORIG_E      # model-X of grid column 0
gy0 = CY - HALF - ORIG_N

def crop(a):
    c0 = int(round(XMIN - gx0)); c1 = int(round(XMAX - gx0))
    r0 = int(round(YMIN - gy0)); r1 = int(round(YMAX - gy0))
    return a[r0:r1 + 1, c0:c1 + 1]

dtm, struct, resid = crop(dtm), crop(struct), crop(resid)
NR, NC = dtm.shape
print(f'model grid {NC} x {NR} m   z {dtm.min():.1f}-{dtm.max():.1f} m NAVD88')

def z_at(x, y):
    """Bilinear terrain height (model Z) at model X,Y."""
    c = np.clip(x - XMIN, 0, NC - 1.001); r = np.clip(y - YMIN, 0, NR - 1.001)
    c0, r0 = np.floor(c).astype(int), np.floor(r).astype(int)
    fc, fr = c - c0, r - r0
    v = (dtm[r0, c0]*(1-fc)*(1-fr) + dtm[r0, c0+1]*fc*(1-fr) +
         dtm[r0+1, c0]*(1-fc)*fr   + dtm[r0+1, c0+1]*fc*fr)
    return v - ORIG_Z

# ------------------------------------------------------------- mesh helpers
class Mesh:
    def __init__(self): self.v = []; self.g = {}
    def add(self, group, verts, faces):
        b = len(self.v); self.v.extend(verts)
        self.g.setdefault(group, []).extend([(a+b, c+b, d+b) for a, c, d in faces])
    def counts(self): return {k: len(f) for k, f in self.g.items()}

def grid_surface(step):
    """Terrain vertices + triangles at the given sampling step."""
    xs = np.arange(XMIN, XMAX + 1e-6, step)
    ys = np.arange(YMIN, YMAX + 1e-6, step)
    XX, YY = np.meshgrid(xs, ys)
    ZZ = z_at(XX, YY)
    nx, ny = len(xs), len(ys)
    verts = np.stack([XX.ravel(), YY.ravel(), ZZ.ravel()], 1)
    j, i = np.meshgrid(np.arange(nx - 1), np.arange(ny - 1))
    a = (i*nx + j).ravel(); b = a + 1; c = a + nx; d = c + 1
    faces = np.concatenate([np.stack([a, d, c], 1), np.stack([a, b, d], 1)])  # +Z up
    return verts, faces, (nx, ny)

def prism(poly, z_bot, z_top):
    """Closed solid from a shapely polygon extruded between two heights."""
    ring = list(poly.exterior.coords)[:-1]
    n = len(ring)
    verts = [(x, y, z_bot) for x, y in ring] + [(x, y, z_top) for x, y in ring]
    faces = []
    for i in range(n):                                  # walls
        j = (i + 1) % n
        faces += [(i, j, n + j), (i, n + j, n + i)]
    # fan-triangulate caps (footprints here are simple and near-convex)
    for i in range(1, n - 1):
        faces.append((0, i + 1, i))                     # bottom, downward
        faces.append((n, n + i, n + i + 1))             # top, upward
    return verts, faces

def ribbon(pts, width, lift=0.15):
    """Draped surface strip along a polyline."""
    P = np.asarray(pts, float)
    d = np.gradient(P, axis=0)
    L = np.hypot(d[:, 0], d[:, 1]); L[L == 0] = 1
    nx_, ny_ = -d[:, 1]/L, d[:, 0]/L
    h = width / 2
    left  = np.stack([P[:, 0] + nx_*h, P[:, 1] + ny_*h], 1)
    right = np.stack([P[:, 0] - nx_*h, P[:, 1] - ny_*h], 1)
    verts, faces = [], []
    for i in range(len(P)):
        verts.append((left[i, 0],  left[i, 1],  z_at(left[i, 0],  left[i, 1])  + lift))
        verts.append((right[i, 0], right[i, 1], z_at(right[i, 0], right[i, 1]) + lift))
    for i in range(len(P) - 1):
        a, b, c, d2 = 2*i, 2*i+1, 2*i+2, 2*i+3
        faces += [(a, c, d2), (a, d2, b)]
    return verts, faces

mesh = Mesh()

# ------------------------------------------------------------ 1. terrain
tv, tf, _ = grid_surface(TERRAIN_STEP)
mesh.add('terrain', [tuple(p) for p in tv], [tuple(f) for f in tf])
print(f'terrain: {len(tf):,} tris @ {TERRAIN_STEP} m')

# ------------------------------------------------- 2. structures (buildings)
# Stepped extrusion: each blob is built from height tiers so tall, narrow plant
# equipment (screen towers, conveyors, silos) survives instead of being averaged away.
LEVELS = [2.0, 4.0, 6.0, 9.0, 12.0, 16.0, 20.0, 25.0, 31.0]
smask = struct >= 1.5
lbl, nl = ndimage.label(smask, np.ones((3, 3)))
buildings, ntier, tier_polys = [], 0, []
print(f'structure height model: max {struct.max():.1f} m over {smask.sum():,} m2')
for i in range(1, nl + 1):
    m = lbl == i
    if m.sum() < 15:
        continue
    hmax = float(struct[m].max())
    zb = float(np.min(dtm[m]) - ORIG_Z) - 0.4
    zg = float(np.median(dtm[m]) - ORIG_Z)
    prev = 0.0
    made = False
    for L in LEVELS:
        sub = m & (struct >= min(L, hmax) - 1e-9) if L <= hmax else None
        if sub is None or sub.sum() < 6:
            prev = L
            continue
        pad = np.pad(sub.astype(float), 1)
        for cont in measure.find_contours(pad, 0.5):
            if len(cont) < 8:
                continue
            poly = Polygon([(XMIN + (c - 1), YMIN + (r - 1)) for r, c in cont])
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.geom_type != 'Polygon' or poly.area < 8:
                continue
            poly = poly.simplify(1.0, preserve_topology=True)
            if len(poly.exterior.coords) < 4:
                continue
            bot = zb if prev == 0.0 else zg + prev
            v, f = prism(poly, bot, zg + L)
            mesh.add('structures', v, f)
            tier_polys.append({'p': [[round(a, 1), round(b2, 1)]
                                     for a, b2 in poly.exterior.coords[:-1]],
                               'b': round(bot, 2), 't': round(zg + L, 2)})
            ntier += 1
            made = True
        prev = L
    if not made:
        continue
    pad = np.pad(m.astype(float), 1)
    cs = sorted(measure.find_contours(pad, 0.5), key=len, reverse=True)
    poly = Polygon([(XMIN + (c - 1), YMIN + (r - 1)) for r, c in cs[0]]).buffer(0)
    cxy = poly.centroid if not poly.is_empty else None
    buildings.append({'id': len(buildings) + 1,
                      'footprint_m2': round(float(m.sum()), 1),
                      'height_m': round(hmax, 2),
                      'top_elev_m_navd88': round(zg + hmax + ORIG_Z, 2),
                      'x': round(float(cxy.x), 1), 'y': round(float(cxy.y), 1),
                      'utm_e': round(float(cxy.x) + ORIG_E, 1),
                      'utm_n': round(float(cxy.y) + ORIG_N, 1)})
buildings.sort(key=lambda b: -b['height_m'])
for k, b in enumerate(buildings, 1):
    b['id'] = k
print(f'structures: {len(buildings)} objects, {ntier} extrusion tiers, '
      f'tallest {buildings[0]["height_m"]:.1f} m')

# ---------------------------------------------- 3. stockpile outlines + stats
pm = resid >= 1.0
pm = ndimage.binary_opening(pm, np.ones((3, 3)))
plbl, npl = ndimage.label(pm, np.ones((3, 3)))
piles, pile_outlines = [], []
for i in range(1, npl + 1):
    m = plbl == i
    if m.sum() < 60:
        continue
    vol = float(resid[m].sum())
    if vol < 150:
        continue
    r_, c_ = ndimage.center_of_mass(m)
    piles.append({'id': len(piles)+1, 'area_m2': round(float(m.sum()), 1),
                  'volume_m3': round(vol, 1), 'volume_yd3': round(vol*1.30795, 1),
                  'crest_above_pad_m': round(float(resid[m].max()), 2),
                  'x': round(float(c_ + XMIN), 1), 'y': round(float(r_ + YMIN), 1),
                  'utm_e': round(float(c_ + XMIN + ORIG_E), 1),
                  'utm_n': round(float(r_ + YMIN + ORIG_N), 1)})
    pad = np.pad(m.astype(float), 1)
    for cont in measure.find_contours(pad, 0.5):
        if len(cont) >= 8:
            ln = LineString([(XMIN+(c-1), YMIN+(r-1)) for r, c in cont]).simplify(0.8)
            pile_outlines.append(list(ln.coords))
piles.sort(key=lambda p: -p['volume_m3'])
for k, p in enumerate(piles, 1):
    p['id'] = k
tot = sum(p['volume_m3'] for p in piles)
print(f'stockpiles: {len(piles)}, {tot:,.0f} m3 / {tot*1.30795:,.0f} yd3 above pad')

# ------------------------------------------------- 4. OSM roads / rail / water
tf4326 = Transformer.from_crs('EPSG:4326', 'EPSG:26913', always_xy=True)
osm = json.load(open('osm_geom.json'))
STYLE = {'trunk': ('roads', 11.0), 'residential': ('roads', 7.0),
         'service': ('roads', 6.0), 'track': ('roads', 4.5),
         'rail': ('rail', 3.0), 'abandoned': ('rail', 3.0),
         'stream': ('drainage', 4.0), 'ditch': ('drainage', 3.0)}
osm_lines = {}
for e in osm['elements']:
    t = e.get('tags', {})
    key = t.get('highway') or t.get('railway') or t.get('waterway')
    if key not in STYLE or 'geometry' not in e:
        continue
    grp, w = STYLE[key]
    E, Nn = tf4326.transform([g['lon'] for g in e['geometry']],
                             [g['lat'] for g in e['geometry']])
    P = [(x - ORIG_E, y - ORIG_N) for x, y in zip(E, Nn)]
    ln = LineString(P).intersection(
        Polygon([(XMIN+1, YMIN+1), (XMAX-1, YMIN+1), (XMAX-1, YMAX-1), (XMIN+1, YMAX-1)]))
    if ln.is_empty:
        continue
    parts = list(ln.geoms) if ln.geom_type == 'MultiLineString' else [ln]
    for part in parts:
        c = list(part.coords)
        if len(c) < 2:
            continue
        c = list(LineString(c).segmentize(6.0).coords)
        v, f = ribbon(c, w, 0.2 if grp != 'rail' else 0.35)
        mesh.add(grp, v, f)
        osm_lines.setdefault(grp, []).append(
            {'name': t.get('name', ''), 'kind': key, 'width_m': w,
             'coords': [[round(a, 1), round(b, 1)] for a, b in c]})
print('osm:', {k: len(v) for k, v in osm_lines.items()})

# --------------------------------------------------------------- 5. exports
MTL = """newmtl terrain
Kd 0.42 0.36 0.30
newmtl structures
Kd 0.78 0.79 0.80
newmtl roads
Kd 0.20 0.20 0.22
newmtl rail
Kd 0.45 0.34 0.24
newmtl drainage
Kd 0.30 0.45 0.55
"""
open(f'{OUT}/red_hill_site.mtl', 'w').write(MTL)

with open(f'{OUT}/red_hill_site.obj', 'w') as f:
    f.write('# Red Hill Lava Products, Inc. - 4000 US Hwy 285, Antonito, CO 81120\n')
    f.write('# Source: USGS 3DEP 1 m LiDAR (CO_SanLuisJuanMiguel_2020_D20) + OpenStreetMap (ODbL)\n')
    f.write(f'# Model origin: UTM 13N (EPSG:26913) E {ORIG_E} N {ORIG_N}, Z = NAVD88 - {ORIG_Z} m\n')
    f.write('# Units: metres. Z up.\n')
    f.write('mtllib red_hill_site.mtl\n')
    for x, y, z in mesh.v:
        f.write(f'v {x:.3f} {y:.3f} {z:.3f}\n')
    for grp, faces in mesh.g.items():
        f.write(f'g {grp}\nusemtl {grp}\n')
        for a, b, c in faces:
            f.write(f'f {a+1} {b+1} {c+1}\n')
print(f'OBJ: {len(mesh.v):,} verts, {sum(len(x) for x in mesh.g.values()):,} tris', mesh.counts())

# --- watertight terrain solid, binary STL
import struct as _st
sv, sf, (nx, ny) = grid_surface(STL_STEP)
zb = float(dtm.min() - ORIG_Z - 8.0)
base = sv.copy(); base[:, 2] = zb
V = np.vstack([sv, base]); off = len(sv)
F = [tuple(t) for t in sf]
F += [(off+c, off+b, off+a) for a, b, c in sf]                       # base, flipped
def edge_ring():
    top, bot = [], []
    for j in range(nx-1):                     # south
        top.append((j, j+1))
    for i in range(ny-1):                     # east
        top.append((i*nx + nx-1, (i+1)*nx + nx-1))
    for j in range(nx-1, 0, -1):              # north
        top.append(((ny-1)*nx + j, (ny-1)*nx + j-1))
    for i in range(ny-1, 0, -1):              # west
        top.append((i*nx, (i-1)*nx))
    return top
for a, b in edge_ring():
    F += [(a, b, off+b), (a, off+b, off+a)]
import trimesh
solid = trimesh.Trimesh(vertices=np.asarray(V), faces=np.asarray(F, np.int64), process=True)
trimesh.repair.fix_winding(solid)
trimesh.repair.fix_normals(solid)
if solid.volume < 0:
    solid.invert()
solid.export(f'{OUT}/red_hill_terrain_solid.stl')
Fn = solid.faces
print(f'  solid: watertight={solid.is_watertight} winding_ok={solid.is_winding_consistent} '
      f'vol={solid.volume:,.0f} m3')
print(f'STL: {len(Fn):,} tris @ {STL_STEP} m, watertight solid')

# --- CSVs
with open(f'{OUT}/stockpiles.csv', 'w') as f:
    f.write('id,volume_m3,volume_yd3,area_m2,crest_above_pad_m,model_x_m,model_y_m,utm13n_east,utm13n_north\n')
    for p in piles:
        f.write(f"{p['id']},{p['volume_m3']},{p['volume_yd3']},{p['area_m2']},"
                f"{p['crest_above_pad_m']},{p['x']},{p['y']},{p['utm_e']},{p['utm_n']}\n")
with open(f'{OUT}/structures.csv', 'w') as f:
    f.write('id,footprint_m2,height_m,top_elev_m_navd88,model_x_m,model_y_m,utm13n_east,utm13n_north\n')
    for b in buildings:
        f.write(f"{b['id']},{b['footprint_m2']},{b['height_m']},{b['top_elev_m_navd88']},"
                f"{b['x']},{b['y']},{b['utm_e']},{b['utm_n']}\n")

# --- viewer payload
vv, vf, (vx, vy) = grid_surface(VIEW_STEP)
Zv = vv[:, 2].reshape(vy, vx)
_pm = (resid >= 1.0) & ndimage.binary_dilation(pm, np.ones((3, 3)))
_c = np.clip(((np.arange(vx)*VIEW_STEP)).astype(int), 0, NC-1)
_r = np.clip(((np.arange(vy)*VIEW_STEP)).astype(int), 0, NR-1)
pile_flag = _pm[np.ix_(_r, _c)].astype(np.uint8)
payload = {
    'meta': {'origin_e': ORIG_E, 'origin_n': ORIG_N, 'origin_z': ORIG_Z,
             'crs': 'EPSG:26913 / NAVD88 (Geoid18)', 'step': VIEW_STEP,
             'xmin': XMIN, 'xmax': XMAX, 'ymin': YMIN, 'ymax': YMAX,
             'nx': vx, 'ny': vy,
             'gate_e': 411048.0, 'gate_n': 4101191.0},
    'z': [round(float(z), 2) for z in Zv.ravel()],
    'piles': piles, 'structures': buildings, 'tiers': tier_polys,
    'pile_flag': pile_flag.ravel().tolist(),
    'pile_outlines': [[[round(a, 1), round(b2, 1)] for a, b2 in o] for o in pile_outlines],
    'lines': osm_lines,
}
json.dump(payload, open('viewer_payload.json', 'w'))
print('viewer payload', round(os.path.getsize('viewer_payload.json')/1e6, 2), 'MB')
json.dump({'buildings': buildings, 'piles': piles,
           'extent': [XMIN, XMAX, YMIN, YMAX],
           'z_range_navd88': [round(float(dtm.min()), 2), round(float(dtm.max()), 2)]},
          open('summary.json', 'w'), indent=1)

