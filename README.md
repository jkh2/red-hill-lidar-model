# Red Hill Lava Products — 3D site model

**4000 US Highway 285, Antonito, Colorado 81120**  
Scoria quarry, bagging plant and rail loadout, Conejos County.

**Live viewer:** https://jkh2.github.io/red-hill-lidar-model/

The viewer presents a **2020 survey snapshot**, not current stockpile inventory. It is built from public-domain USGS 3DEP LiDAR and OpenStreetMap linework. Google Maps geometry is not used; the original project used Google Places only for site identification.

## Viewer

- Drag to orbit in **3D overview**; right-drag to pan; scroll to zoom.
- **Plan** switches to a north-up orthographic view. Drag to pan; its scale bar reflects the actual camera scale. The arrow indicates **grid north**, not magnetic north.
- Touch: one finger orbits in 3D or pans in Plan; two fingers pan or pinch to zoom.
- Use layer controls to reveal terrain, stockpile coloring, structures, rail, roads, drainage and the 100 m grid.
- Select a stockpile button or tap its boundary on the ground to frame it and retain its estimated volume, footprint, crest and coordinates in the inspector.
- **Measure** accepts two ground points and reports horizontal distance, signed height change, straight 3D distance and grade. Dragging still navigates. Measurements use true coordinates at every vertical exaggeration setting.
- **Download pile CSV** exports all 30 historical stockpile records with year, estimate basis and CRS caveat.
- The mobile inspector starts collapsed. Help and navigation controls remain accessible.
- Keyboard: focus the canvas; arrows pan, +/− zoom, Home returns to overview, T opens Plan and Escape exits Measure or clears selection. Native stockpile buttons respond to Enter or Space.

Default height is **1×**. Exaggeration changes visual height only, including structure height; it does not change inventory estimates or physical measurement values. Source grids are documented as nominal 1 m; the browser terrain samples at **4 m**. Ground cursor elevations and measurements are estimates from that display mesh.

WebGL is required for 3D. If graphics or library initialization fails, the page presents recovery actions and a readable stockpile table. Idle rendering pauses after orbit damping settles.

## Files and deployment

| File or directory | Purpose |
|---|---|
| `index.html`, `red_hill_site_viewer.html` | Identical generated, single-file viewers. Deploy either on a static host. GitHub Pages serves `index.html`. |
| `src/` | Readable HTML, CSS, startup, geometry, interaction and survey-helper sources. Edit these instead of generated HTML. |
| `data/viewer_payload.json` | Original embedded survey payload, preserved without changing coordinates, heights, volumes or outlines. |
| `data/provenance.json` | Survey context, original source fingerprint, payload checksum and known limitations. |
| `scripts/build_viewer.py` | Standard-library-only viewer/CSV builder and generated-file check. |
| `stockpiles.csv`, `structures.csv` | Generated historical feature records with year and CRS caveat. Local and UTM coordinates are metres. |
| `red_hill_site.obj`, `red_hill_site.mtl` | Existing CAD model: terrain, structures, roads, rail and drainage. |
| `build_red_hill_model.py` | Original geometry pipeline; requires external intermediate grids and OSM JSON. |
| `tests/`, `.github/workflows/viewer-checks.yml` | Survey logic, build integrity and Chromium software-WebGL browser checks. |

The deployment retains the existing pinned **Three.js 0.160.0** / OrbitControls CDN imports and Google font styles. No new runtime dependency or backend is required. These are **single-file deployments with network dependencies**, not fully offline applications. Offline use requires vendoring the pinned JavaScript modules and using local/system fonts.

### Rebuild the viewer

Requires Python 3.9+ only:

```sh
python scripts/build_viewer.py
python scripts/build_viewer.py --check
```

The builder emits both HTML filenames from one source and regenerates the CSV files. It refuses an unexpected survey checksum. To intentionally adopt new survey data, review and update provenance and date/resolution UI together; do not merely change a checksum to hide an unintended edit.

### Verify changes

Node.js 20+ is needed only for development checks:

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
```

Browser checks serve the exact pinned Three.js npm package locally, exercise a real WebGL renderer using software graphics, and retain screenshots and traces in GitHub Actions. They cover terrain output, persistent selection, drag rejection, idle frames, plan scale/measurement agreement, exaggeration invariance, keyboard controls, mobile reachability, CSV download and initialization failure. Screenshots use system-font fallback for deterministic CI; production can load Archivo.

## Coordinate system and provenance

```text
X = UTM zone 13N easting  − 411048.0
Y = UTM zone 13N northing − 4101191.0
Z = NAVD88 elevation     − 2390.0
```

Units are metres, Z up. The payload and original OSM transformation declare **EPSG:26913**. Original source documentation calls the LiDAR **NAD83(2011)**, which would correspond to **EPSG:6342** for UTM 13N. This discrepancy is **unresolved**: verify the raw LAZ/grid CRS and transform linework into that confirmed reference before survey integration. Existing numbers have not been reprojected or relabeled by the viewer upgrade. NAVD88 / Geoid18 is retained as originally documented.

The original documented extent is 1,280 m east–west × 695 m north–south. The 4 m display grid has 321 × 174 points; its sampled northern row is at local Y 517 m, while the documented model extent reaches Y 520 m. Do not infer measurement precision from the displayed decimal places.

**Terrain, structures and stockpiles:** USGS 3DEP project `CO_SanLuisJuanMiguel_2020_D20`, flown 2020; original documentation identifies tiles `13S_DB_1101` and `13S_DB_1001`. Public domain.

**Roads, rail and drainage:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Keep this attribution when republishing the viewer.

## Historical inventory and limitations

| Metric | Embedded 2020 estimate |
|---|---:|
| Stockpiles | 30 |
| Total above computed pad | 54,208 yd³ / 41,445 m³, rounded |
| Largest pile | 14,404 yd³, rounded |
| Structures | 29 |
| Tallest inferred structure | Approximately 22 m |

- **Historical inventory:** piles and operating conditions change. These figures represent the 2020 flight.
- **Computed pad:** volumes depend on inferred baseline surfaces, not surveyed pad elevations. No numerical accuracy tolerance has been independently validated here.
- **Simplified massing:** structures use stepped LiDAR extrusions. Open steel frames and conveyors can be incomplete or appear thin. They are not architectural or engineering plans.
- **Unknown parcels:** the model covers a contiguous industrial corridor. It does not establish property ownership or parcel boundaries.
- **Measurement meaning:** horizontal distance is XY separation; straight 3D distance includes height change. Neither follows the terrain surface. Grade is undefined for coincident XY points. Use a survey for engineering decisions.
- **Feature identity:** current pile IDs are volume ranks within one snapshot, not stable identifiers across dates. Outlines were emitted before sorting; the viewer associates the current boundaries explicitly rather than treating outline index as a pile ID. Ambiguous future associations are rejected.

## Raw geometry regeneration: remaining prerequisite

The original checkout does **not** include `stage1_grids.py`, raw LAZ tiles, `grids_meta.json`, `dtm.npy`, `struct_h.npy`, `resid.npy` or `osm_geom.json`. Consequently, viewer/CSV rebuilding is reproducible from the committed payload, but raw LiDAR-to-geometry regeneration is not yet reproducible from this checkout alone.

The builder consumes those intermediates. It produces the OBJ/MTL, a 2.5 m terrain-solid STL, CSVs and a viewer payload when the inputs and Python scientific packages are supplied. Outputs now default to `outputs/`; set `RED_HILL_OUTPUT_DIR` to another location if needed. The STL is **not presently committed**, so there is no viewer link claiming it is available.

Restore and validate stage one against the original tile metadata before regenerating the survey. Required packages include NumPy, SciPy, scikit-image, Shapely, pyproj and trimesh; LAZ processing additionally needs laspy/lazrs. Source reconstruction, pad extraction, coordinate verification and dependency pinning for this missing stage remain separate work. Do not reconstruct higher-resolution geometry from the 4 m viewer mesh and present it as the original survey pipeline.
