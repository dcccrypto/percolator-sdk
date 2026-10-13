/**
 * Test helper: stamp the 16-byte wrapper header (and, for portfolios, the engine provenance version +
 * layout discriminator) onto a synthetic buffer, so decoders that now run the VERSION / discriminator
 * guard (src/abi/layout.ts) accept it. `version` defaults to 18 (v2.1); pass 19 for v2.2.
 */
export function stampHeader(buf: Uint8Array, kind: number, version = 18, discriminator?: number): Uint8Array {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  v.setBigUint64(0, 0x5045_5243_5631_3600n, true);
  v.setUint16(8, version, true);
  buf[10] = kind;
  if (kind === 2) {
    v.setUint16(112, 1, true);
    v.setUint16(114, discriminator ?? version, true);
  }
  return buf;
}
export const stampMarket = (buf: Uint8Array, version = 18): Uint8Array => stampHeader(buf, 1, version);
export const stampPortfolio = (buf: Uint8Array, version = 18): Uint8Array => stampHeader(buf, 2, version);
