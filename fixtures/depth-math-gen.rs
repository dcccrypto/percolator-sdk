use std::fmt::Write;
include!("depth-math-prog-d27f3d73.rs");
fn main(){
  let mut o=String::new();
  let mut rs:Vec<u64>=(0..=1_000_000u64).collect();
  let edges:[u64;6]=[0,1,2,1<<32,1<<52,1<<63];
  for e in edges.iter().chain(&[u64::MAX]) { for d in [0i64,-1,1,2,3,-2,-3,1000,-1000] { let v=(*e as i128+d as i128); if v>=0 && v<=u64::MAX as i128 {rs.push(v as u64);} } }
  for k in 1..64 { let p=1u64<<k; rs.push(p); rs.push(p-1); rs.push(p.saturating_add(1)); }
  let mut s:u64=0x9E3779B97F4A7C15;
  for _ in 0..200000 { s^=s<<13; s^=s>>7; s^=s<<17; rs.push(s); let sh=(s>>58) as u32; rs.push((s>>(sh)) ); }
  o.push_str("{\"plus2\":[");
  for (i,r) in rs.iter().enumerate(){ if i>0{o.push(',');} write!(o,"[{},{}]",r,plus2pct_depth_e6(*r)).unwrap(); }
  o.push_str("],\"reserve\":[");
  let atoms:[u64;6]=[0,1,123456789,1<<52,u64::MAX,171449177380421];
  let marks:[u64;6]=[0,1,12_000_000,1<<40,u64::MAX,999_999];
  let mut first=true;
  for bd in 0u8..=20 { for le in 0u8..=17 { for &a in &atoms { for &m in &marks {
    let r=reserve_value_e6(ValuePath::BaseAtMark,a,777,m,bd,le);
    if !first{o.push(',');} first=false;
    match r { Some(v)=>write!(o,"[{},{},{},{},{}, \"{}\"]",a,m,bd,le,0,v).unwrap(), None=>write!(o,"[{},{},{},{},{},null]",a,m,bd,le,0).unwrap() }
  }}}}
  o.push_str("]}");
  print!("{}",o);
}
