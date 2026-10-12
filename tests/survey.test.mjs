import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pointInRing,associatePileOutlines,physicalPoint,surveyDistance,niceScaleBar} from '../src/survey-utils.mjs';
const D=JSON.parse(fs.readFileSync(new URL('../data/viewer_payload.json',import.meta.url)));
test('each current pile has one outline despite the generator sorting order',()=>{
  const linked=associatePileOutlines(D.piles,D.pile_outlines);
  assert.equal(linked.filter(Boolean).length,30);assert.equal(new Set(linked.map(p=>p.id)).size,30);
});
test('polygon picking accepts boundaries and rejects nearby empty ground',()=>{
  const ring=[[0,0],[20,0],[20,20],[0,20],[0,0]];
  assert.ok(pointInRing(10,10,ring));assert.ok(pointInRing(0,10,ring));assert.ok(!pointInRing(21,10,ring));
});
test('ambiguous outline identity is rejected',()=>{
  const ring=[[0,0],[20,0],[20,20],[0,20],[0,0]];
  assert.deepEqual(associatePileOutlines([{id:1,x:10,y:10}],[ring,ring]),[null,null]);
});
test('horizontal distance, height and spatial distance do not change with exaggerated display height',()=>{
  for(const vx of [1,3,10]){
    const a=physicalPoint({x:0,y:0,z:10*vx},vx),b=physicalPoint({x:3,y:4,z:22*vx},vx);
    assert.deepEqual(surveyDistance(a,b),{horizontal:5,dz:12,spatial:13});
  }
  assert.throws(()=>physicalPoint({x:0,y:0,z:0},0),RangeError);
});
test('plan scale bar uses real metres and pixel density',()=>{
  for(const ppm of [.02,.15,1,4,20]){
    const bar=niceScaleBar(ppm);assert.ok(bar.pixels<=100.0001 && bar.pixels>=20);
    assert.equal(bar.pixels,bar.metres*ppm);
  }
  assert.equal(niceScaleBar(0),null);
});
