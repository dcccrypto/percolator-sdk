import fs from "node:fs";
const raw = fs.readFileSync("/tmp/dm/vec.json","utf8");
const p2 = [...raw.slice(raw.indexOf('"plus2":[[')+9, raw.indexOf('],"reserve"')+1).matchAll(/\[(\d+),(\d+)\]/g)].map(m=>[m[1],m[2]]);
// keep: first 3000, all with r>=2^32 sampled every 60th plus all <=2^63 edges (deltas) => take every non-small entry stride 40
const keep = p2.filter((x,i)=> i<3000 || (i>1_000_000 && (i<1_000_400 || i%200===0)) || i%9973===0);
const rs = [...raw.slice(raw.indexOf('"reserve":[')+10).matchAll(/\[(\d+),(\d+),(\d+),(\d+),0,\s*(null|"\d+")\]/g)]
  .map(m=>[m[1],m[2],+m[3],+m[4],m[5]==="null"?null:m[5].slice(1,-1)]);
const rk = rs.filter((r,i)=> r[0]!=="0" || i%7===0).filter((r,i)=> i%2===0 || r[4]===null);
fs.writeFileSync("fixtures/depth-math-vectors-d27f3d73.json", JSON.stringify({prog:"percolator-prog feat/v22-rc23-2026-10-22 d27f3d73 src/depth_src_v22.rs 505-590",lotExpMax:15,plus2:keep,reserve:rk}));
console.log(p2.length, keep.length, rs.length, rk.length, rs.filter(r=>r[4]===null).length);
