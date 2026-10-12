// Replaces the original module from "stockpile list" through its closing script.
// Requires the original geometry variables and the integration in assemble_upgrade.py.
const ul = document.getElementById('piles');
const inspector = document.getElementById('inspector');
const selection = document.getElementById('selection');
const announce = document.getElementById('selection-announcement');
const pileButtons = new Map();
let selectedPile = null;
const fmt = n => Math.round(n).toLocaleString();
const pileByOutline = associatePileOutlines(D.piles, D.pile_outlines);
const total = D.piles.reduce((sum,p) => sum+p.volume_m3,0);
const measurement = document.getElementById('measurement');
const measureButton = document.getElementById('measure-toggle');
const measurePrompt = document.getElementById('measure-prompt');
const measurementGroup = new THREE.Group(); scene.add(measurementGroup);world.push(measurementGroup);
measurementGroup.scale.z = +vx.value;
const measurementMaterial = new THREE.MeshBasicMaterial({color:0x6FD3C7});
const measurementLineMaterial = new THREE.LineBasicMaterial({color:0x6FD3C7});
let measuring=false,measurePoints=[];

D.piles.forEach(p => {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.className = 'pile-button'; button.type = 'button';
  button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label', `Stockpile ${p.id}, estimated ${fmt(p.volume_yd3)} cubic yards, 2020. Focus on model.`);
  const name = document.createElement('span'); name.className = 'n';
  name.textContent = `Pile ${String(p.id).padStart(2,'0')}`;
  const volume = document.createElement('span'); volume.className = 'v';
  volume.textContent = `${fmt(p.volume_yd3)} yd³`;
  button.append(name,volume); button.addEventListener('click', () => focusPile(p));
  li.append(button); ul.append(li); pileButtons.set(p.id,button);
});
document.getElementById('piletot').textContent = `${D.piles.length} piles · estimated ${fmt(total*1.30795)} yd³ (${fmt(total)} m³) above computed pad · 2020`;

function clearSelection() {
  selectedPile = null; selection.hidden = true; marker.visible = false;
  pileButtons.forEach(b => b.setAttribute('aria-pressed','false'));
  outlines.children.forEach(line => {line.material.color.setHex(0xE8A05C);line.material.opacity=.75;});
  outlines.visible = document.getElementById('L-piles').checked;
  announce.textContent = 'Stockpile selection cleared.'; invalidate();
}

function focusPile(p) {
  selectedPile = p;
  // A stockpile is part of the ground mesh, so reveal it when focusing a list row.
  ground.visible = true; document.getElementById('L-terrain').checked = true;
  pileButtons.forEach((b,id) => b.setAttribute('aria-pressed',String(id === p.id)));
  selection.hidden = false;
  document.getElementById('selection-title').textContent = `Stockpile ${String(p.id).padStart(2,'0')}`;
  const facts = document.getElementById('selection-facts'); facts.replaceChildren();
  const rows = [['Est. volume',`${fmt(p.volume_yd3)} yd³ / ${fmt(p.volume_m3)} m³`],
    ['Footprint',`${fmt(p.area_m2)} m²`],['Crest above pad',`${p.crest_above_pad_m.toFixed(2)} m`],
    ['UTM easting',`${p.utm_e.toFixed(1)} m`],['UTM northing',`${p.utm_n.toFixed(1)} m`]];
  rows.forEach(([name,value]) => {const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=name;dd.textContent=value;facts.append(dt,dd);});
  let radius = Math.sqrt(p.area_m2/Math.PI);
  const boundary = pileByOutline.findIndex(q => q?.id === p.id);
  outlines.children.forEach((line,i) => {line.material.color.setHex(i===boundary?0x6FD3C7:0xE8A05C);
    line.material.opacity=i===boundary?1:.75;});
  if(boundary >= 0) {
    radius = Math.max(radius,...D.pile_outlines[boundary].map(([x,y]) => Math.hypot(x-p.x,y-p.y)));
  }
  markerZ = zAt(p.x,p.y)+.8;
  marker.position.set(p.x,p.y,markerZ*(+vx.value));marker.scale.setScalar(1);marker.visible=true;
  // Keep selection visible even when the stockpile color overlay is disabled.
  outlines.visible = true;
  controls.target.set(p.x,p.y,zAt(p.x,p.y)*(+vx.value));
  if(cam.isOrthographicCamera) {
    const span=Math.max(120,radius*3.5);
    cam.zoom=1;cam.top=span/2;cam.bottom=-span/2;cam.left=-span*innerWidth/innerHeight/2;
    cam.right=-cam.left;cam.updateProjectionMatrix();
    cam.position.copy(controls.target).add(new THREE.Vector3(0,0,1600));
  } else {
    const distance = Math.max(100,radius/Math.sin(THREE.MathUtils.degToRad(cam.fov/2)) * 1.7);
    cam.position.copy(controls.target).add(new THREE.Vector3(-.25,-1,.8).normalize().multiplyScalar(distance));
  }
  controls.update();invalidate();
  inspector.open = true;
  // Move the inspector scroll, not browser focus, so keyboard list navigation stays usable.
  inspector.scrollTop = Math.max(0,selection.offsetTop-inspector.querySelector('summary').offsetHeight-12);
  announce.textContent = `Stockpile ${p.id} selected. Estimated ${fmt(p.volume_yd3)} cubic yards in 2020.`;
}
document.getElementById('clear-selection').addEventListener('click',clearSelection);
document.getElementById('true-scale').addEventListener('click',() => {vx.value='1';vx.dispatchEvent(new Event('input'));});
document.getElementById('L-piles').addEventListener('change',e => {
  outlines.visible = e.target.checked || Boolean(selectedPile);invalidate();
});

document.getElementById('export-piles').addEventListener('click',()=>{
  const columns=['id','volume_m3','volume_yd3','area_m2','crest_above_pad_m','x','y','utm_e','utm_n'];
  const header=[...columns,'survey_year','volume_basis','declared_horizontal_crs'].join(',');
  const rows=D.piles.map(p=>[...columns.map(k=>p[k]),2020,'estimated_above_computed_pad','EPSG:26913_unverified_realization'].join(','));
  const url=URL.createObjectURL(new Blob([header+'\r\n'+rows.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='red-hill-stockpiles-2020.csv';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

function clearMeasurement() {
  for(const child of [...measurementGroup.children]) {measurementGroup.remove(child);child.geometry.dispose();}
  measurePoints=[];measurement.hidden=true;
  if(measuring){measurePrompt.hidden=false;measurePrompt.textContent='Tap a starting point on the ground.';}
  invalidate();
}
function setMeasuring(value) {
  measuring=value;measureButton.setAttribute('aria-pressed',String(value));
  if(value){ground.visible=true;document.getElementById('L-terrain').checked=true;clearMeasurement();}
  else measurePrompt.hidden=true;
  canvas.style.cursor=value?'crosshair':'';
  announce.textContent=value?'Measure mode. Choose two ground points.':'Measure mode ended.';
}
function addMeasurementPoint(point) {
  if(measurePoints.length===2)clearMeasurement();
  measurePoints.push(point);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(3,12,8),measurementMaterial);
  dot.position.set(point.x,point.y,point.z+.4);measurementGroup.add(dot);
  if(measurePoints.length===1) {
    measurePrompt.textContent='Tap an ending point. Drag or pinch to navigate.';invalidate();return;
  }
  const [a,b]=measurePoints,distance=surveyDistance(a,b);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(measurePoints.map(p=>new THREE.Vector3(p.x,p.y,p.z+.4))),measurementLineMaterial);
  measurementGroup.add(line);measurement.hidden=false;
  const facts=document.getElementById('measurement-facts');facts.replaceChildren();
  [['Horizontal',`${distance.horizontal.toFixed(1)} m`],['Height change',`${distance.dz>=0?'+':''}${distance.dz.toFixed(1)} m`],
    ['Straight 3D distance',`${distance.spatial.toFixed(1)} m`],
    ['Grade',distance.horizontal>.01?`${(100*distance.dz/distance.horizontal).toFixed(1)}%`:'—'],
    ['Start NAVD88',`${(a.z+M.origin_z).toFixed(1)} m`],['End NAVD88',`${(b.z+M.origin_z).toFixed(1)} m`]]
    .forEach(([name,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;facts.append(dt,dd);});
  measurePrompt.textContent='Measurement complete. Tap to start another, or turn Measure off.';
  inspector.open=true;inspector.scrollTop=Math.max(0,measurement.offsetTop-inspector.querySelector('summary').offsetHeight-12);
  announce.textContent=`Ground measurement complete: ${distance.horizontal.toFixed(1)} metres horizontal, ${distance.dz.toFixed(1)} metres height change.`;
  invalidate();
}
measureButton.addEventListener('click',()=>setMeasuring(!measuring));
document.getElementById('clear-measurement').addEventListener('click',clearMeasurement);
document.getElementById('L-terrain').addEventListener('change',e=>{if(!e.target.checked && measuring)setMeasuring(false);});

// Bind only to the canvas. Overlay pointer movement never raycasts the terrain.
const canvas = renderer.domElement;
canvas.tabIndex = 0;canvas.setAttribute('aria-label','Red Hill 3D model. Arrow keys pan; plus and minus zoom; Home returns to overview.');
canvas.setAttribute('aria-describedby','help');
controls.listenToKeyEvents(canvas);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(ev) {
  if(!ground.visible || contextLost) return null;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width || !rect.height) return null;
  ndc.set((ev.clientX-rect.left)/rect.width*2-1,-(ev.clientY-rect.top)/rect.height*2+1);
  cam.updateMatrixWorld(true);ground.updateMatrixWorld(true);
  ray.setFromCamera(ndc,cam);
  const hit=ray.intersectObject(ground,false)[0];
  return hit ? physicalPoint(hit.point,+vx.value) : null;
}
function clearReadout() {['r-xy','r-utm','r-z'].forEach(id => document.getElementById(id).textContent='—');}
function readGround(ev) {
  const p=pick(ev);if(!p){clearReadout();return;}
  const elevation=p.z+M.origin_z;
  document.getElementById('r-xy').textContent=`${p.x.toFixed(1)}E ${p.y.toFixed(1)}N`;
  document.getElementById('r-utm').textContent=`${(p.x+M.origin_e).toFixed(1)}E ${(p.y+M.origin_n).toFixed(1)}N`;
  document.getElementById('r-z').textContent=`${elevation.toFixed(1)} m / ${(elevation*M2FT).toFixed(0)} ft NAVD88`;
}
let lastHover=null, hoverTimer=0;
canvas.addEventListener('pointermove',ev => {
  if(ev.pointerType !== 'mouse' || ev.buttons || document.hidden) return;
  lastHover={clientX:ev.clientX,clientY:ev.clientY};
  if(!hoverTimer) hoverTimer=setTimeout(() => {hoverTimer=0;if(lastHover)readGround(lastHover);},50);
});
function stopHover(){clearTimeout(hoverTimer);hoverTimer=0;lastHover=null;clearReadout();}
canvas.addEventListener('pointerleave',stopHover);controls.addEventListener('start',stopHover);
document.getElementById('L-terrain').addEventListener('change',clearReadout);

// A drag or multi-touch gesture must never select a pile on release.
const activePointers=new Set();let tap=null;
canvas.addEventListener('pointerdown',ev => {
  stopHover();activePointers.add(ev.pointerId);
  if(activePointers.size > 1 && tap) tap.cancelled=true;
  if(activePointers.size===1 && ev.button===0)
    tap={id:ev.pointerId,x:ev.clientX,y:ev.clientY,cancelled:false};
});
canvas.addEventListener('pointermove',ev => {
  if(tap?.id===ev.pointerId && Math.hypot(ev.clientX-tap.x,ev.clientY-tap.y)>6) tap.cancelled=true;
});
canvas.addEventListener('pointerup',ev => {
  activePointers.delete(ev.pointerId);
  if(tap?.id!==ev.pointerId) return;
  const isTap=!tap.cancelled && Math.hypot(ev.clientX-tap.x,ev.clientY-tap.y)<=6;
  tap=null;if(!isTap)return;
  const p=pick(ev);if(!p)return;
  if(measuring){addMeasurementPoint(p);return;}
  const index=D.pile_outlines.findIndex(ring => pointInRing(p.x,p.y,ring));
  const pile=index<0?null:pileByOutline[index];
  if(pile) focusPile(pile);else clearSelection();
});
canvas.addEventListener('pointercancel',ev => {activePointers.delete(ev.pointerId);tap=null;});

function replaceCamera(nextCamera) {
  controls.dispose();cam=nextCamera;
  controls=new OrbitControls(cam,canvas);controls.enableDamping=true;controls.dampingFactor=.07;
  controls.minDistance=60;controls.maxDistance=3200;controls.minZoom=.25;controls.maxZoom=50;
  controls.maxPolarAngle=cam.isOrthographicCamera?Math.PI:Math.PI/2-.04;
  controls.enableRotate=!cam.isOrthographicCamera;
  if(cam.isOrthographicCamera){controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.touches.ONE=THREE.TOUCH.PAN;}
  controls.listenToKeyEvents(canvas);controls.addEventListener('change',invalidate);
  controls.addEventListener('start',()=>{stopHover();lastFrameTime=0;});
}
function fitOverview(top=false) {
  const box=new THREE.Box3().setFromObject(ground);box.expandByObject(structs);
  const center=box.getCenter(new THREE.Vector3()), radius=box.getSize(new THREE.Vector3()).length()/2;
  if(top) {
    const size=box.getSize(new THREE.Vector3()),usableFraction=!isCompact()?Math.max(.35,(innerWidth-660)/innerWidth):.9;
    const span=Math.max(size.y*1.3,size.x/(innerWidth/innerHeight*usableFraction)*1.15);
    const next=new THREE.OrthographicCamera(-span*innerWidth/innerHeight/2,span*innerWidth/innerHeight/2,span/2,-span/2,2,6000);
    next.up.set(0,1,0);next.position.copy(center).add(new THREE.Vector3(0,0,2000));next.lookAt(center);
    replaceCamera(next);controls.target.copy(center);scene.fog.near=4000;scene.fog.far=6000;
  } else {
    const next=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,2,6000);next.up.set(0,0,1);
    replaceCamera(next);
  const verticalFov=THREE.MathUtils.degToRad(cam.fov);
  const usableWidth=!isCompact()?Math.max(innerWidth*.35,innerWidth-660):innerWidth*.9;
  const horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*usableWidth/innerHeight);
  const distance=radius/Math.sin(Math.min(verticalFov,horizontalFov)/2)*1.08;
  controls.maxDistance=Math.max(3200,distance*1.5);cam.far=Math.max(6000,distance*3);cam.updateProjectionMatrix();
  scene.fog.near=Math.max(1400,distance*1.25);scene.fog.far=Math.max(3000,distance*2.5);
  controls.target.copy(center);
  cam.position.copy(center).add(new THREE.Vector3(-.2,-1,.8).normalize().multiplyScalar(distance));
  }
  document.getElementById('overview').setAttribute('aria-pressed',String(!top));
  document.getElementById('top-view').setAttribute('aria-pressed',String(top));
  controls.update();stopHover();invalidate();
}
function zoom(factor) {
  if(cam.isOrthographicCamera){cam.zoom=Math.min(50,Math.max(.25,cam.zoom/factor));cam.updateProjectionMatrix();}
  else cam.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
  controls.update();stopHover();invalidate();
}
document.getElementById('overview').addEventListener('click',()=>fitOverview());
document.getElementById('top-view').addEventListener('click',()=>fitOverview(true));
document.getElementById('zoom-in').addEventListener('click',()=>zoom(.8));
document.getElementById('zoom-out').addEventListener('click',()=>zoom(1.25));
const help=document.getElementById('help'),helpButton=document.getElementById('help-toggle');
helpButton.addEventListener('click',()=>{help.hidden=!help.hidden;helpButton.setAttribute('aria-expanded',String(!help.hidden));});
canvas.addEventListener('keydown',ev => {
  if(['+','=','-','Home','t','T','Escape'].includes(ev.key)) ev.preventDefault();
  if(ev.key==='+' || ev.key==='=') zoom(.8);
  else if(ev.key==='-')zoom(1.25);
  else if(ev.key==='Home')fitOverview();
  else if(ev.key==='t' || ev.key==='T')fitOverview(true);
  else if(ev.key==='Escape'){if(measuring)setMeasuring(false);else clearSelection();}
});
if(isCompact()) inspector.open=false;

const northArrow=document.getElementById('north-arrow'),northDirection=new THREE.Vector3();
function renderFrame(timestamp) {
  renderRequest=0;if(contextLost || document.hidden)return;
  controls.dampingFactor=dampingAlpha(lastFrameTime?(timestamp-lastFrameTime)/1000:1/60);
  lastFrameTime=timestamp;
  const changed=controls.update();
  renderer.render(scene,cam);
  northDirection.set(0,1,0).applyQuaternion(cam.quaternion.clone().invert());
  if(Math.hypot(northDirection.x,northDirection.y)>1e-5)
    northArrow.style.transform=`rotate(${Math.atan2(northDirection.x,northDirection.y)*180/Math.PI}deg)`;
  const scale=document.getElementById('scale');scale.hidden=!cam.isOrthographicCamera;
  if(cam.isOrthographicCamera){
    const bar=niceScaleBar(canvas.getBoundingClientRect().width*cam.zoom/(cam.right-cam.left));
    if(bar){document.getElementById('scale-line').style.width=`${bar.pixels}px`;
      document.getElementById('scale-label').textContent=bar.metres>=1000?`${bar.metres/1000} km`:`${bar.metres} m`;}
  }
  if(changed)invalidate();
}
canvas.addEventListener('webglcontextlost',ev => {
  ev.preventDefault();contextLost=true;cancelAnimationFrame(renderRequest);renderRequest=0;
  window.redHillStartup.fail('The graphics context was lost. Reload the viewer to resume, or open the downloadable model files.');
});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;window.redHillStartup.ready();invalidate();});
addEventListener('resize',()=>{
  if(cam.isOrthographicCamera){const span=cam.top-cam.bottom;cam.left=-span*innerWidth/innerHeight/2;cam.right=-cam.left;}
  else cam.aspect=innerWidth/innerHeight;
  cam.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,isCompact()?1.5:2));
  renderer.setSize(innerWidth,innerHeight);stopHover();invalidate();
});
document.addEventListener('visibilitychange',()=>{
  stopHover();if(document.hidden){cancelAnimationFrame(renderRequest);renderRequest=0;}else invalidate();
});
fitOverview();
renderer.render(scene,cam); // Ensure a completed render before declaring startup ready.
window.redHillStartup.ready();invalidate();
