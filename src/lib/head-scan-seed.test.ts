import { describe, it, expect } from "vitest";
import { detectAtSeed } from "@/lib/head-scan-detect";
function multi(w:number,h:number,objs:Array<{x:number;y:number;r:number;c:[number,number,number]}>,bg:[number,number,number]=[40,110,50]){
  const d=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;let c=bg;
    for(const o of objs) if(Math.hypot(x-o.x,y-o.y)<=o.r){c=o.c;break;}
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}
  return {data:d,w,h};
}
describe("seed detection",()=>{
  it("finds jack radius from a rough tap",()=>{
    const buf=multi(400,300,[{x:200,y:150,r:10,c:[245,245,240]}]);
    const d=detectAtSeed(buf,{x:203/400,y:152/300},"jack");
    expect(d.r*400).toBeGreaterThan(6); expect(d.r*400).toBeLessThan(15);
    expect(Math.abs(d.cx*400-200)).toBeLessThan(6);
  });
  it("finds the tapped bowl of two touching bowls",()=>{
    const buf=multi(400,300,[{x:170,y:150,r:24,c:[30,30,34]},{x:218,y:150,r:24,c:[110,25,25]}]);
    const d=detectAtSeed(buf,{x:220/400,y:150/300},"bowl",10/400);
    expect(Math.abs(d.cx*400-218)).toBeLessThan(20);
    expect(d.r*400).toBeLessThan(45);
  });
});

describe("locked objects",()=>{
  const jack={kind:"jack" as const,cx:200/400,cy:150/300,r:10/400};
  it("blocks a tap on the confirmed jack",()=>{
    const buf=multi(400,300,[{x:200,y:150,r:10,c:[245,245,240]}]);
    const d=detectAtSeed(buf,{x:201/400,y:150/300},"bowl",10/400,[jack]);
    expect(d.blocked).toBe("jack");
  });
  it("does not recentre a nearby bowl onto the jack",()=>{
    const buf=multi(400,300,[{x:200,y:150,r:10,c:[245,245,240]},{x:236,y:150,r:24,c:[30,30,34]}]);
    const d=detectAtSeed(buf,{x:238/400,y:150/300},"bowl",10/400,[jack]);
    expect(d.blocked).toBeUndefined();
    expect(Math.hypot(d.cx*400-200,d.cy*300-150)).toBeGreaterThan(12);
  });
  it("blocks a tap on an already accepted bowl",()=>{
    const buf=multi(400,300,[{x:170,y:150,r:24,c:[30,30,34]}]);
    const d=detectAtSeed(buf,{x:170/400,y:150/300},"bowl",10/400,[jack,{kind:"bowl" as const,cx:170/400,cy:150/300,r:24/400,idx:1}]);
    expect(d.blocked).toBe("bowl"); expect(d.blockedIdx).toBe(1);
  });
});
