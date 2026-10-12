
try {
const [THREE, {OrbitControls}] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
__SURVEY_HELPERS__

const D = JSON.parse(document.getElementById('payload').textContent);
const M = D.meta, NX = M.nx, NY = M.ny, S = M.step;
const M2FT = 3.28084;
function isCompact(){return matchMedia('(max-width:760px), (max-height:520px) and (max-width:1000px)').matches;}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x100D0C);
scene.fog = new THREE.Fog(0x100D0C, 1400, 3000);

let cam = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 2, 6000);
cam.up.set(0,0,1);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isCompact() ? 1.5 : 2));
document.getElementById('stage').appendChild(renderer.domElement);

const ctr = new THREE.Vector3((M.xmin+M.xmax)/2, (M.ymin+M.ymax)/2, 20);
let controls = new OrbitControls(cam, renderer.domElement);
controls.target.copy(ctr);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI/2 - 0.04;
controls.minDistance = 60; controls.maxDistance = 3200;
let renderRequest = 0, contextLost = false, lastFrameTime = 0;
function invalidate() {
  if (!renderRequest && !document.hidden && !contextLost) renderRequest = requestAnimationFrame(renderFrame);
}
controls.addEventListener('change', invalidate);

// terrain height lookup ------------------------------------------------------
const Z = D.z, PF = D.pile_flag;
function zAt(x,y){
  const c = Math.min(Math.max((x-M.xmin)/S,0), NX-1.001);
  const r = Math.min(Math.max((y-M.ymin)/S,0), NY-1.001);
  const c0=c|0, r0=r|0, fc=c-c0, fr=r-r0;
  return Z[r0*NX+c0]*(1-fc)*(1-fr) + Z[r0*NX+c0+1]*fc*(1-fr)
       + Z[(r0+1)*NX+c0]*(1-fc)*fr + Z[(r0+1)*NX+c0+1]*fc*fr;
}

// ---- ground surface --------------------------------------------------------
let zlo=1e9, zhi=-1e9;
for(const v of Z){ if(v<zlo)zlo=v; if(v>zhi)zhi=v; }
const pos = new Float32Array(NX*NY*3), col = new Float32Array(NX*NY*3);
const dust = new THREE.Color(0x9C8A73), sage = new THREE.Color(0x5D6350),
      scoria = new THREE.Color(0xC4562E), tmp = new THREE.Color();
for(let r=0;r<NY;r++) for(let c=0;c<NX;c++){
  const i=r*NX+c, z=Z[i];
  pos[i*3]=M.xmin+c*S; pos[i*3+1]=M.ymin+r*S; pos[i*3+2]=z;
  tmp.copy(sage).lerp(dust, (z-zlo)/(zhi-zlo));
  if(PF[i]) tmp.lerp(scoria, 0.82);
  col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
}
const colPlain = new Float32Array(col.length);
for(let r=0;r<NY;r++) for(let c=0;c<NX;c++){
  const i=r*NX+c; tmp.copy(sage).lerp(dust,(Z[i]-zlo)/(zhi-zlo));
  colPlain[i*3]=tmp.r; colPlain[i*3+1]=tmp.g; colPlain[i*3+2]=tmp.b;
}
const idx=[];
for(let r=0;r<NY-1;r++) for(let c=0;c<NX-1;c++){
  const a=r*NX+c, b=a+1, d=a+NX, e=d+1;
  idx.push(a,e,d, a,b,e); // +Z-facing terrain, matching the Python exporter
}
const gg = new THREE.BufferGeometry();
gg.setAttribute('position', new THREE.BufferAttribute(pos,3));
gg.setAttribute('color', new THREE.BufferAttribute(col.slice(),3));
gg.setIndex(idx); gg.computeVertexNormals();
const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial(
  {vertexColors:true, roughness:0.95, metalness:0.0, flatShading:false}));
scene.add(ground);

// ---- plant structures ------------------------------------------------------
const structs = new THREE.Group();
const smat = new THREE.MeshStandardMaterial({color:0xB9C0C4, roughness:0.62, metalness:0.15});
for(const t of D.tiers){
  const sh = new THREE.Shape();
  t.p.forEach((p,i)=> i? sh.lineTo(p[0],p[1]) : sh.moveTo(p[0],p[1]));
  const g = new THREE.ExtrudeGeometry(sh,{depth:Math.max(t.t-t.b,0.3),bevelEnabled:false});
  g.translate(0,0,t.b);
  structs.add(new THREE.Mesh(g, smat));
}
scene.add(structs);

// ---- linework --------------------------------------------------------------
function ribbon(coords,width,lift,color){
  const P=coords, n=P.length, v=[], f=[];
  for(let i=0;i<n;i++){
    const a=P[Math.max(i-1,0)], b=P[Math.min(i+1,n-1)];
    let dx=b[0]-a[0], dy=b[1]-a[1];
    const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
    const nx=-dy*width/2, ny=dx*width/2;
    v.push(P[i][0]+nx,P[i][1]+ny,zAt(P[i][0]+nx,P[i][1]+ny)+lift);
    v.push(P[i][0]-nx,P[i][1]-ny,zAt(P[i][0]-nx,P[i][1]-ny)+lift);
  }
  for(let i=0;i<n-1;i++){const a=2*i;f.push(a,a+2,a+3,a,a+3,a+1);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.setIndex(f); g.computeVertexNormals();
  return new THREE.Mesh(g,new THREE.MeshStandardMaterial(
    {color,roughness:0.9,side:THREE.DoubleSide}));
}
const LAYER = {roads:{g:new THREE.Group(),c:0x3A3A3E,l:0.25},
               rail:{g:new THREE.Group(),c:0x8A6242,l:0.45},
               drainage:{g:new THREE.Group(),c:0x4C7A8C,l:0.1}};
for(const k in LAYER){
  for(const ln of (D.lines[k]||[]))
    LAYER[k].g.add(ribbon(ln.coords, ln.width_m, LAYER[k].l, LAYER[k].c));
  scene.add(LAYER[k].g);
}
LAYER.drainage.g.visible = false;

// ---- stockpile outlines ----------------------------------------------------
const outlines = new THREE.Group();
for(const o of D.pile_outlines){
  const pts = o.map(p=>new THREE.Vector3(p[0],p[1],zAt(p[0],p[1])+0.35));
  outlines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color:0xE8A05C, transparent:true, opacity:0.75})));
}
scene.add(outlines);

// ---- 100 m grid ------------------------------------------------------------
const grid = new THREE.Group(); grid.visible=false;
const gmat = new THREE.LineBasicMaterial({color:0x6FD3C7,transparent:true,opacity:0.22});
for(let x=Math.ceil(M.xmin/100)*100; x<=M.xmax; x+=100){
  const p=[]; for(let y=M.ymin;y<=M.ymax;y+=20) p.push(new THREE.Vector3(x,y,zAt(x,y)+0.6));
  grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),gmat));
}
for(let y=Math.ceil(M.ymin/100)*100; y<=M.ymax; y+=100){
  const p=[]; for(let x=M.xmin;x<=M.xmax;x+=20) p.push(new THREE.Vector3(x,y,zAt(x,y)+0.6));
  grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),gmat));
}
scene.add(grid);

// ---- pile marker -----------------------------------------------------------
const marker = new THREE.Mesh(new THREE.RingGeometry(7,8.6,48),
  new THREE.MeshBasicMaterial({color:0x6FD3C7,side:THREE.DoubleSide}));
marker.visible=false; scene.add(marker);

// ---- lighting --------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xFFF0DC, 2.5);
sun.position.set(-700, 700, 900); scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9FB4C7, 0x241A14, 0.85));
scene.add(new THREE.AmbientLight(0xffffff, 0.14));

// ---- vertical exaggeration -------------------------------------------------
const world = [ground, structs, outlines, grid, LAYER.roads.g, LAYER.rail.g, LAYER.drainage.g];
function setVX(v) {
  const old = ground.scale.z || 1;
  const delta = controls.target.z * (v/old - 1);
  world.forEach(o=>o.scale.z=v); marker.position.z = markerZ*v;
  controls.target.z += delta; cam.position.z += delta;
  controls.update(); invalidate();
}
let markerZ = 0;
const vx = document.getElementById('vx');
vx.addEventListener('input', ()=>{
  document.getElementById('vxv').textContent = (+vx.value).toFixed(1)+'\u00D7';
  document.getElementById('vx-badge').textContent = 'Height '+(+vx.value).toFixed(1)+'\u00D7';
  vx.setAttribute('aria-valuetext', (+vx.value).toFixed(1)+' times vertical exaggeration');
  setVX(+vx.value);
});
setVX(+vx.value);

// ---- layer toggles ---------------------------------------------------------
const bind=(id,fn)=>document.getElementById(id).addEventListener('change',e=>{fn(e.target.checked);invalidate();});
bind('L-terrain', v=>ground.visible=v);
bind('L-structures', v=>structs.visible=v);
bind('L-rail', v=>LAYER.rail.g.visible=v);
bind('L-roads', v=>LAYER.roads.g.visible=v);
bind('L-drainage', v=>LAYER.drainage.g.visible=v);
bind('L-grid', v=>grid.visible=v);
bind('L-piles', v=>{
  gg.attributes.color.array.set(v?col:colPlain);
  gg.attributes.color.needsUpdate=true; outlines.visible=v;
});

__VIEWER_INTERACTIONS__
} catch (error) { console.error(error); window.redHillStartup.fail(); }
