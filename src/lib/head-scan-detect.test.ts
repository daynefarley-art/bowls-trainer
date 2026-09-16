import { describe, it, expect } from "vitest";
import { findCircularBlobs } from "@/lib/head-scan-detect";

function scene(w:number,h:number,cx:number,cy:number,r:number,color:[number,number,number],bg:[number,number,number]=[40,110,50]){
  const d=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4; const inside=Math.hypot(x-cx,y-cy)<=r; const c=inside?color:bg;
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;
  }
  return d;
}
const accept=(hsv:any,vRef:number)=>{
  const bright=hsv.v>=Math.max(0.55,vRef*1.18);
  if(!bright)return false;
  if(hsv.h>=80&&hsv.h<=200&&hsv.s>0.22)return false;
  return hsv.s<=0.22||(hsv.h>=35&&hsv.h<=75&&hsv.s>0.22);
};
const run=(d:Uint8ClampedArray,w=320,h=240)=>findCircularBlobs(d,w,h,{accept,minAreaFrac:0.0004,maxAreaFrac:0.06});

describe("jack detection",()=>{
  it("A white jack on green",()=>{const c=run(scene(320,240,160,120,13,[245,245,240]))[0];
    expect(c.confidence).toBeGreaterThan(0.55); expect(Math.abs(c.cx-0.5)).toBeLessThan(0.02);});
  it("B yellow jack",()=>{const c=run(scene(320,240,160,120,13,[240,215,60]))[0];
    expect(c.confidence).toBeGreaterThan(0.55);});
  it("C small jack",()=>{const c=run(scene(320,240,200,90,7,[245,245,240]))[0];
    expect(c).toBeTruthy(); expect(Math.abs(c.cy-90/240)).toBeLessThan(0.03);});
  it("D near edge",()=>{const c=run(scene(320,240,12,120,11,[245,245,240]))[0];
    expect(c).toBeTruthy(); expect(c.cx).toBeLessThan(0.1);});
  it("E shade",()=>{const c=run(scene(320,240,160,120,13,[170,170,160],[18,50,22]))[0];
    expect(c.confidence).toBeGreaterThan(0.5);});
  it("no jack -> nothing confident",()=>{const d=scene(320,240,0,0,0,[0,0,0]);
    const cs=run(d); expect(cs.filter(c=>c.confidence>=0.55).length).toBe(0);});
});

// ---- bowl candidate detection ----
import { findCircularBlobs as fcb, isBowlColour } from "@/lib/head-scan-detect";

function multi(w:number,h:number,objs:Array<{x:number;y:number;r:number;c:[number,number,number]}>,bg:[number,number,number]=[40,110,50]){
  const d=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4; let c=bg;
    for(const o of objs) if(Math.hypot(x-o.x,y-o.y)<=o.r){c=o.c;break;}
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;
  }
  return d;
}
const bowlRun=(d:Uint8ClampedArray,w=320,h=240)=>fcb(d,w,h,{accept:isBowlColour,minAreaFrac:0.0008,maxAreaFrac:0.14,sizeRange:[0.035,0.14]});

describe("bowl candidate detection",()=>{
  it("finds dark bowls on green and ignores the green surface",()=>{
    const d=multi(320,240,[
      {x:100,y:100,r:22,c:[30,30,32]},
      {x:210,y:150,r:24,c:[120,25,25]},
      {x:160,y:120,r:8,c:[245,245,240]},
    ]);
    const cs=bowlRun(d).filter(c=>c.confidence>=0.34);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    const near=(x:number,y:number)=>cs.some(c=>Math.abs(c.cx-x/320)<0.04&&Math.abs(c.cy-y/240)<0.05);
    expect(near(100,100)).toBe(true);
    expect(near(210,150)).toBe(true);
  });
  it("plain green surface yields no bowl candidates",()=>{
    const cs=bowlRun(multi(320,240,[])).filter(c=>c.confidence>=0.34);
    expect(cs.length).toBe(0);
  });
});
