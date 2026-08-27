import { PublicKey } from "@solana/web3.js";

const textEncoder = new TextEncoder();

export function deriveKeeperFund(programId, slab) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("keeper_fund"), slab.toBytes()],
    programId,
  );
}