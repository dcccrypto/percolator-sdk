//! Decode oracle for the SDK wire table. Copy into a checkout of percolator-prog as
//! `src/bin/sdk_wire_table_parity.rs` (never commit it there) and run:
//!   cargo run -j 4 --quiet --bin sdk_wire_table_parity -- wire-vectors.txt
//! Prints `<id> OK <variant> reencode=<same|DIFF>` or `<id> ERR <error>` using the real `Instruction::decode`/`encode`.
use percolator_prog::ix::Instruction as I;

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn main() {
    let path = std::env::args().nth(1).expect("wire-vectors.txt");
    for line in std::fs::read_to_string(path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let (id, h) = (it.next().unwrap(), it.next().unwrap());
        let bytes = unhex(h);
        match I::decode(&bytes) {
            Ok(ix) => {
                let dbg = format!("{ix:?}");
                let name = dbg.split(|c: char| c == ' ' || c == '{' || c == '(').next().unwrap_or("").to_string();
                let same = if ix.encode() == bytes { "same" } else { "DIFF" };
                println!("{id} OK {name} reencode={same}");
            }
            Err(e) => println!("{id} ERR {e:?}"),
        }
    }
}
