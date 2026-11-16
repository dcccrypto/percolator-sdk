/**
 * Single-buffer instruction-data writer.
 *
 * Replaces `concatBytes(encU8(..), encU64(..), ...)` (one small Uint8Array +
 * DataView per field, then a concat copy) with one preallocated buffer and
 * one DataView. Output bytes are identical to the encU* composition.
 *
 * Validation parity: the fast path only handles inputs that are already
 * valid (in-range bigint / integer number). Anything else is delegated to the
 * original encU* function, which either throws the exact same error or
 * normalises a decimal string — so error behaviour is unchanged too.
 *
 * @internal
 */
import { encU8, encU16, encU64, encU128, encI128 } from "./encode.js";

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const U128_MAX = (1n << 128n) - 1n;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;
const MASK64 = 0xffff_ffff_ffff_ffffn;

export class FastWriter {
  readonly buf: Uint8Array;
  private readonly view: DataView;
  private off = 0;

  constructor(size: number) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }

  u8(val: number): this {
    if (Number.isInteger(val) && val >= 0 && val <= 0xff) {
      this.buf[this.off++] = val;
    } else {
      this.buf.set(encU8(val), this.off++);
    }
    return this;
  }

  u16(val: number): this {
    if (Number.isInteger(val) && val >= 0 && val <= 0xffff) {
      this.view.setUint16(this.off, val, true);
    } else {
      this.buf.set(encU16(val), this.off);
    }
    this.off += 2;
    return this;
  }

  u64(val: bigint | string): this {
    if (typeof val === "bigint" && val >= 0n && val <= U64_MAX) {
      this.view.setBigUint64(this.off, val, true);
    } else {
      this.buf.set(encU64(val), this.off);
    }
    this.off += 8;
    return this;
  }

  u128(val: bigint | string): this {
    if (typeof val === "bigint" && val >= 0n && val <= U128_MAX) {
      this.view.setBigUint64(this.off, val & MASK64, true);
      this.view.setBigUint64(this.off + 8, val >> 64n, true);
    } else {
      this.buf.set(encU128(val), this.off);
    }
    this.off += 16;
    return this;
  }

  i128(val: bigint | string): this {
    if (typeof val === "bigint" && val >= I128_MIN && val <= I128_MAX) {
      const unsigned = val < 0n ? (1n << 128n) + val : val;
      this.view.setBigUint64(this.off, unsigned & MASK64, true);
      this.view.setBigUint64(this.off + 8, unsigned >> 64n, true);
    } else {
      this.buf.set(encI128(val), this.off);
    }
    this.off += 16;
    return this;
  }
}
