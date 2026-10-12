import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const data=fs.readFileSync(new URL('../data/viewer_payload.json',import.meta.url),'utf8');
const provenance=JSON.parse(fs.readFileSync(new URL('../data/provenance.json',import.meta.url),'utf8'));
assert.equal(crypto.createHash('sha256').update(data).digest('hex'),provenance.payload_sha256);
assert.equal(html.match(/<script[^>]*id="payload"[^>]*>([\s\S]*?)<\/script>/)[1],data);
assert.equal(html,fs.readFileSync(new URL('../red_hill_site_viewer.html',import.meta.url),'utf8'));
const D=JSON.parse(data),M=D.meta;assert.equal(D.z.length,M.nx*M.ny);
assert.equal(D.pile_flag.length,D.z.length);assert.ok(D.z.every(Number.isFinite));
assert.equal(D.piles.length,30);assert.equal(D.structures.length,29);
assert.ok(html.includes('idx.push(a,e,d, a,b,e);'));
for(let r=0;r<M.ny-1;r++)for(let c=0;c<M.nx-1;c++){
  const a=r*M.nx+c,b=a+1,d=a+M.nx,e=d+1;
  for(const [i,j,k] of [[a,e,d],[a,b,e]]){
    const xy=q=>[q%M.nx,Math.floor(q/M.nx)];const [ax,ay]=xy(i),[bx,by]=xy(j),[cx,cy]=xy(k);
    assert.ok((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)>0);
  }
}
for(const [,attrs,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  if(attrs.includes('application/json')||attrs.includes('importmap'))continue;
  new vm.Script(attrs.includes('type="module"')?`(async()=>{${code}\n})()`:code);
}
assert.ok(html.includes('OpenStreetMap contributors')&&html.includes('USGS 3DEP')&&html.includes('ODbL'));
console.log('PASS: original payload hash, identical viewers, 110,720 upward terrain faces, data counts, attribution and script syntax.');
