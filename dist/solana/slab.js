import { PublicKey } from "@solana/web3.js";
function dv(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function readU8(data, off) {
  if (off >= data.length) {
    throw new RangeError(`readU8: offset ${off} out of bounds (length ${data.length})`);
  }
  return data[off];
}
function readU16LE(data, off) {
  return dv(data).getUint16(off, true);
}
function readU32LE(data, off) {
  return dv(data).getUint32(off, true);
}
function readU64LE(data, off) {
  return dv(data).getBigUint64(off, true);
}
function readI64LE(data, off) {
  return dv(data).getBigInt64(off, true);
}
function readI128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  const unsigned = hi << 64n | lo;
  const SIGN_BIT = 1n << 127n;
  if (unsigned >= SIGN_BIT) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}
function readU128LE(buf, offset) {
  const lo = readU64LE(buf, offset);
  const hi = readU64LE(buf, offset + 8);
  return hi << 64n | lo;
}
const MAGIC = 0x504552434f4c4154n;
const SLAB_MAGIC = MAGIC;
const FLAG_RESOLVED = 1 << 0;
const V0_HEADER_LEN = 72;
const V0_CONFIG_LEN = 408;
const V0_ENGINE_OFF = 480;
const V0_ACCOUNT_SIZE = 240;
const V0_RESERVED_OFF = 48;
const V0_ENGINE_PARAMS_OFF = 48;
const V0_PARAMS_SIZE = 56;
const V0_ENGINE_CURRENT_SLOT_OFF = 104;
const V0_ENGINE_FUNDING_INDEX_OFF = 112;
const V0_ENGINE_LAST_FUNDING_SLOT_OFF = 128;
const V0_ENGINE_FUNDING_RATE_BPS_OFF = 136;
const V0_ENGINE_LAST_CRANK_SLOT_OFF = 144;
const V0_ENGINE_MAX_CRANK_STALENESS_OFF = 152;
const V0_ENGINE_TOTAL_OI_OFF = 160;
const V0_ENGINE_C_TOT_OFF = 176;
const V0_ENGINE_PNL_POS_TOT_OFF = 192;
const V0_ENGINE_LIQ_CURSOR_OFF = 208;
const V0_ENGINE_GC_CURSOR_OFF = 210;
const V0_ENGINE_LAST_SWEEP_START_OFF = 216;
const V0_ENGINE_LAST_SWEEP_COMPLETE_OFF = 224;
const V0_ENGINE_CRANK_CURSOR_OFF = 232;
const V0_ENGINE_SWEEP_START_IDX_OFF = 234;
const V0_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 240;
const V0_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 248;
const V0_ENGINE_NET_LP_POS_OFF = 256;
const V0_ENGINE_LP_SUM_ABS_OFF = 272;
const V0_ENGINE_LP_MAX_ABS_OFF = 288;
const V0_ENGINE_LP_MAX_ABS_SWEEP_OFF = 304;
const V0_ENGINE_BITMAP_OFF = 320;
const V1_HEADER_LEN = 104;
const V1_CONFIG_LEN = 496;
const V1_ENGINE_OFF = 600;
const V1_ENGINE_OFF_LEGACY = 640;
const V1_ACCOUNT_SIZE = 248;
const V1_RESERVED_OFF = 80;
const V1_ENGINE_PARAMS_OFF = 72;
const V1_PARAMS_SIZE = 288;
const V1_ENGINE_CURRENT_SLOT_OFF = 360;
const V1_ENGINE_FUNDING_INDEX_OFF = 368;
const V1_ENGINE_LAST_FUNDING_SLOT_OFF = 384;
const V1_ENGINE_FUNDING_RATE_BPS_OFF = 392;
const V1_ENGINE_MARK_PRICE_OFF = 400;
const V1_ENGINE_LAST_CRANK_SLOT_OFF = 424;
const V1_ENGINE_MAX_CRANK_STALENESS_OFF = 432;
const V1_ENGINE_TOTAL_OI_OFF = 440;
const V1_ENGINE_LONG_OI_OFF = 456;
const V1_ENGINE_SHORT_OI_OFF = 472;
const V1_ENGINE_C_TOT_OFF = 488;
const V1_ENGINE_PNL_POS_TOT_OFF = 504;
const V1_ENGINE_LIQ_CURSOR_OFF = 520;
const V1_ENGINE_GC_CURSOR_OFF = 522;
const V1_ENGINE_LAST_SWEEP_START_OFF = 528;
const V1_ENGINE_LAST_SWEEP_COMPLETE_OFF = 536;
const V1_ENGINE_CRANK_CURSOR_OFF = 544;
const V1_ENGINE_SWEEP_START_IDX_OFF = 546;
const V1_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 552;
const V1_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 560;
const V1_ENGINE_NET_LP_POS_OFF = 568;
const V1_ENGINE_LP_SUM_ABS_OFF = 584;
const V1_ENGINE_LP_MAX_ABS_OFF = 600;
const V1_ENGINE_LP_MAX_ABS_SWEEP_OFF = 616;
const V1_ENGINE_EMERGENCY_OI_MODE_OFF = 632;
const V1_ENGINE_EMERGENCY_START_SLOT_OFF = 640;
const V1_ENGINE_LAST_BREAKER_SLOT_OFF = 648;
const V1_ENGINE_BITMAP_OFF = 656;
const V1_LEGACY_ENGINE_BITMAP_OFF_ACTUAL = 672;
const V1_LEGACY_ACCT_OWNER_OFF = 200;
const V1D_CONFIG_LEN = 320;
const V1D_ENGINE_OFF = 424;
const V1D_ACCOUNT_SIZE = 248;
const V1D_ENGINE_INSURANCE_OFF = 16;
const V1D_ENGINE_PARAMS_OFF = 96;
const V1D_PARAMS_SIZE = 288;
const V1D_ENGINE_CURRENT_SLOT_OFF = 384;
const V1D_ENGINE_FUNDING_INDEX_OFF = 392;
const V1D_ENGINE_LAST_FUNDING_SLOT_OFF = 408;
const V1D_ENGINE_FUNDING_RATE_BPS_OFF = 416;
const V1D_ENGINE_MARK_PRICE_OFF = 424;
const V1D_ENGINE_LAST_CRANK_SLOT_OFF = 448;
const V1D_ENGINE_MAX_CRANK_STALENESS_OFF = 456;
const V1D_ENGINE_TOTAL_OI_OFF = 464;
const V1D_ENGINE_LONG_OI_OFF = 480;
const V1D_ENGINE_SHORT_OI_OFF = 496;
const V1D_ENGINE_C_TOT_OFF = 512;
const V1D_ENGINE_PNL_POS_TOT_OFF = 528;
const V1D_ENGINE_LIQ_CURSOR_OFF = 544;
const V1D_ENGINE_GC_CURSOR_OFF = 546;
const V1D_ENGINE_LAST_SWEEP_START_OFF = 552;
const V1D_ENGINE_LAST_SWEEP_COMPLETE_OFF = 560;
const V1D_ENGINE_CRANK_CURSOR_OFF = 568;
const V1D_ENGINE_SWEEP_START_IDX_OFF = 570;
const V1D_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 576;
const V1D_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 584;
const V1D_ENGINE_NET_LP_POS_OFF = 592;
const V1D_ENGINE_LP_SUM_ABS_OFF = 608;
const V1D_ENGINE_BITMAP_OFF = 624;
const V2_HEADER_LEN = 104;
const V2_CONFIG_LEN = 496;
const V2_ENGINE_OFF = 600;
const V2_ACCOUNT_SIZE = 248;
const V2_ENGINE_BITMAP_OFF = 432;
const V2_ENGINE_CURRENT_SLOT_OFF = 352;
const V2_ENGINE_FUNDING_INDEX_OFF = 360;
const V2_ENGINE_LAST_FUNDING_SLOT_OFF = 376;
const V2_ENGINE_FUNDING_RATE_BPS_OFF = 384;
const V2_ENGINE_LAST_CRANK_SLOT_OFF = 392;
const V2_ENGINE_MAX_CRANK_STALENESS_OFF = 400;
const V2_ENGINE_TOTAL_OI_OFF = 408;
const V2_ENGINE_C_TOT_OFF = 424;
const V2_ENGINE_PNL_POS_TOT_OFF = 440;
const V2_ENGINE_LIQ_CURSOR_OFF = 456;
const V2_ENGINE_GC_CURSOR_OFF = 458;
const V2_ENGINE_LAST_SWEEP_START_OFF = 464;
const V2_ENGINE_LAST_SWEEP_COMPLETE_OFF = 472;
const V2_ENGINE_CRANK_CURSOR_OFF = 480;
const V2_ENGINE_SWEEP_START_IDX_OFF = 482;
const V2_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 488;
const V2_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 496;
const V2_ENGINE_NET_LP_POS_OFF = 504;
const V2_ENGINE_LP_SUM_ABS_OFF = 520;
const V2_ENGINE_LP_MAX_ABS_OFF = 536;
const V2_ENGINE_LP_MAX_ABS_SWEEP_OFF = 552;
const V_ADL_ENGINE_OFF = 624;
const V_ADL_CONFIG_LEN = 520;
const V_SETDEXPOOL_CONFIG_LEN = 544;
const V_SETDEXPOOL_ENGINE_OFF = 648;
const V_ADL_ACCOUNT_SIZE = 312;
const V_ADL_ENGINE_PARAMS_OFF = 96;
const V_ADL_PARAMS_SIZE = 336;
const V_ADL_ENGINE_CURRENT_SLOT_OFF = 432;
const V_ADL_ENGINE_FUNDING_INDEX_OFF = 440;
const V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF = 456;
const V_ADL_ENGINE_FUNDING_RATE_BPS_OFF = 464;
const V_ADL_ENGINE_MARK_PRICE_OFF = 504;
const V_ADL_ENGINE_LAST_CRANK_SLOT_OFF = 528;
const V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF = 536;
const V_ADL_ENGINE_TOTAL_OI_OFF = 544;
const V_ADL_ENGINE_LONG_OI_OFF = 560;
const V_ADL_ENGINE_SHORT_OI_OFF = 576;
const V_ADL_ENGINE_C_TOT_OFF = 592;
const V_ADL_ENGINE_PNL_POS_TOT_OFF = 608;
const V_ADL_ENGINE_LIQ_CURSOR_OFF = 640;
const V_ADL_ENGINE_GC_CURSOR_OFF = 642;
const V_ADL_ENGINE_LAST_SWEEP_START_OFF = 648;
const V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF = 656;
const V_ADL_ENGINE_CRANK_CURSOR_OFF = 664;
const V_ADL_ENGINE_SWEEP_START_IDX_OFF = 666;
const V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 672;
const V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 680;
const V_ADL_ENGINE_NET_LP_POS_OFF = 904;
const V_ADL_ENGINE_LP_SUM_ABS_OFF = 920;
const V_ADL_ENGINE_LP_MAX_ABS_OFF = 936;
const V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF = 952;
const V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF = 968;
const V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF = 976;
const V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF = 984;
const V_ADL_ENGINE_BITMAP_OFF = 1008;
const V_ADL_ACCT_WARMUP_STARTED_OFF = 64;
const V_ADL_ACCT_WARMUP_SLOPE_OFF = 72;
const V_ADL_ACCT_POSITION_SIZE_OFF = 88;
const V_ADL_ACCT_ENTRY_PRICE_OFF = 104;
const V_ADL_ACCT_FUNDING_INDEX_OFF = 112;
const V_ADL_ACCT_MATCHER_PROGRAM_OFF = 128;
const V_ADL_ACCT_MATCHER_CONTEXT_OFF = 160;
const V_ADL_ACCT_OWNER_OFF = 192;
const V_ADL_ACCT_FEE_CREDITS_OFF = 224;
const V_ADL_ACCT_LAST_FEE_SLOT_OFF = 240;
const V12_1_ENGINE_OFF = 648;
const V12_1_ACCOUNT_SIZE = 320;
const V12_1_ACCOUNT_SIZE_SBF = 280;
const V12_1_ENGINE_BITMAP_OFF = 1016;
const V12_1_ENGINE_PARAMS_OFF_SBF = 32;
const V12_1_ENGINE_PARAMS_OFF_HOST = 96;
const V12_1_ENGINE_PARAMS_OFF = 96;
const V12_1_PARAMS_SIZE_SBF = 184;
const V12_1_PARAMS_SIZE = 352;
const V12_1_SBF_OFF_CURRENT_SLOT = 216;
const V12_1_SBF_OFF_FUNDING_RATE = 224;
const V12_1_SBF_OFF_LAST_CRANK_SLOT = 232;
const V12_1_SBF_OFF_MAX_CRANK_STALENESS = 240;
const V12_1_SBF_OFF_C_TOT = 248;
const V12_1_SBF_OFF_PNL_POS_TOT = 264;
const V12_1_SBF_OFF_LIQ_CURSOR = 296;
const V12_1_SBF_OFF_GC_CURSOR = 298;
const V12_1_SBF_OFF_LAST_SWEEP_START = 304;
const V12_1_SBF_OFF_LAST_SWEEP_COMPLETE = 312;
const V12_1_SBF_OFF_CRANK_CURSOR = 320;
const V12_1_SBF_OFF_SWEEP_START_IDX = 322;
const V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS = 328;
const V12_1_SBF_OFF_TOTAL_OI = 448;
const V12_1_SBF_OFF_LONG_OI = 464;
const V12_1_SBF_OFF_SHORT_OI = 480;
const V12_1_SBF_OFF_MARK_PRICE_E6 = 560;
const V12_1_SBF_OFF_MARK_PRICE_SLOT = 568;
const V12_1_SBF_OFF_EFFECTIVE_PRICE_E6 = 576;
const V12_1_ENGINE_CURRENT_SLOT_OFF = 448;
const V12_1_ENGINE_FUNDING_RATE_BPS_OFF = 456;
const V12_1_ENGINE_LAST_CRANK_SLOT_OFF = 464;
const V12_1_ENGINE_MAX_CRANK_STALENESS_OFF = 472;
const V12_1_ENGINE_C_TOT_OFF = 480;
const V12_1_ENGINE_PNL_POS_TOT_OFF = 496;
const V12_1_ENGINE_LIQ_CURSOR_OFF = 528;
const V12_1_ENGINE_GC_CURSOR_OFF = 530;
const V12_1_ENGINE_LAST_SWEEP_START_OFF = 536;
const V12_1_ENGINE_LAST_SWEEP_COMPLETE_OFF = 544;
const V12_1_ENGINE_CRANK_CURSOR_OFF = 552;
const V12_1_ENGINE_SWEEP_START_IDX_OFF = 554;
const V12_1_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 560;
const V12_1_ENGINE_TOTAL_OI_OFF = 816;
const V12_1_ENGINE_LONG_OI_OFF = 832;
const V12_1_ENGINE_SHORT_OI_OFF = 848;
const V12_1_ENGINE_NET_LP_POS_OFF = 864;
const V12_1_ENGINE_LP_SUM_ABS_OFF = 880;
const V12_1_ENGINE_LP_MAX_ABS_OFF = 896;
const V12_1_ENGINE_LP_MAX_ABS_SWEEP_OFF = 912;
const V12_1_ENGINE_MARK_PRICE_OFF = 928;
const V12_1_ENGINE_FUNDING_INDEX_OFF = 936;
const V12_1_ENGINE_LAST_FUNDING_SLOT_OFF = 944;
const V12_1_ENGINE_EMERGENCY_OI_MODE_OFF = 968;
const V12_1_ENGINE_EMERGENCY_START_SLOT_OFF = 976;
const V12_1_ENGINE_LAST_BREAKER_SLOT_OFF = 984;
const V12_1_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 1008;
const V12_1_ACCT_MATCHER_PROGRAM_OFF = 144;
const V12_1_ACCT_MATCHER_CONTEXT_OFF = 176;
const V12_1_ACCT_OWNER_OFF = 208;
const V12_1_ACCT_FEE_CREDITS_OFF = 240;
const V12_1_ACCT_LAST_FEE_SLOT_OFF = 256;
const V12_1_ACCT_POSITION_SIZE_OFF = 88;
const V12_1_ACCT_ENTRY_PRICE_OFF = -1;
const V12_1_ACCT_FUNDING_INDEX_OFF = -1;
const V12_1_EP_SBF_ACCOUNT_SIZE = 288;
const V12_1_EP_ACCT_ENTRY_PRICE_OFF = 144;
const V12_1_EP_ACCT_MATCHER_PROGRAM_OFF = 152;
const V12_1_EP_ACCT_MATCHER_CONTEXT_OFF = 184;
const V12_1_EP_ACCT_OWNER_OFF = 216;
const V12_1_EP_ACCT_FEE_CREDITS_OFF = 248;
const V12_1_EP_ACCT_LAST_FEE_SLOT_OFF = 264;
const V12_15_ENGINE_OFF = 624;
const V12_15_ENGINE_OFF_SBF = 616;
const V12_15_ACCOUNT_SIZE = 4400;
const V12_15_ACCOUNT_SIZE_SMALL = 920;
const V12_15_DEFAULT_MAX_ACCOUNTS = 2048;
const V12_15_ACCT_ACCOUNT_ID_OFF = 0;
const V12_15_ACCT_CAPITAL_OFF = 8;
const V12_15_ACCT_KIND_OFF = 24;
const V12_15_ACCT_PNL_OFF = 32;
const V12_15_ACCT_RESERVED_PNL_OFF = 48;
const V12_15_ACCT_POSITION_BASIS_Q_OFF = 64;
const V12_15_ACCT_ADL_A_BASIS_OFF = 80;
const V12_15_ACCT_ADL_K_SNAP_OFF = 96;
const V12_15_ACCT_ADL_EPOCH_SNAP_OFF = 112;
const V12_15_ACCT_ENTRY_PRICE_OFF = 120;
const V12_15_ACCT_MATCHER_PROGRAM_OFF = 128;
const V12_15_ACCT_MATCHER_CONTEXT_OFF = 160;
const V12_15_ACCT_OWNER_OFF = 192;
const V12_15_ACCT_FEE_CREDITS_OFF = 224;
const V12_15_ACCT_FEES_EARNED_TOTAL_OFF = 240;
const V12_15_ACCT_EXACT_RESERVE_COHORTS_OFF = 256;
const V12_15_ACCT_EXACT_COHORT_COUNT_OFF = 4224;
const V12_15_ACCT_OVERFLOW_OLDER_OFF = 4240;
const V12_15_ACCT_OVERFLOW_OLDER_PRESENT_OFF = 4304;
const V12_15_ACCT_OVERFLOW_NEWEST_OFF = 4320;
const V12_15_ACCT_OVERFLOW_NEWEST_PRESENT_OFF = 4384;
const V12_15_PARAMS_SIZE = 192;
const V12_15_PARAMS_MAX_ACCOUNTS_OFF = 24;
const V12_15_PARAMS_INSURANCE_FLOOR_OFF = 144;
const V12_15_PARAMS_H_MIN_OFF = 160;
const V12_15_PARAMS_H_MAX_OFF = 168;
const V12_15_ENGINE_PARAMS_OFF = 32;
const V12_15_ENGINE_CURRENT_SLOT_OFF = 224;
const V12_15_ENGINE_FUNDING_RATE_E9_OFF = 240;
const V12_15_ENGINE_MARKET_MODE_OFF = 256;
const V12_15_ENGINE_C_TOT_OFF = 344;
const V12_15_ENGINE_PNL_POS_TOT_OFF = 368;
const V12_15_ENGINE_PNL_MATURED_POS_TOT_OFF = 384;
const V12_15_ENGINE_BITMAP_OFF = 862;
const V12_15_SIZES = /* @__PURE__ */ new Map();
const V12_17_ENGINE_OFF = 592;
const V12_17_ACCOUNT_SIZE = 368;
const V12_17_ENGINE_BITMAP_OFF = 752;
const V12_17_DEFAULT_MAX_ACCOUNTS = 4096;
const V12_17_RISK_BUF_LEN = 160;
const V12_17_GEN_TABLE_ENTRY = 8;
const V12_17_ENGINE_OFF_SBF = 584;
const V12_17_ACCOUNT_SIZE_SBF = 352;
const V12_17_ENGINE_BITMAP_OFF_SBF = 712;
const V12_17_ACCT_CAPITAL_OFF = 0;
const V12_17_ACCT_KIND_OFF = 16;
const V12_17_ACCT_PNL_OFF = 32;
const V12_17_ACCT_RESERVED_PNL_OFF = 48;
const V12_17_ACCT_POSITION_BASIS_Q_OFF = 64;
const V12_17_ACCT_ADL_A_BASIS_OFF = 80;
const V12_17_ACCT_ADL_K_SNAP_OFF = 96;
const V12_17_ACCT_F_SNAP_OFF = 112;
const V12_17_ACCT_ADL_EPOCH_SNAP_OFF = 128;
const V12_17_ACCT_MATCHER_PROGRAM_OFF = 136;
const V12_17_ACCT_MATCHER_CONTEXT_OFF = 168;
const V12_17_ACCT_OWNER_OFF = 200;
const V12_17_ACCT_FEE_CREDITS_OFF = 232;
const V12_17_ACCT_SCHED_PRESENT_OFF = 248;
const V12_17_ACCT_SCHED_REMAINING_Q_OFF = 256;
const V12_17_ACCT_SCHED_ANCHOR_Q_OFF = 272;
const V12_17_ACCT_SCHED_START_SLOT_OFF = 288;
const V12_17_ACCT_SCHED_HORIZON_OFF = 296;
const V12_17_ACCT_SCHED_RELEASE_Q_OFF = 304;
const V12_17_ACCT_PENDING_PRESENT_OFF = 320;
const V12_17_ACCT_PENDING_REMAINING_Q_OFF = 336;
const V12_17_ACCT_PENDING_HORIZON_OFF = 352;
const V12_17_ACCT_PENDING_CREATED_SLOT_OFF = 360;
const V12_17_ENGINE_PARAMS_OFF = 32;
const V12_17_ENGINE_CURRENT_SLOT_OFF = 224;
const V12_17_ENGINE_MARKET_MODE_OFF = 232;
const V12_17_ENGINE_RESOLVED_PRICE_OFF = 240;
const V12_17_ENGINE_RESOLVED_K_LONG_OFF = 304;
const V12_17_ENGINE_RESOLVED_K_SHORT_OFF = 320;
const V12_17_ENGINE_RESOLVED_LIVE_PRICE_OFF = 336;
const V12_17_ENGINE_LAST_CRANK_SLOT_OFF = 344;
const V12_17_ENGINE_C_TOT_OFF = 352;
const V12_17_ENGINE_PNL_POS_TOT_OFF = 368;
const V12_17_ENGINE_PNL_MATURED_POS_TOT_OFF = 384;
const V12_17_ENGINE_GC_CURSOR_OFF = 400;
const V12_17_ENGINE_OI_EFF_LONG_OFF = 528;
const V12_17_ENGINE_OI_EFF_SHORT_OFF = 544;
const V12_17_ENGINE_NEG_PNL_COUNT_OFF = 648;
const V12_17_ENGINE_LAST_ORACLE_PRICE_OFF = 656;
const V12_17_ENGINE_FUND_PX_LAST_OFF = 664;
const V12_17_ENGINE_F_LONG_NUM_OFF = 688;
const V12_17_ENGINE_F_SHORT_NUM_OFF = 704;
const V12_17_SBF_ENGINE_CURRENT_SLOT_OFF = 216;
const V12_17_SBF_ENGINE_MARKET_MODE_OFF = 224;
const V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF = 328;
const V12_17_SBF_ENGINE_C_TOT_OFF = 336;
const V12_17_SBF_ENGINE_PNL_POS_TOT_OFF = 352;
const V12_17_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF = 368;
const V12_17_SBF_ENGINE_GC_CURSOR_OFF = 384;
const V12_17_SBF_ENGINE_OI_EFF_LONG_OFF = 504;
const V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF = 520;
const V12_17_SBF_ENGINE_NEG_PNL_COUNT_OFF = 616;
const V12_17_SBF_ENGINE_LAST_ORACLE_PRICE_OFF = 624;
const V12_17_SBF_ENGINE_FUND_PX_LAST_OFF = 632;
const V12_17_SBF_ENGINE_F_LONG_NUM_OFF = 648;
const V12_17_SBF_ENGINE_F_SHORT_NUM_OFF = 664;
const V12_17_SIZES = /* @__PURE__ */ new Map();
const V1M_ENGINE_OFF = 640;
const V1M_CONFIG_LEN = 536;
const V1M_ACCOUNT_SIZE = 248;
const V1M2_ENGINE_OFF = 616;
const V1M2_CONFIG_LEN = 512;
const V1M_ENGINE_PARAMS_OFF = 72;
const V1M2_ENGINE_PARAMS_OFF = 96;
const V1M_PARAMS_SIZE = 336;
const V1M_ENGINE_CURRENT_SLOT_OFF = 408;
const V1M_ENGINE_FUNDING_INDEX_OFF = 416;
const V1M_ENGINE_LAST_FUNDING_SLOT_OFF = 432;
const V1M_ENGINE_FUNDING_RATE_BPS_OFF = 440;
const V1M_ENGINE_MARK_PRICE_OFF = 448;
const V1M_ENGINE_LAST_CRANK_SLOT_OFF = 472;
const V1M_ENGINE_MAX_CRANK_STALENESS_OFF = 480;
const V1M_ENGINE_TOTAL_OI_OFF = 488;
const V1M_ENGINE_LONG_OI_OFF = 504;
const V1M_ENGINE_SHORT_OI_OFF = 520;
const V1M_ENGINE_C_TOT_OFF = 536;
const V1M_ENGINE_PNL_POS_TOT_OFF = 552;
const V1M_ENGINE_LIQ_CURSOR_OFF = 568;
const V1M_ENGINE_GC_CURSOR_OFF = 570;
const V1M_ENGINE_LAST_SWEEP_START_OFF = 576;
const V1M_ENGINE_LAST_SWEEP_COMPLETE_OFF = 584;
const V1M_ENGINE_CRANK_CURSOR_OFF = 592;
const V1M_ENGINE_SWEEP_START_IDX_OFF = 594;
const V1M_ENGINE_LIFETIME_LIQUIDATIONS_OFF = 600;
const V1M_ENGINE_LIFETIME_FORCE_CLOSES_OFF = 608;
const V1M_ENGINE_NET_LP_POS_OFF = 616;
const V1M_ENGINE_LP_SUM_ABS_OFF = 632;
const V1M_ENGINE_LP_MAX_ABS_OFF = 648;
const V1M_ENGINE_LP_MAX_ABS_SWEEP_OFF = 664;
const V1M_ENGINE_EMERGENCY_OI_MODE_OFF = 680;
const V1M_ENGINE_EMERGENCY_START_SLOT_OFF = 688;
const V1M_ENGINE_LAST_BREAKER_SLOT_OFF = 696;
const V1M_ENGINE_BITMAP_OFF = 720;
const V1M2_ACCOUNT_SIZE = 312;
const V1M2_ENGINE_BITMAP_OFF = 1008;
const ENGINE_OFF = V1_ENGINE_OFF;
const ENGINE_MARK_PRICE_OFF = V1_ENGINE_MARK_PRICE_OFF;
function computeSlabSize(engineOff, bitmapOff, accountSize, maxAccounts, postBitmap = 18) {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return engineOff + accountsOff + maxAccounts * accountSize;
}
const TIERS = [64, 256, 1024, 4096];
const V0_SIZES = /* @__PURE__ */ new Map();
const V1_SIZES = /* @__PURE__ */ new Map();
const V1_SIZES_LEGACY = /* @__PURE__ */ new Map();
const V1D_SIZES = /* @__PURE__ */ new Map();
const V2_SIZES = /* @__PURE__ */ new Map();
const V1M_SIZES = /* @__PURE__ */ new Map();
const V_ADL_SIZES = /* @__PURE__ */ new Map();
const V1M2_SIZES = /* @__PURE__ */ new Map();
const V_SETDEXPOOL_SIZES = /* @__PURE__ */ new Map();
const V12_1_SIZES = /* @__PURE__ */ new Map();
const V1D_SIZES_LEGACY = /* @__PURE__ */ new Map();
for (const n of TIERS) {
  V0_SIZES.set(computeSlabSize(V0_ENGINE_OFF, V0_ENGINE_BITMAP_OFF, V0_ACCOUNT_SIZE, n), n);
  V1_SIZES.set(computeSlabSize(V1_ENGINE_OFF, V1_ENGINE_BITMAP_OFF, V1_ACCOUNT_SIZE, n), n);
  V1_SIZES_LEGACY.set(computeSlabSize(V1_ENGINE_OFF_LEGACY, V1_ENGINE_BITMAP_OFF, V1_ACCOUNT_SIZE, n), n);
  V1D_SIZES.set(computeSlabSize(V1D_ENGINE_OFF, V1D_ENGINE_BITMAP_OFF, V1D_ACCOUNT_SIZE, n, 2), n);
  V1D_SIZES_LEGACY.set(computeSlabSize(V1D_ENGINE_OFF, V1D_ENGINE_BITMAP_OFF, V1D_ACCOUNT_SIZE, n, 18), n);
  V2_SIZES.set(computeSlabSize(V2_ENGINE_OFF, V2_ENGINE_BITMAP_OFF, V2_ACCOUNT_SIZE, n, 18), n);
  V1M_SIZES.set(computeSlabSize(V1M_ENGINE_OFF, V1M_ENGINE_BITMAP_OFF, V1M_ACCOUNT_SIZE, n, 18), n);
  V_ADL_SIZES.set(computeSlabSize(V_ADL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18), n);
  V1M2_SIZES.set(computeSlabSize(V1M2_ENGINE_OFF, V1M2_ENGINE_BITMAP_OFF, V1M2_ACCOUNT_SIZE, n, 18), n);
  V_SETDEXPOOL_SIZES.set(computeSlabSize(V_SETDEXPOOL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18), n);
  V12_1_SIZES.set(computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, n, 18), n);
  V12_15_SIZES.set(computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, n, 18), n);
}
V12_15_SIZES.set(computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, 2048, 18), 2048);
V12_15_SIZES.set(237512, 256);
const V12_17_TIERS = [256, 1024, 4096];
for (const n of V12_17_TIERS) {
  const bitmapWords = Math.ceil(n / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 4;
  const nextFreeBytes = n * 2;
  const preAccNative = V12_17_ENGINE_BITMAP_OFF + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffNative = Math.ceil(preAccNative / 16) * 16;
  const nativeSize = V12_17_ENGINE_OFF + accountsOffNative + n * V12_17_ACCOUNT_SIZE + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  V12_17_SIZES.set(nativeSize, n);
  const preAccSbf = V12_17_ENGINE_BITMAP_OFF_SBF + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffSbf = Math.ceil(preAccSbf / 8) * 8;
  const sbfSize = V12_17_ENGINE_OFF_SBF + accountsOffSbf + n * V12_17_ACCOUNT_SIZE_SBF + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  V12_17_SIZES.set(sbfSize, n);
}
const V12_19_HEADER_LEN_SBF = 136;
const V12_19_CONFIG_LEN = 480;
const V12_19_ENGINE_OFF_SBF = 616;
const V12_19_ACCOUNT_SIZE_SBF = 360;
const V12_19_SBF_RISK_BUF_LEN = 160;
const V12_19_SBF_GEN_TABLE_ENTRY = 8;
const V12_19_SBF_ENGINE_BITMAP_OFF = 736;
const V12_19_SBF_ENGINE_NUM_USED_OFF_S = 768;
const V12_19_SBF_ENGINE_FREE_HEAD_OFF_S = 770;
const V12_19_SBF_ENGINE_NEXT_FREE_OFF_S = 772;
const V12_19_SBF_ENGINE_PREV_FREE_OFF_S = 1284;
const V12_19_SBF_ENGINE_ACCOUNTS_OFF_S = 1800;
const V12_19_SBF_ENGINE_PARAMS_OFF = 32;
const V12_19_SBF_ENGINE_PARAMS_SIZE = 168;
const V12_19_SBF_ENGINE_CURRENT_SLOT_OFF = 200;
const V12_19_SBF_ENGINE_MARKET_MODE_OFF = 208;
const V12_19_SBF_ENGINE_RESOLVED_PRICE_OFF = 216;
const V12_19_SBF_ENGINE_RESOLVED_LIVE_PRICE_OFF = 304;
const V12_19_SBF_ENGINE_C_TOT_OFF = 312;
const V12_19_SBF_ENGINE_PNL_POS_TOT_OFF = 328;
const V12_19_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF = 344;
const V12_19_SBF_ENGINE_OI_EFF_LONG_OFF = 472;
const V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF = 488;
const V12_19_SBF_ENGINE_NEG_PNL_COUNT_OFF = 584;
const V12_19_SBF_ENGINE_RR_CURSOR_OFF = 592;
const V12_19_SBF_ENGINE_LAST_ORACLE_PRICE_OFF = 624;
const V12_19_SBF_ENGINE_FUND_PX_LAST_OFF = 632;
const V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF = 640;
const V12_19_SBF_ENGINE_F_LONG_NUM_OFF = 648;
const V12_19_SBF_ENGINE_F_SHORT_NUM_OFF = 664;
const V12_19_SBF_CONFIG_HYPERP_AUTH_OFF = 144;
const V12_19_SBF_CONFIG_LAST_EFFECTIVE_OFF = 192;
const V12_19_SBF_CONFIG_TVL_INSURANCE_CAP_OFF = 202;
const V12_19_SBF_CONFIG_ORACLE_PRICE_CAP_OFF = 216;
const V12_19_SBF_CONFIG_MIN_ORACLE_CAP_OFF = 224;
const V12_19_SBF_CONFIG_MAINTENANCE_FEE_OFF = 320;
const V12_19_SBF_CONFIG_DEX_POOL_OFF = 368;
const V12_19_SBF_CONFIG_MAX_PNL_CAP_OFF = 400;
const V12_19_SBF_CONFIG_OI_CAP_MULT_OFF = 416;
const V12_19_SBF_CONFIG_PENDING_ADMIN_OFF = 448;
const V12_19_SIZES = /* @__PURE__ */ new Map([
  [26872, 64],
  // --features micro (derived)
  [96784, 256],
  // --features small (probe-confirmed; deployed mainnet ESa89R5...)
  [376432, 1024],
  // --features medium (derived)
  [1495024, 4096]
  // default features / large (derived)
]);
function buildLayoutV12_19(maxAccounts, _dataLen) {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const numUsedOff = V12_19_SBF_ENGINE_BITMAP_OFF + bitmapBytes;
  const freeHeadOff = numUsedOff + 2;
  const nextFreeOff = freeHeadOff + 2;
  const prevFreeOff = nextFreeOff + maxAccounts * 2;
  const accountsRelEnd = prevFreeOff + maxAccounts * 2;
  const accountsOffRel = Math.ceil(accountsRelEnd / 8) * 8;
  const accountsOff = V12_19_ENGINE_OFF_SBF + accountsOffRel;
  const base = buildLayoutV12_17(
    maxAccounts,
    /* synthetic V12_17 SBF size */
    94168
  );
  return {
    ...base,
    headerLen: V12_19_HEADER_LEN_SBF,
    configLen: V12_19_CONFIG_LEN,
    configOffset: V12_19_HEADER_LEN_SBF,
    // header runs 0..136 in v12.19
    engineOff: V12_19_ENGINE_OFF_SBF,
    accountSize: V12_19_ACCOUNT_SIZE_SBF,
    accountsOff,
    bitmapWords,
    paramsSize: V12_19_SBF_ENGINE_PARAMS_SIZE,
    engineBitmapOff: V12_19_SBF_ENGINE_BITMAP_OFF,
    // V12_19-specific engine field offsets (probe-confirmed):
    engineCurrentSlotOff: V12_19_SBF_ENGINE_CURRENT_SLOT_OFF,
    engineCTotOff: V12_19_SBF_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V12_19_SBF_ENGINE_PNL_POS_TOT_OFF,
    engineLongOiOff: V12_19_SBF_ENGINE_OI_EFF_LONG_OFF,
    engineShortOiOff: V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF,
    // last_market_slot replaces V12_17 last_crank_slot semantics.
    engineLastCrankSlotOff: V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF,
    // rr_cursor_position replaces V12_17 gc_cursor semantics.
    engineGcCursorOff: V12_19_SBF_ENGINE_RR_CURSOR_OFF
  };
}
const V12_1_SBF_ACCOUNT_SIZE = 280;
const V12_1_SBF_ENGINE_OFF = 616;
const V12_1_SBF_BITMAP_OFF = 584;
for (const [, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAccLen = V12_1_SBF_BITMAP_OFF + bitmapBytes + 18 + n * 2;
  const accountsOff = Math.ceil(preAccLen / 8) * 8;
  const total = V12_1_SBF_ENGINE_OFF + accountsOff + n * V12_1_SBF_ACCOUNT_SIZE;
  V12_1_SIZES.set(total, n);
}
const V12_1_EP_SIZES = /* @__PURE__ */ new Map();
for (const [, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAccLen = V12_1_SBF_BITMAP_OFF + bitmapBytes + 18 + n * 2;
  const accountsOff = Math.ceil(preAccLen / 8) * 8;
  const total = V12_1_SBF_ENGINE_OFF + accountsOff + n * V12_1_EP_SBF_ACCOUNT_SIZE;
  V12_1_EP_SIZES.set(total, n);
}
const SLAB_TIERS_V2 = Object.freeze({
  small: { maxAccounts: 256, dataSize: 65088, label: "Small", description: "256 slots (V2 BPF intermediate)" },
  large: { maxAccounts: 4096, dataSize: 1025568, label: "Large", description: "4,096 slots (V2 BPF intermediate)" }
});
const SLAB_TIERS_V1M = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V1M_ENGINE_OFF, V1M_ENGINE_BITMAP_OFF, V1M_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V1M[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V1M mainnet)` };
}
Object.freeze(SLAB_TIERS_V1M);
const SLAB_TIERS_V1M2 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V1M2_ENGINE_OFF, V1M2_ENGINE_BITMAP_OFF, V1M2_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V1M2[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V1M2 mainnet upgraded)` };
}
Object.freeze(SLAB_TIERS_V1M2);
const SLAB_TIERS_V_ADL = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V_ADL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V_ADL[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V_ADL PERC-8270)` };
}
Object.freeze(SLAB_TIERS_V_ADL);
function buildLayout(version, maxAccounts, engineOffOverride) {
  const isV0 = version === 0;
  const engineOff = engineOffOverride ?? (isV0 ? V0_ENGINE_OFF : V1_ENGINE_OFF);
  const isV1Legacy = !isV0 && engineOffOverride === V1_ENGINE_OFF_LEGACY;
  const bitmapOff = isV0 ? V0_ENGINE_BITMAP_OFF : V1_ENGINE_BITMAP_OFF;
  const actualBitmapOff = isV1Legacy ? V1_LEGACY_ENGINE_BITMAP_OFF_ACTUAL : isV0 ? V0_ENGINE_BITMAP_OFF : V1_ENGINE_BITMAP_OFF;
  const accountSize = isV0 ? V0_ACCOUNT_SIZE : V1_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = actualBitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version,
    headerLen: isV0 ? V0_HEADER_LEN : V1_HEADER_LEN,
    configOffset: isV0 ? V0_HEADER_LEN : V1_HEADER_LEN,
    configLen: isV0 ? V0_CONFIG_LEN : V1_CONFIG_LEN,
    reservedOff: isV0 ? V0_RESERVED_OFF : V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: isV0 ? V0_ENGINE_PARAMS_OFF : V1_ENGINE_PARAMS_OFF,
    paramsSize: isV0 ? V0_PARAMS_SIZE : V1_PARAMS_SIZE,
    engineCurrentSlotOff: isV0 ? V0_ENGINE_CURRENT_SLOT_OFF : V1_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: isV0 ? V0_ENGINE_FUNDING_INDEX_OFF : V1_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: isV0 ? V0_ENGINE_LAST_FUNDING_SLOT_OFF : V1_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: isV0 ? V0_ENGINE_FUNDING_RATE_BPS_OFF : V1_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: isV0 ? -1 : V1_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: isV0 ? V0_ENGINE_LAST_CRANK_SLOT_OFF : V1_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: isV0 ? V0_ENGINE_MAX_CRANK_STALENESS_OFF : V1_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: isV0 ? V0_ENGINE_TOTAL_OI_OFF : V1_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: isV0 ? -1 : V1_ENGINE_LONG_OI_OFF,
    engineShortOiOff: isV0 ? -1 : V1_ENGINE_SHORT_OI_OFF,
    engineCTotOff: isV0 ? V0_ENGINE_C_TOT_OFF : V1_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isV0 ? V0_ENGINE_PNL_POS_TOT_OFF : V1_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: isV0 ? V0_ENGINE_LIQ_CURSOR_OFF : V1_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: isV0 ? V0_ENGINE_GC_CURSOR_OFF : V1_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: isV0 ? V0_ENGINE_LAST_SWEEP_START_OFF : V1_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: isV0 ? V0_ENGINE_LAST_SWEEP_COMPLETE_OFF : V1_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: isV0 ? V0_ENGINE_CRANK_CURSOR_OFF : V1_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: isV0 ? V0_ENGINE_SWEEP_START_IDX_OFF : V1_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: isV0 ? V0_ENGINE_LIFETIME_LIQUIDATIONS_OFF : V1_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: isV0 ? V0_ENGINE_LIFETIME_FORCE_CLOSES_OFF : V1_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: isV0 ? V0_ENGINE_NET_LP_POS_OFF : V1_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: isV0 ? V0_ENGINE_LP_SUM_ABS_OFF : V1_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: isV0 ? V0_ENGINE_LP_MAX_ABS_OFF : V1_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: isV0 ? V0_ENGINE_LP_MAX_ABS_SWEEP_OFF : V1_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: isV0 ? -1 : V1_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: isV0 ? -1 : V1_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: isV0 ? -1 : V1_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: actualBitmapOff,
    postBitmap: 18,
    acctOwnerOff: isV1Legacy ? V1_LEGACY_ACCT_OWNER_OFF : ACCT_OWNER_OFF,
    hasInsuranceIsolation: !isV0,
    engineInsuranceIsolatedOff: isV0 ? -1 : 48,
    engineInsuranceIsolationBpsOff: isV0 ? -1 : 64
  };
}
function buildLayoutV1D(maxAccounts, postBitmap = 2) {
  const engineOff = V1D_ENGINE_OFF;
  const bitmapOff = V1D_ENGINE_BITMAP_OFF;
  const accountSize = V1D_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1D_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: V1D_ENGINE_INSURANCE_OFF,
    engineParamsOff: V1D_ENGINE_PARAMS_OFF,
    paramsSize: V1D_PARAMS_SIZE,
    engineCurrentSlotOff: V1D_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V1D_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V1D_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V1D_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V1D_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V1D_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V1D_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V1D_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V1D_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V1D_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V1D_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V1D_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V1D_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V1D_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V1D_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V1D_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V1D_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V1D_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V1D_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V1D_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V1D_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V1D_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: -1,
    // not present in deployed V1
    engineLpMaxAbsSweepOff: -1,
    // not present in deployed V1
    engineEmergencyOiModeOff: -1,
    // not present in deployed V1
    engineEmergencyStartSlotOff: -1,
    // not present in deployed V1
    engineLastBreakerSlotOff: -1,
    // not present in deployed V1
    engineBitmapOff: V1D_ENGINE_BITMAP_OFF,
    postBitmap,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    // same within InsuranceFund
    engineInsuranceIsolationBpsOff: 64
    // same within InsuranceFund
  };
}
function buildLayoutV2(maxAccounts) {
  const engineOff = V2_ENGINE_OFF;
  const bitmapOff = V2_ENGINE_BITMAP_OFF;
  const accountSize = V2_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 2,
    headerLen: V2_HEADER_LEN,
    configOffset: V2_HEADER_LEN,
    configLen: V2_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    // V2 shares V1's header layout (reserved at 80)
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1_ENGINE_PARAMS_OFF,
    // same as V1: 72
    paramsSize: V1_PARAMS_SIZE,
    // same as V1: 288
    engineCurrentSlotOff: V2_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V2_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V2_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V2_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: -1,
    // V2 has no mark_price
    engineLastCrankSlotOff: V2_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V2_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V2_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: -1,
    // V2 has no long_oi
    engineShortOiOff: -1,
    // V2 has no short_oi
    engineCTotOff: V2_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V2_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V2_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V2_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V2_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V2_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V2_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V2_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V2_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V2_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V2_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V2_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V2_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V2_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: -1,
    // V2 has no emergency OI fields
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: V2_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV1M(maxAccounts) {
  const engineOff = V1M_ENGINE_OFF;
  const bitmapOff = V1M_ENGINE_BITMAP_OFF;
  const accountSize = V1M_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1M_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1M_ENGINE_PARAMS_OFF,
    paramsSize: V1M_PARAMS_SIZE,
    engineCurrentSlotOff: V1M_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V1M_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V1M_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V1M_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V1M_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V1M_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V1M_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V1M_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V1M_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V1M_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V1M_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V1M_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V1M_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V1M_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V1M_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V1M_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V1M_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V1M_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V1M_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V1M_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V1M_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V1M_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V1M_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V1M_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: V1M_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: V1M_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: V1M_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: V1M_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV1M2(maxAccounts) {
  const engineOff = V1M2_ENGINE_OFF;
  const bitmapOff = V1M2_ENGINE_BITMAP_OFF;
  const accountSize = V1M2_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V1M2_CONFIG_LEN,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V1M2_ENGINE_PARAMS_OFF,
    // 96 — expanded InsuranceFund (same as V_ADL)
    paramsSize: V_ADL_PARAMS_SIZE,
    // 336 — same as V_ADL
    // Runtime fields: V1M2 engine struct is layout-identical to V_ADL — reuse V_ADL constants.
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    // 432
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    // 440
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    // 456
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    // 464
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    // 504
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    // 528
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    // 536
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    // 544
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    // 560
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    // 576
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    // 592
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    // 608
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    // 640
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    // 642
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    // 648
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    // 656
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    // 664
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    // 666
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    // 672
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // 680
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    // 904
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    // 920
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    // 936
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // 952
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    // 968
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    // 976
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    // 984
    engineBitmapOff: V1M2_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    // 192 — same shift as V_ADL (reserved_pnl u64→u128)
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutVADL(maxAccounts) {
  const engineOff = V_ADL_ENGINE_OFF;
  const bitmapOff = V_ADL_ENGINE_BITMAP_OFF;
  const accountSize = V_ADL_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    // 104 (unchanged)
    configOffset: V1_HEADER_LEN,
    configLen: V_ADL_CONFIG_LEN,
    // 520
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V_ADL_ENGINE_PARAMS_OFF,
    // 96 (vault=16 + InsuranceFund=80)
    paramsSize: V_ADL_PARAMS_SIZE,
    // 336
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    // 432
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    // 440
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    // 456
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    // 464
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    // 504
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    // 528
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    // 536
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    // 544
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    // 560
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    // 576
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    // 592
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    // 608
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    // 640
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    // 642
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    // 648
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    // 656
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    // 664
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    // 666
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    // 672
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // 680
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    // 904
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    // 920
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    // 936
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // 952
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    // 968
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    // 976
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    // 984
    engineBitmapOff: V_ADL_ENGINE_BITMAP_OFF,
    // 1008
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    // 192
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
const SLAB_TIERS_V_SETDEXPOOL = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V_SETDEXPOOL_ENGINE_OFF, V_ADL_ENGINE_BITMAP_OFF, V_ADL_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V_SETDEXPOOL[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (V_SETDEXPOOL PERC-SetDexPool)` };
}
Object.freeze(SLAB_TIERS_V_SETDEXPOOL);
const SLAB_TIERS_V12_1 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const size = computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V12_1[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.1)` };
}
Object.freeze(SLAB_TIERS_V12_1);
const SLAB_TIERS_V12_15 = {};
for (const [label, n] of [["Micro", 64], ["Small", 256], ["Medium", 1024], ["Medium2048", 2048], ["Large", 4096]]) {
  const size = computeSlabSize(V12_15_ENGINE_OFF, V12_15_ENGINE_BITMAP_OFF, V12_15_ACCOUNT_SIZE, n, 18);
  SLAB_TIERS_V12_15[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.15)` };
}
Object.freeze(SLAB_TIERS_V12_15);
const SLAB_TIERS_V12_17 = {};
for (const [label, n] of [["Small", 256], ["Medium", 1024], ["Large", 4096]]) {
  const bitmapBytes = Math.ceil(n / 64) * 8;
  const preAcc = V12_17_ENGINE_BITMAP_OFF_SBF + bitmapBytes + 4 + n * 2;
  const accountsOff = Math.ceil(preAcc / 8) * 8;
  const size = V12_17_ENGINE_OFF_SBF + accountsOff + n * V12_17_ACCOUNT_SIZE_SBF + V12_17_RISK_BUF_LEN + n * V12_17_GEN_TABLE_ENTRY;
  SLAB_TIERS_V12_17[label.toLowerCase()] = { maxAccounts: n, dataSize: size, label, description: `${n} slots (v12.17)` };
}
Object.freeze(SLAB_TIERS_V12_17);
const SLAB_TIERS_V12_19 = Object.freeze({
  micro: { maxAccounts: 64, dataSize: 26872, label: "Micro", description: "64 slots (v12.19, --features micro)" },
  small: { maxAccounts: 256, dataSize: 96784, label: "Small", description: "256 slots (v12.19, --features small) \u2014 deployed mainnet ESa89R5..." },
  medium: { maxAccounts: 1024, dataSize: 376432, label: "Medium", description: "1024 slots (v12.19, --features medium)" },
  large: { maxAccounts: 4096, dataSize: 1495024, label: "Large", description: "4096 slots (v12.19, default features)" }
});
function buildLayoutVSetDexPool(maxAccounts) {
  const engineOff = V_SETDEXPOOL_ENGINE_OFF;
  const bitmapOff = V_ADL_ENGINE_BITMAP_OFF;
  const accountSize = V_ADL_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V1_HEADER_LEN,
    configOffset: V1_HEADER_LEN,
    configLen: V_SETDEXPOOL_CONFIG_LEN,
    // 544
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V_ADL_ENGINE_PARAMS_OFF,
    paramsSize: V_ADL_PARAMS_SIZE,
    engineCurrentSlotOff: V_ADL_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: V_ADL_ENGINE_FUNDING_INDEX_OFF,
    engineLastFundingSlotOff: V_ADL_ENGINE_LAST_FUNDING_SLOT_OFF,
    engineFundingRateBpsOff: V_ADL_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: V_ADL_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: V_ADL_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: V_ADL_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: V_ADL_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: V_ADL_ENGINE_LONG_OI_OFF,
    engineShortOiOff: V_ADL_ENGINE_SHORT_OI_OFF,
    engineCTotOff: V_ADL_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: V_ADL_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: V_ADL_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: V_ADL_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: V_ADL_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: V_ADL_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: V_ADL_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: V_ADL_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: V_ADL_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: V_ADL_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    engineNetLpPosOff: V_ADL_ENGINE_NET_LP_POS_OFF,
    engineLpSumAbsOff: V_ADL_ENGINE_LP_SUM_ABS_OFF,
    engineLpMaxAbsOff: V_ADL_ENGINE_LP_MAX_ABS_OFF,
    engineLpMaxAbsSweepOff: V_ADL_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    engineEmergencyOiModeOff: V_ADL_ENGINE_EMERGENCY_OI_MODE_OFF,
    engineEmergencyStartSlotOff: V_ADL_ENGINE_EMERGENCY_START_SLOT_OFF,
    engineLastBreakerSlotOff: V_ADL_ENGINE_LAST_BREAKER_SLOT_OFF,
    engineBitmapOff: V_ADL_ENGINE_BITMAP_OFF,
    postBitmap: 18,
    acctOwnerOff: V_ADL_ACCT_OWNER_OFF,
    hasInsuranceIsolation: true,
    engineInsuranceIsolatedOff: 48,
    engineInsuranceIsolationBpsOff: 64
  };
}
function buildLayoutV12_1(maxAccounts, dataLen) {
  const hostSize = computeSlabSize(V12_1_ENGINE_OFF, V12_1_ENGINE_BITMAP_OFF, V12_1_ACCOUNT_SIZE, maxAccounts, 18);
  const isSbf = dataLen !== void 0 && dataLen !== hostSize;
  const engineOff = isSbf ? V12_1_SBF_ENGINE_OFF : V12_1_ENGINE_OFF;
  const bitmapOff = isSbf ? V12_1_SBF_BITMAP_OFF : V12_1_ENGINE_BITMAP_OFF;
  const accountSize = isSbf ? V12_1_ACCOUNT_SIZE_SBF : V12_1_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    configLen: isSbf ? 544 : 576,
    reservedOff: V1_RESERVED_OFF,
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: isSbf ? V12_1_ENGINE_PARAMS_OFF_SBF : V12_1_ENGINE_PARAMS_OFF_HOST,
    paramsSize: isSbf ? V12_1_PARAMS_SIZE_SBF : V12_1_PARAMS_SIZE,
    // SBF engine offsets — all verified by cargo build-sbf offset_of! assertions.
    // Fields that don't exist in the deployed program are set to -1 on SBF.
    engineCurrentSlotOff: isSbf ? V12_1_SBF_OFF_CURRENT_SLOT : V12_1_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: isSbf ? -1 : V12_1_ENGINE_FUNDING_INDEX_OFF,
    // not in deployed struct
    engineLastFundingSlotOff: isSbf ? -1 : V12_1_ENGINE_LAST_FUNDING_SLOT_OFF,
    // not in deployed struct
    engineFundingRateBpsOff: isSbf ? V12_1_SBF_OFF_FUNDING_RATE : V12_1_ENGINE_FUNDING_RATE_BPS_OFF,
    engineMarkPriceOff: isSbf ? V12_1_SBF_OFF_MARK_PRICE_E6 : V12_1_ENGINE_MARK_PRICE_OFF,
    engineLastCrankSlotOff: isSbf ? V12_1_SBF_OFF_LAST_CRANK_SLOT : V12_1_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: isSbf ? V12_1_SBF_OFF_MAX_CRANK_STALENESS : V12_1_ENGINE_MAX_CRANK_STALENESS_OFF,
    engineTotalOiOff: isSbf ? V12_1_SBF_OFF_TOTAL_OI : V12_1_ENGINE_TOTAL_OI_OFF,
    engineLongOiOff: isSbf ? V12_1_SBF_OFF_LONG_OI : V12_1_ENGINE_LONG_OI_OFF,
    engineShortOiOff: isSbf ? V12_1_SBF_OFF_SHORT_OI : V12_1_ENGINE_SHORT_OI_OFF,
    engineCTotOff: isSbf ? V12_1_SBF_OFF_C_TOT : V12_1_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isSbf ? V12_1_SBF_OFF_PNL_POS_TOT : V12_1_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: isSbf ? V12_1_SBF_OFF_LIQ_CURSOR : V12_1_ENGINE_LIQ_CURSOR_OFF,
    engineGcCursorOff: isSbf ? V12_1_SBF_OFF_GC_CURSOR : V12_1_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: isSbf ? V12_1_SBF_OFF_LAST_SWEEP_START : V12_1_ENGINE_LAST_SWEEP_START_OFF,
    engineLastSweepCompleteOff: isSbf ? V12_1_SBF_OFF_LAST_SWEEP_COMPLETE : V12_1_ENGINE_LAST_SWEEP_COMPLETE_OFF,
    engineCrankCursorOff: isSbf ? V12_1_SBF_OFF_CRANK_CURSOR : V12_1_ENGINE_CRANK_CURSOR_OFF,
    engineSweepStartIdxOff: isSbf ? V12_1_SBF_OFF_SWEEP_START_IDX : V12_1_ENGINE_SWEEP_START_IDX_OFF,
    engineLifetimeLiquidationsOff: isSbf ? V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS : V12_1_ENGINE_LIFETIME_LIQUIDATIONS_OFF,
    engineLifetimeForceClosesOff: isSbf ? -1 : V12_1_ENGINE_LIFETIME_FORCE_CLOSES_OFF,
    // not in deployed struct
    engineNetLpPosOff: isSbf ? -1 : V12_1_ENGINE_NET_LP_POS_OFF,
    // not in deployed struct
    engineLpSumAbsOff: isSbf ? -1 : V12_1_ENGINE_LP_SUM_ABS_OFF,
    // not in deployed struct
    engineLpMaxAbsOff: isSbf ? -1 : V12_1_ENGINE_LP_MAX_ABS_OFF,
    // not in deployed struct
    engineLpMaxAbsSweepOff: isSbf ? -1 : V12_1_ENGINE_LP_MAX_ABS_SWEEP_OFF,
    // not in deployed struct
    engineEmergencyOiModeOff: isSbf ? -1 : V12_1_ENGINE_EMERGENCY_OI_MODE_OFF,
    // not in deployed struct
    engineEmergencyStartSlotOff: isSbf ? -1 : V12_1_ENGINE_EMERGENCY_START_SLOT_OFF,
    // not in deployed struct
    engineLastBreakerSlotOff: isSbf ? -1 : V12_1_ENGINE_LAST_BREAKER_SLOT_OFF,
    // not in deployed struct
    engineBitmapOff: bitmapOff,
    postBitmap: 18,
    acctOwnerOff: V12_1_ACCT_OWNER_OFF,
    // InsuranceFund on deployed program is just {balance: U128} = 16 bytes.
    // No isolated_balance or insurance_isolation_bps fields.
    hasInsuranceIsolation: !isSbf,
    engineInsuranceIsolatedOff: isSbf ? -1 : 48,
    engineInsuranceIsolationBpsOff: isSbf ? -1 : 64
  };
}
function buildLayoutV12_1EP(maxAccounts) {
  const engineOff = V12_1_SBF_ENGINE_OFF;
  const bitmapOff = V12_1_SBF_BITMAP_OFF;
  const accountSize = V12_1_EP_SBF_ACCOUNT_SIZE;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 1,
    headerLen: 72,
    configOffset: 72,
    configLen: 544,
    reservedOff: 80,
    // V1_RESERVED_OFF
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: 32,
    // V12_1_ENGINE_PARAMS_OFF_SBF
    paramsSize: 184,
    // V12_1_PARAMS_SIZE_SBF
    // Engine offsets identical to V12_1 SBF
    engineCurrentSlotOff: V12_1_SBF_OFF_CURRENT_SLOT,
    engineFundingIndexOff: -1,
    engineLastFundingSlotOff: -1,
    engineFundingRateBpsOff: V12_1_SBF_OFF_FUNDING_RATE,
    engineMarkPriceOff: V12_1_SBF_OFF_MARK_PRICE_E6,
    engineLastCrankSlotOff: V12_1_SBF_OFF_LAST_CRANK_SLOT,
    engineMaxCrankStalenessOff: V12_1_SBF_OFF_MAX_CRANK_STALENESS,
    engineTotalOiOff: V12_1_SBF_OFF_TOTAL_OI,
    engineLongOiOff: V12_1_SBF_OFF_LONG_OI,
    engineShortOiOff: V12_1_SBF_OFF_SHORT_OI,
    engineCTotOff: V12_1_SBF_OFF_C_TOT,
    enginePnlPosTotOff: V12_1_SBF_OFF_PNL_POS_TOT,
    engineLiqCursorOff: V12_1_SBF_OFF_LIQ_CURSOR,
    engineGcCursorOff: V12_1_SBF_OFF_GC_CURSOR,
    engineLastSweepStartOff: V12_1_SBF_OFF_LAST_SWEEP_START,
    engineLastSweepCompleteOff: V12_1_SBF_OFF_LAST_SWEEP_COMPLETE,
    engineCrankCursorOff: V12_1_SBF_OFF_CRANK_CURSOR,
    engineSweepStartIdxOff: V12_1_SBF_OFF_SWEEP_START_IDX,
    engineLifetimeLiquidationsOff: V12_1_SBF_OFF_LIFETIME_LIQUIDATIONS,
    engineLifetimeForceClosesOff: -1,
    engineNetLpPosOff: -1,
    engineLpSumAbsOff: -1,
    engineLpMaxAbsOff: -1,
    engineLpMaxAbsSweepOff: -1,
    engineEmergencyOiModeOff: -1,
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: bitmapOff,
    postBitmap: 18,
    // Account offsets — shifted +8 from V12_1 due to entry_price insertion
    acctOwnerOff: V12_1_EP_ACCT_OWNER_OFF,
    // 216 (was 208)
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1
  };
}
function buildLayoutV12_15(maxAccounts, dataLen) {
  const isSbf = dataLen === 237512;
  const accountSize = isSbf ? V12_15_ACCOUNT_SIZE_SMALL : V12_15_ACCOUNT_SIZE;
  const engineOff = isSbf ? V12_15_ENGINE_OFF_SBF : V12_15_ENGINE_OFF;
  const bitmapOff = V12_15_ENGINE_BITMAP_OFF;
  const effectiveBitmapOff = isSbf ? 648 : bitmapOff;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 18;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = effectiveBitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOffRel = Math.ceil(preAccountsLen / 8) * 8;
  return {
    version: 2,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    configLen: 552,
    // SBF CONFIG_LEN for v12.15
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V12_15_ENGINE_PARAMS_OFF,
    // 32
    paramsSize: isSbf ? 184 : V12_15_PARAMS_SIZE,
    // SBF=184 (no trailing pad), native=192
    engineCurrentSlotOff: isSbf ? 216 : V12_15_ENGINE_CURRENT_SLOT_OFF,
    // SBF=216, native=224
    engineFundingIndexOff: -1,
    // not present in v12.15 engine struct
    engineLastFundingSlotOff: -1,
    // not present in v12.15 engine struct
    engineFundingRateBpsOff: isSbf ? 224 : V12_15_ENGINE_FUNDING_RATE_E9_OFF,
    // SBF=224, native=240
    engineMarkPriceOff: -1,
    // not present in v12.15
    engineLastCrankSlotOff: -1,
    // not yet mapped
    engineMaxCrankStalenessOff: -1,
    // not yet mapped
    engineTotalOiOff: -1,
    // not present in v12.15 engine
    engineLongOiOff: -1,
    // not present in v12.15 engine
    engineShortOiOff: -1,
    // not present in v12.15 engine
    engineCTotOff: isSbf ? 320 : V12_15_ENGINE_C_TOT_OFF,
    // SBF=320 (verified on-chain), native=344
    enginePnlPosTotOff: isSbf ? 336 : V12_15_ENGINE_PNL_POS_TOT_OFF,
    // SBF=336 (verified), native=368
    engineLiqCursorOff: -1,
    // not yet mapped
    engineGcCursorOff: -1,
    // not yet mapped
    engineLastSweepStartOff: -1,
    // not yet mapped
    engineLastSweepCompleteOff: -1,
    // not yet mapped
    engineCrankCursorOff: -1,
    // not yet mapped
    engineSweepStartIdxOff: -1,
    // not yet mapped
    engineLifetimeLiquidationsOff: -1,
    // not yet mapped
    engineLifetimeForceClosesOff: -1,
    // not present in v12.15
    engineNetLpPosOff: -1,
    // not present in v12.15
    engineLpSumAbsOff: -1,
    // not present in v12.15
    engineLpMaxAbsOff: -1,
    // not present in v12.15
    engineLpMaxAbsSweepOff: -1,
    // not present in v12.15
    engineEmergencyOiModeOff: -1,
    // not present in v12.15
    engineEmergencyStartSlotOff: -1,
    // not present in v12.15
    engineLastBreakerSlotOff: -1,
    // not present in v12.15
    engineBitmapOff: effectiveBitmapOff,
    // SBF=640, native=862
    postBitmap,
    acctOwnerOff: V12_15_ACCT_OWNER_OFF,
    // 192
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1
  };
}
function buildLayoutV12_17(maxAccounts, dataLen) {
  const isSbf = (() => {
    const bitmapBytes2 = Math.ceil(maxAccounts / 64) * 8;
    const preAccNative = V12_17_ENGINE_BITMAP_OFF + bitmapBytes2 + 4 + maxAccounts * 2;
    const accountsOffNative = Math.ceil(preAccNative / 16) * 16;
    const nativeSize = V12_17_ENGINE_OFF + accountsOffNative + maxAccounts * V12_17_ACCOUNT_SIZE + V12_17_RISK_BUF_LEN + maxAccounts * V12_17_GEN_TABLE_ENTRY;
    return dataLen !== nativeSize;
  })();
  const engineOff = isSbf ? V12_17_ENGINE_OFF_SBF : V12_17_ENGINE_OFF;
  const accountSize = isSbf ? V12_17_ACCOUNT_SIZE_SBF : V12_17_ACCOUNT_SIZE;
  const bitmapOff = isSbf ? V12_17_ENGINE_BITMAP_OFF_SBF : V12_17_ENGINE_BITMAP_OFF;
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const postBitmap = 4;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const acctAlign = isSbf ? 8 : 16;
  const accountsOffRel = Math.ceil(preAccountsLen / acctAlign) * acctAlign;
  return {
    version: 2,
    headerLen: V0_HEADER_LEN,
    // 72
    configOffset: V0_HEADER_LEN,
    // 72
    // configLen = 512 (SBF-aligned MarketConfig size after Phase A/B/E).
    // Verified field-by-field against percolator-prog/src/percolator.rs MarketConfig struct.
    // Missing 80 bytes from prior value 432: max_pnl_cap, last_audit_pause_slot,
    // oi_cap_multiplier_bps, dispute_window_slots, dispute_bond_amount,
    // lp_collateral_enabled, lp_collateral_ltv_bps, _new_fields_pad, pending_admin.
    configLen: 512,
    reservedOff: V1_RESERVED_OFF,
    // 80
    engineOff,
    accountSize,
    maxAccounts,
    bitmapWords,
    accountsOff: engineOff + accountsOffRel,
    engineInsuranceOff: 16,
    engineParamsOff: V12_17_ENGINE_PARAMS_OFF,
    // 32
    paramsSize: isSbf ? 184 : 192,
    engineCurrentSlotOff: isSbf ? V12_17_SBF_ENGINE_CURRENT_SLOT_OFF : V12_17_ENGINE_CURRENT_SLOT_OFF,
    engineFundingIndexOff: -1,
    // replaced by per-side f_long_num/f_short_num
    engineLastFundingSlotOff: -1,
    engineFundingRateBpsOff: -1,
    // no stored funding rate in v12.17
    engineMarkPriceOff: -1,
    // v12.17 computes mark from state; no stored field
    engineLastCrankSlotOff: isSbf ? V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF : V12_17_ENGINE_LAST_CRANK_SLOT_OFF,
    engineMaxCrankStalenessOff: -1,
    engineTotalOiOff: -1,
    // parseEngine sums long + short when total offset is -1
    engineLongOiOff: isSbf ? V12_17_SBF_ENGINE_OI_EFF_LONG_OFF : V12_17_ENGINE_OI_EFF_LONG_OFF,
    engineShortOiOff: isSbf ? V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF : V12_17_ENGINE_OI_EFF_SHORT_OFF,
    engineCTotOff: isSbf ? V12_17_SBF_ENGINE_C_TOT_OFF : V12_17_ENGINE_C_TOT_OFF,
    enginePnlPosTotOff: isSbf ? V12_17_SBF_ENGINE_PNL_POS_TOT_OFF : V12_17_ENGINE_PNL_POS_TOT_OFF,
    engineLiqCursorOff: -1,
    // removed in v12.17
    engineGcCursorOff: isSbf ? V12_17_SBF_ENGINE_GC_CURSOR_OFF : V12_17_ENGINE_GC_CURSOR_OFF,
    engineLastSweepStartOff: -1,
    engineLastSweepCompleteOff: -1,
    engineCrankCursorOff: -1,
    engineSweepStartIdxOff: -1,
    engineLifetimeLiquidationsOff: -1,
    engineLifetimeForceClosesOff: -1,
    engineNetLpPosOff: -1,
    engineLpSumAbsOff: -1,
    engineLpMaxAbsOff: -1,
    engineLpMaxAbsSweepOff: -1,
    engineEmergencyOiModeOff: -1,
    engineEmergencyStartSlotOff: -1,
    engineLastBreakerSlotOff: -1,
    engineBitmapOff: bitmapOff,
    postBitmap,
    acctOwnerOff: isSbf ? 192 : V12_17_ACCT_OWNER_OFF,
    // SBF=192, native=200
    hasInsuranceIsolation: false,
    engineInsuranceIsolatedOff: -1,
    engineInsuranceIsolationBpsOff: -1,
    // v12.17 dropped the engine.mark_price field (see engineMarkPriceOff above).
    // The EWMA-smoothed mark that the matcher actually quotes against lives in
    // MarketConfig.mark_ewma_e6 at offset 304 within the config struct.
    // Layout is identical on SBF and native. configOffset is V0_HEADER_LEN = 72,
    // so absolute offset in the slab is 72 + 304 = 376.
    configMarkEwmaOff: V0_HEADER_LEN + 304
  };
}
function validateLayout(layout, dataLen) {
  if (layout.accountsOff > dataLen) {
    throw new Error(
      `validateLayout: accountsOff (${layout.accountsOff}) exceeds data length (${dataLen}) for engineOff=${layout.engineOff} accountSize=${layout.accountSize} maxAccounts=${layout.maxAccounts}`
    );
  }
  const bitmapEnd = layout.engineOff + layout.engineBitmapOff + layout.bitmapWords * 8;
  if (bitmapEnd > dataLen) {
    throw new Error(
      `validateLayout: bitmap region end (${bitmapEnd}) exceeds data length (${dataLen})`
    );
  }
  return layout;
}
function detectSlabLayout(dataLen, data) {
  const v1219n = V12_19_SIZES.get(dataLen);
  if (v1219n !== void 0) return validateLayout(buildLayoutV12_19(v1219n, dataLen), dataLen);
  const v1217n = V12_17_SIZES.get(dataLen);
  if (v1217n !== void 0) return validateLayout(buildLayoutV12_17(v1217n, dataLen), dataLen);
  const v1215n = V12_15_SIZES.get(dataLen);
  if (v1215n !== void 0) return validateLayout(buildLayoutV12_15(v1215n, dataLen), dataLen);
  const v121epn = V12_1_EP_SIZES.get(dataLen);
  if (v121epn !== void 0) return validateLayout(buildLayoutV12_1EP(v121epn), dataLen);
  const v121n = V12_1_SIZES.get(dataLen);
  if (v121n !== void 0) return validateLayout(buildLayoutV12_1(v121n, dataLen), dataLen);
  const vsdpn = V_SETDEXPOOL_SIZES.get(dataLen);
  if (vsdpn !== void 0) return validateLayout(buildLayoutVSetDexPool(vsdpn), dataLen);
  const v1m2n = V1M2_SIZES.get(dataLen);
  if (v1m2n !== void 0) return validateLayout(buildLayoutV1M2(v1m2n), dataLen);
  const vadln = V_ADL_SIZES.get(dataLen);
  if (vadln !== void 0) return validateLayout(buildLayoutVADL(vadln), dataLen);
  const v1mn = V1M_SIZES.get(dataLen);
  if (v1mn !== void 0) return validateLayout(buildLayoutV1M(v1mn), dataLen);
  const v0n = V0_SIZES.get(dataLen);
  if (v0n !== void 0) return validateLayout(buildLayout(0, v0n), dataLen);
  const v1dn = V1D_SIZES.get(dataLen);
  if (v1dn !== void 0) {
    if (data && data.length >= 12) {
      const version = readU32LE(data, 8);
      if (version === 2) return validateLayout(buildLayoutV2(v1dn), dataLen);
    }
    return validateLayout(buildLayoutV1D(v1dn, 2), dataLen);
  }
  const v1dln = V1D_SIZES_LEGACY.get(dataLen);
  if (v1dln !== void 0) return validateLayout(buildLayoutV1D(v1dln, 18), dataLen);
  const v1n = V1_SIZES.get(dataLen);
  if (v1n !== void 0) return validateLayout(buildLayout(1, v1n), dataLen);
  const v1ln = V1_SIZES_LEGACY.get(dataLen);
  if (v1ln !== void 0) return validateLayout(buildLayout(1, v1ln, V1_ENGINE_OFF_LEGACY), dataLen);
  return null;
}
function detectLayout(dataLen) {
  const layout = detectSlabLayout(dataLen);
  if (!layout) return null;
  return { bitmapWords: layout.bitmapWords, accountsOff: layout.accountsOff, maxAccounts: layout.maxAccounts };
}
const PARAMS_WARMUP_PERIOD_OFF = 0;
const PARAMS_MAINTENANCE_MARGIN_OFF = 8;
const PARAMS_INITIAL_MARGIN_OFF = 16;
const PARAMS_TRADING_FEE_OFF = 24;
const PARAMS_MAX_ACCOUNTS_OFF = 32;
const PARAMS_NEW_ACCOUNT_FEE_OFF = 40;
const PARAMS_RISK_THRESHOLD_OFF = 56;
const PARAMS_MAINTENANCE_FEE_OFF = 72;
const PARAMS_MAX_CRANK_STALENESS_OFF = 88;
const PARAMS_LIQUIDATION_FEE_BPS_OFF = 96;
const PARAMS_LIQUIDATION_FEE_CAP_OFF = 104;
const PARAMS_LIQUIDATION_BUFFER_OFF = 120;
const PARAMS_MIN_LIQUIDATION_OFF = 128;
const V12_1_PARAMS_MAINT_FEE_OFF = 56;
const V12_1_PARAMS_MAX_CRANK_OFF = 72;
const V12_1_PARAMS_LIQ_FEE_BPS_OFF = 80;
const V12_1_PARAMS_LIQ_FEE_CAP_OFF = 88;
const V12_1_PARAMS_MIN_LIQ_OFF = 104;
const V12_1_PARAMS_MIN_INITIAL_DEP_OFF = 120;
const V12_1_PARAMS_MIN_NZ_MM_OFF = 136;
const V12_1_PARAMS_MIN_NZ_IM_OFF = 152;
const V12_1_PARAMS_INS_FLOOR_OFF = 168;
const V12_19_PARAMS_MAINTENANCE_MARGIN_OFF = 0;
const V12_19_PARAMS_INITIAL_MARGIN_OFF = 8;
const V12_19_PARAMS_TRADING_FEE_OFF = 16;
const V12_19_PARAMS_MAX_ACCOUNTS_OFF = 24;
const V12_19_PARAMS_LIQ_FEE_BPS_OFF = 32;
const V12_19_PARAMS_LIQ_FEE_CAP_OFF = 40;
const V12_19_PARAMS_MIN_LIQ_OFF = 56;
const V12_19_PARAMS_MIN_NZ_MM_OFF = 72;
const V12_19_PARAMS_MIN_NZ_IM_OFF = 88;
const V12_19_PARAMS_H_MIN_OFF = 104;
const V12_19_PARAMS_H_MAX_OFF = 112;
const V12_19_PARAMS_RESOLVE_PRICE_DEVIATION_OFF = 120;
const V12_19_PARAMS_MAX_ACCRUAL_DT_OFF = 128;
const ACCT_ACCOUNT_ID_OFF = 0;
const ACCT_CAPITAL_OFF = 8;
const ACCT_KIND_OFF = 24;
const ACCT_PNL_OFF = 32;
const ACCT_RESERVED_PNL_OFF = 48;
const ACCT_WARMUP_STARTED_OFF = 56;
const ACCT_WARMUP_SLOPE_OFF = 64;
const ACCT_POSITION_SIZE_OFF = 80;
const ACCT_ENTRY_PRICE_OFF = 96;
const ACCT_FUNDING_INDEX_OFF = 104;
const ACCT_MATCHER_PROGRAM_OFF = 120;
const ACCT_MATCHER_CONTEXT_OFF = 152;
const ACCT_OWNER_OFF = 184;
const ACCT_FEE_CREDITS_OFF = 216;
const ACCT_LAST_FEE_SLOT_OFF = 232;
var AccountKind = /* @__PURE__ */ ((AccountKind2) => {
  AccountKind2[AccountKind2["User"] = 0] = "User";
  AccountKind2[AccountKind2["LP"] = 1] = "LP";
  return AccountKind2;
})(AccountKind || {});
async function fetchSlab(connection, slabPubkey, expectedOwner) {
  const info = await connection.getAccountInfo(slabPubkey);
  if (!info) {
    throw new Error(`Slab account not found: ${slabPubkey.toBase58()}`);
  }
  if (expectedOwner && !info.owner.equals(expectedOwner)) {
    throw new Error(
      `fetchSlab: account ${slabPubkey.toBase58()} is owned by ${info.owner.toBase58()} but expected ${expectedOwner.toBase58()}`
    );
  }
  return new Uint8Array(info.data);
}
const RAMP_START_BPS = 1000n;
const DEFAULT_OI_RAMP_SLOTS = 432000n;
function computeEffectiveOiCapBps(config, currentSlot) {
  const target = config.oiCapMultiplierBps;
  if (target === 0n) return 0n;
  if (config.oiRampSlots === 0n) return target;
  if (target <= RAMP_START_BPS) return target;
  const elapsed = currentSlot > config.marketCreatedSlot ? currentSlot - config.marketCreatedSlot : 0n;
  if (elapsed >= config.oiRampSlots) return target;
  const range = target - RAMP_START_BPS;
  const rampAdd = range * elapsed / config.oiRampSlots;
  const result = RAMP_START_BPS + rampAdd;
  return result < target ? result : target;
}
function readNonce(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`readNonce: unrecognized slab data length ${data.length}`);
  }
  const roff = layout.reservedOff;
  if (data.length < roff + 8) throw new Error("Slab data too short for nonce");
  return readU64LE(data, roff);
}
function readLastThrUpdateSlot(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`readLastThrUpdateSlot: unrecognized slab data length ${data.length}`);
  }
  const roff = layout.reservedOff;
  if (data.length < roff + 16) throw new Error("Slab data too short for lastThrUpdateSlot");
  return readU64LE(data, roff + 8);
}
function parseHeader(data) {
  if (data.length < V0_HEADER_LEN) {
    throw new Error(`Slab data too short for header: ${data.length} < ${V0_HEADER_LEN}`);
  }
  const magic = readU64LE(data, 0);
  if (magic !== MAGIC) {
    throw new Error(`Invalid slab magic: expected ${MAGIC.toString(16)}, got ${magic.toString(16)}`);
  }
  const version = readU32LE(data, 8);
  const bump = readU8(data, 12);
  const flags = readU8(data, 13);
  const admin = new PublicKey(data.subarray(16, 48));
  const layout = detectSlabLayout(data.length, data);
  const roff = layout ? layout.reservedOff : V0_RESERVED_OFF;
  const nonce = readU64LE(data, roff);
  const lastThrUpdateSlot = readU64LE(data, roff + 8);
  return {
    magic,
    version,
    bump,
    flags,
    resolved: (flags & FLAG_RESOLVED) !== 0,
    paused: (flags & 2) !== 0,
    admin,
    nonce,
    lastThrUpdateSlot
  };
}
function parseConfigV12_17(data, configOff) {
  const MIN_V12_17_BYTES = 512;
  if (data.length < configOff + MIN_V12_17_BYTES) {
    throw new Error(`Slab data too short for V12_17 config: ${data.length} < ${configOff + MIN_V12_17_BYTES}`);
  }
  const b = configOff;
  const collateralMint = new PublicKey(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const oraclePriceCapE2bps = readU64LE(data, b + 192);
  const lastEffectivePriceE6 = readU64LE(data, b + 200);
  const dexPoolBytes = data.subarray(b + 400, b + 432);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey(dexPoolBytes) : null;
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6: 0n,
    // removed in v12.17
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor: 0n,
    // removed in v12.17
    threshRiskBps: 0n,
    threshUpdateIntervalSlots: 0n,
    threshStepBps: 0n,
    threshAlphaBps: 0n,
    threshMin: 0n,
    threshMax: 0n,
    threshMinStep: 0n,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps: readU64LE(data, b + 448),
    maxPnlCap: readU64LE(data, b + 432),
    adaptiveFundingEnabled: false,
    // removed in v12.17
    adaptiveScaleBps: 0,
    adaptiveMaxFundingBps: 0n,
    marketCreatedSlot: 0n,
    oiRampSlots: 0n,
    resolvedSlot: 0n,
    insuranceIsolationBps: 0,
    oraclePhase: 0,
    cumulativeVolumeE6: 0n,
    phase2DeltaSlots: 0,
    dexPool
  };
}
function parseConfigV12_19(data, configOff) {
  const MIN_V12_19_BYTES = 480;
  if (data.length < configOff + MIN_V12_19_BYTES) {
    throw new Error(`Slab data too short for V12_19 config: ${data.length} < ${configOff + MIN_V12_19_BYTES}`);
  }
  const b = configOff;
  const collateralMint = new PublicKey(data.subarray(b + 0, b + 32));
  const vaultPubkey = new PublicKey(data.subarray(b + 32, b + 64));
  const indexFeedId = new PublicKey(data.subarray(b + 64, b + 96));
  const maxStalenessSlots = readU64LE(data, b + 96);
  const confFilterBps = readU16LE(data, b + 104);
  const vaultAuthorityBump = readU8(data, b + 106);
  const invert = readU8(data, b + 107);
  const unitScale = readU32LE(data, b + 108);
  const fundingHorizonSlots = readU64LE(data, b + 112);
  const fundingKBps = readU64LE(data, b + 120);
  const fundingMaxPremiumBps = readI64LE(data, b + 128);
  const fundingMaxBpsPerSlot = readI64LE(data, b + 136);
  const oracleAuthority = new PublicKey(data.subarray(b + 144, b + 176));
  const authorityPriceE6 = readU64LE(data, b + 176);
  const authorityTimestamp = readI64LE(data, b + 184);
  const lastEffectivePriceE6 = readU64LE(data, b + 192);
  const oraclePriceCapE2bps = readU64LE(data, b + 216);
  const dexPoolBytes = data.subarray(b + 368, b + 400);
  const dexPool = dexPoolBytes.some((x) => x !== 0) ? new PublicKey(dexPoolBytes) : null;
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6: 0n,
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor: 0n,
    threshRiskBps: 0n,
    threshUpdateIntervalSlots: 0n,
    threshStepBps: 0n,
    threshAlphaBps: 0n,
    threshMin: 0n,
    threshMax: 0n,
    threshMinStep: 0n,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps: readU64LE(data, b + 416),
    maxPnlCap: readU64LE(data, b + 400),
    adaptiveFundingEnabled: false,
    adaptiveScaleBps: 0,
    adaptiveMaxFundingBps: 0n,
    marketCreatedSlot: 0n,
    oiRampSlots: 0n,
    resolvedSlot: 0n,
    insuranceIsolationBps: 0,
    oraclePhase: 0,
    cumulativeVolumeE6: 0n,
    phase2DeltaSlots: 0,
    dexPool
  };
}
function parseConfig(data, layoutHint) {
  if (data.length >= 8 && readU64LE(data, 0) !== MAGIC) {
    throw new Error("parseConfig: invalid slab magic");
  }
  const layout = layoutHint !== void 0 ? layoutHint : detectSlabLayout(data.length, data);
  const configOff = layout ? layout.configOffset : V0_HEADER_LEN;
  const configLen = layout ? layout.configLen : V0_CONFIG_LEN;
  const isV12_19 = layout && layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  if (isV12_19) {
    return parseConfigV12_19(data, configOff);
  }
  const isV12_17 = layout && (layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF);
  if (isV12_17) {
    return parseConfigV12_17(data, configOff);
  }
  const MIN_CONFIG_BYTES = 376;
  const minLen = configOff + Math.min(configLen, MIN_CONFIG_BYTES);
  if (data.length < minLen) {
    throw new Error(`Slab data too short for config: ${data.length} < ${minLen}`);
  }
  let off = configOff;
  const collateralMint = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const vaultPubkey = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const indexFeedId = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const maxStalenessSlots = readU64LE(data, off);
  off += 8;
  const confFilterBps = readU16LE(data, off);
  off += 2;
  const vaultAuthorityBump = readU8(data, off);
  off += 1;
  const invert = readU8(data, off);
  off += 1;
  const unitScale = readU32LE(data, off);
  off += 4;
  const fundingHorizonSlots = readU64LE(data, off);
  off += 8;
  const fundingKBps = readU64LE(data, off);
  off += 8;
  const fundingInvScaleNotionalE6 = readU128LE(data, off);
  off += 16;
  const fundingMaxPremiumBps = readI64LE(data, off);
  off += 8;
  const fundingMaxBpsPerSlot = readI64LE(data, off);
  off += 8;
  const threshFloor = readU128LE(data, off);
  off += 16;
  const threshRiskBps = readU64LE(data, off);
  off += 8;
  const threshUpdateIntervalSlots = readU64LE(data, off);
  off += 8;
  const threshStepBps = readU64LE(data, off);
  off += 8;
  const threshAlphaBps = readU64LE(data, off);
  off += 8;
  const threshMin = readU128LE(data, off);
  off += 16;
  const threshMax = readU128LE(data, off);
  off += 16;
  const threshMinStep = readU128LE(data, off);
  off += 16;
  const oracleAuthority = new PublicKey(data.subarray(off, off + 32));
  off += 32;
  const authorityPriceE6 = readU64LE(data, off);
  off += 8;
  const authorityTimestamp = readI64LE(data, off);
  off += 8;
  const oraclePriceCapE2bps = readU64LE(data, off);
  off += 8;
  const lastEffectivePriceE6 = readU64LE(data, off);
  off += 8;
  const oiCapMultiplierBps = readU64LE(data, off);
  off += 8;
  const maxPnlCap = readU64LE(data, off);
  off += 8;
  const remaining = configOff + configLen - off;
  let adaptiveFundingEnabled = false;
  let adaptiveScaleBps = 0;
  let adaptiveMaxFundingBps = 0n;
  let marketCreatedSlot = 0n;
  let oiRampSlots = 0n;
  let resolvedSlot = 0n;
  let insuranceIsolationBps = 0;
  let oraclePhase = 0;
  let cumulativeVolumeE6 = 0n;
  let phase2DeltaSlots = 0;
  if (remaining >= 40) {
    marketCreatedSlot = readU64LE(data, off);
    off += 8;
    oiRampSlots = readU64LE(data, off);
    off += 8;
    adaptiveFundingEnabled = readU8(data, off) !== 0;
    off += 1;
    off += 1;
    adaptiveScaleBps = readU16LE(data, off);
    off += 2;
    off += 4;
    adaptiveMaxFundingBps = readU64LE(data, off);
    off += 8;
    if (remaining >= 42) {
      insuranceIsolationBps = readU16LE(data, off);
      if (remaining >= 56) {
        const padOff = off + 2;
        oraclePhase = Math.min(readU8(data, padOff + 2), 2);
        cumulativeVolumeE6 = readU64LE(data, padOff + 3);
        phase2DeltaSlots = data[padOff + 11] | data[padOff + 12] << 8 | data[padOff + 13] << 16;
      }
    }
  }
  let dexPool = null;
  const DEX_POOL_REL_OFF = 512;
  if (configLen >= DEX_POOL_REL_OFF + 32 && data.length >= configOff + DEX_POOL_REL_OFF + 32) {
    const dexPoolBytes = data.subarray(configOff + DEX_POOL_REL_OFF, configOff + DEX_POOL_REL_OFF + 32);
    if (dexPoolBytes.some((b) => b !== 0)) {
      dexPool = new PublicKey(dexPoolBytes);
    }
  }
  return {
    collateralMint,
    vaultPubkey,
    indexFeedId,
    maxStalenessSlots,
    confFilterBps,
    vaultAuthorityBump,
    invert,
    unitScale,
    fundingHorizonSlots,
    fundingKBps,
    fundingInvScaleNotionalE6,
    fundingMaxPremiumBps,
    fundingMaxBpsPerSlot,
    threshFloor,
    threshRiskBps,
    threshUpdateIntervalSlots,
    threshStepBps,
    threshAlphaBps,
    threshMin,
    threshMax,
    threshMinStep,
    oracleAuthority,
    authorityPriceE6,
    authorityTimestamp,
    oraclePriceCapE2bps,
    lastEffectivePriceE6,
    oiCapMultiplierBps,
    maxPnlCap,
    adaptiveFundingEnabled,
    adaptiveScaleBps,
    adaptiveMaxFundingBps,
    marketCreatedSlot,
    oiRampSlots,
    resolvedSlot,
    insuranceIsolationBps,
    oraclePhase,
    cumulativeVolumeE6,
    phase2DeltaSlots,
    dexPool
  };
}
function parseParams(data, layoutHint) {
  const layout = layoutHint !== void 0 ? layoutHint : detectSlabLayout(data.length, data);
  const engineOff = layout ? layout.engineOff : V0_ENGINE_OFF;
  const paramsOff = layout ? layout.engineParamsOff : V0_ENGINE_PARAMS_OFF;
  const paramsSize = layout ? layout.paramsSize : V0_PARAMS_SIZE;
  const base = engineOff + paramsOff;
  const MIN_PARAMS_BYTES = paramsSize >= 144 ? 144 : 56;
  if (data.length < base + MIN_PARAMS_BYTES) {
    throw new Error(`Slab data too short for RiskParams: ${data.length} < ${base + MIN_PARAMS_BYTES}`);
  }
  const isV12_15Params = paramsSize === V12_15_PARAMS_SIZE || paramsSize === 184;
  const isV12_19Params = layout !== null && layout !== void 0 && layout.engineOff === V12_19_ENGINE_OFF_SBF && paramsSize === V12_19_SBF_ENGINE_PARAMS_SIZE;
  const isV12_1Sbf = !isV12_15Params && layout !== null && layout !== void 0 && layout.engineOff === V12_1_SBF_ENGINE_OFF && paramsSize === 184;
  const result = {
    warmupPeriodSlots: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_H_MIN_OFF) : isV12_15Params ? readU64LE(data, base + V12_15_PARAMS_H_MIN_OFF) : readU64LE(data, base + PARAMS_WARMUP_PERIOD_OFF),
    maintenanceMarginBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_MAINTENANCE_MARGIN_OFF) : isV12_15Params ? readU64LE(data, base + 0) : readU64LE(data, base + PARAMS_MAINTENANCE_MARGIN_OFF),
    initialMarginBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_INITIAL_MARGIN_OFF) : isV12_15Params ? readU64LE(data, base + 8) : readU64LE(data, base + PARAMS_INITIAL_MARGIN_OFF),
    tradingFeeBps: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_TRADING_FEE_OFF) : isV12_15Params ? readU64LE(data, base + 16) : readU64LE(data, base + PARAMS_TRADING_FEE_OFF),
    maxAccounts: isV12_19Params ? readU64LE(data, base + V12_19_PARAMS_MAX_ACCOUNTS_OFF) : isV12_15Params ? readU64LE(data, base + V12_15_PARAMS_MAX_ACCOUNTS_OFF) : readU64LE(data, base + PARAMS_MAX_ACCOUNTS_OFF),
    newAccountFee: isV12_19Params ? 1n : isV12_15Params ? readU128LE(data, base + 32) : readU128LE(data, base + PARAMS_NEW_ACCOUNT_FEE_OFF),
    // Extended params: defaults; overwritten below if layout supports them
    riskReductionThreshold: 0n,
    maintenanceFeePerSlot: 0n,
    maxCrankStalenessSlots: 0n,
    liquidationFeeBps: 0n,
    liquidationFeeCap: 0n,
    liquidationBufferBps: 0n,
    minLiquidationAbs: 0n,
    minInitialDeposit: 0n,
    minNonzeroMmReq: 0n,
    minNonzeroImReq: 0n,
    insuranceFloor: 0n,
    hMin: 0n,
    hMax: 0n
  };
  if (isV12_19Params) {
    result.hMin = readU64LE(data, base + V12_19_PARAMS_H_MIN_OFF);
    result.hMax = readU64LE(data, base + V12_19_PARAMS_H_MAX_OFF);
    result.riskReductionThreshold = 0n;
    result.maintenanceFeePerSlot = 0n;
    result.maxCrankStalenessSlots = readU64LE(data, base + V12_19_PARAMS_MAX_ACCRUAL_DT_OFF);
    result.liquidationFeeBps = readU64LE(data, base + V12_19_PARAMS_LIQ_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + V12_19_PARAMS_LIQ_FEE_CAP_OFF);
    result.liquidationBufferBps = readU64LE(data, base + V12_19_PARAMS_RESOLVE_PRICE_DEVIATION_OFF);
    result.minLiquidationAbs = readU128LE(data, base + V12_19_PARAMS_MIN_LIQ_OFF);
    result.minInitialDeposit = 0n;
    result.minNonzeroMmReq = readU128LE(data, base + V12_19_PARAMS_MIN_NZ_MM_OFF);
    result.minNonzeroImReq = readU128LE(data, base + V12_19_PARAMS_MIN_NZ_IM_OFF);
    result.insuranceFloor = 0n;
  } else if (isV12_15Params) {
    result.hMin = readU64LE(data, base + V12_15_PARAMS_H_MIN_OFF);
    result.hMax = readU64LE(data, base + V12_15_PARAMS_H_MAX_OFF);
    result.insuranceFloor = readU128LE(data, base + V12_15_PARAMS_INSURANCE_FLOOR_OFF);
    result.riskReductionThreshold = 0n;
    result.maintenanceFeePerSlot = 0n;
    result.maxCrankStalenessSlots = readU64LE(data, base + 48);
    result.liquidationFeeBps = readU64LE(data, base + 56);
    result.liquidationFeeCap = readU128LE(data, base + 64);
    result.liquidationBufferBps = 0n;
    result.minLiquidationAbs = readU128LE(data, base + 80);
    result.minInitialDeposit = readU128LE(data, base + 96);
    result.minNonzeroMmReq = readU128LE(data, base + 112);
    result.minNonzeroImReq = readU128LE(data, base + 128);
  } else if (isV12_1Sbf) {
    result.maintenanceFeePerSlot = readU128LE(data, base + V12_1_PARAMS_MAINT_FEE_OFF);
    result.maxCrankStalenessSlots = readU64LE(data, base + V12_1_PARAMS_MAX_CRANK_OFF);
    result.liquidationFeeBps = readU64LE(data, base + V12_1_PARAMS_LIQ_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + V12_1_PARAMS_LIQ_FEE_CAP_OFF);
    result.minLiquidationAbs = readU128LE(data, base + V12_1_PARAMS_MIN_LIQ_OFF);
    result.minInitialDeposit = readU128LE(data, base + V12_1_PARAMS_MIN_INITIAL_DEP_OFF);
    result.minNonzeroMmReq = readU128LE(data, base + V12_1_PARAMS_MIN_NZ_MM_OFF);
    result.minNonzeroImReq = readU128LE(data, base + V12_1_PARAMS_MIN_NZ_IM_OFF);
    result.insuranceFloor = readU128LE(data, base + V12_1_PARAMS_INS_FLOOR_OFF);
    result.hMin = result.warmupPeriodSlots;
    result.hMax = result.warmupPeriodSlots;
  } else if (paramsSize >= 144) {
    result.riskReductionThreshold = readU128LE(data, base + PARAMS_RISK_THRESHOLD_OFF);
    result.maintenanceFeePerSlot = readU128LE(data, base + PARAMS_MAINTENANCE_FEE_OFF);
    result.maxCrankStalenessSlots = readU64LE(data, base + PARAMS_MAX_CRANK_STALENESS_OFF);
    result.liquidationFeeBps = readU64LE(data, base + PARAMS_LIQUIDATION_FEE_BPS_OFF);
    result.liquidationFeeCap = readU128LE(data, base + PARAMS_LIQUIDATION_FEE_CAP_OFF);
    result.liquidationBufferBps = readU64LE(data, base + PARAMS_LIQUIDATION_BUFFER_OFF);
    result.minLiquidationAbs = readU128LE(data, base + PARAMS_MIN_LIQUIDATION_OFF);
    result.hMin = result.warmupPeriodSlots;
    result.hMax = result.warmupPeriodSlots;
  }
  return result;
}
function parseEngine(data) {
  if (data.length >= 8 && readU64LE(data, 0) !== MAGIC) {
    throw new Error("parseEngine: invalid slab magic");
  }
  const layout = detectSlabLayout(data.length, data);
  if (!layout) {
    throw new Error(`Unrecognized slab data length: ${data.length}. Cannot determine layout version.`);
  }
  if (data.length < layout.accountsOff) {
    throw new Error(`parseEngine: data too short for accountsOff (${data.length} < ${layout.accountsOff})`);
  }
  const base = layout.engineOff;
  const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF;
  const isV12_15 = !isV12_17 && (layout.accountSize === V12_15_ACCOUNT_SIZE || layout.accountSize === V12_15_ACCOUNT_SIZE_SMALL) && (layout.engineOff === V12_15_ENGINE_OFF || layout.engineOff === V12_15_ENGINE_OFF_SBF);
  const isV12_19 = layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  if (isV12_17 || isV12_19) {
    const isSbf = layout.engineOff === V12_17_ENGINE_OFF_SBF || isV12_19;
    const currentSlotOff = isV12_19 ? V12_19_SBF_ENGINE_CURRENT_SLOT_OFF : isSbf ? V12_17_SBF_ENGINE_CURRENT_SLOT_OFF : V12_17_ENGINE_CURRENT_SLOT_OFF;
    const marketModeOff = isV12_19 ? V12_19_SBF_ENGINE_MARKET_MODE_OFF : isSbf ? V12_17_SBF_ENGINE_MARKET_MODE_OFF : V12_17_ENGINE_MARKET_MODE_OFF;
    const cTotOff = isV12_19 ? V12_19_SBF_ENGINE_C_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_C_TOT_OFF : V12_17_ENGINE_C_TOT_OFF;
    const pnlPosTotOff = isV12_19 ? V12_19_SBF_ENGINE_PNL_POS_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_PNL_POS_TOT_OFF : V12_17_ENGINE_PNL_POS_TOT_OFF;
    const pnlMaturedOff = isV12_19 ? V12_19_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF : isSbf ? V12_17_SBF_ENGINE_PNL_MATURED_POS_TOT_OFF : V12_17_ENGINE_PNL_MATURED_POS_TOT_OFF;
    const negPnlOff = isV12_19 ? V12_19_SBF_ENGINE_NEG_PNL_COUNT_OFF : isSbf ? V12_17_SBF_ENGINE_NEG_PNL_COUNT_OFF : V12_17_ENGINE_NEG_PNL_COUNT_OFF;
    const oraclePriceOff = isV12_19 ? V12_19_SBF_ENGINE_LAST_ORACLE_PRICE_OFF : isSbf ? V12_17_SBF_ENGINE_LAST_ORACLE_PRICE_OFF : V12_17_ENGINE_LAST_ORACLE_PRICE_OFF;
    const fundPxLastOff = isV12_19 ? V12_19_SBF_ENGINE_FUND_PX_LAST_OFF : isSbf ? V12_17_SBF_ENGINE_FUND_PX_LAST_OFF : V12_17_ENGINE_FUND_PX_LAST_OFF;
    const fLongNumOff = isV12_19 ? V12_19_SBF_ENGINE_F_LONG_NUM_OFF : isSbf ? V12_17_SBF_ENGINE_F_LONG_NUM_OFF : V12_17_ENGINE_F_LONG_NUM_OFF;
    const fShortNumOff = isV12_19 ? V12_19_SBF_ENGINE_F_SHORT_NUM_OFF : isSbf ? V12_17_SBF_ENGINE_F_SHORT_NUM_OFF : V12_17_ENGINE_F_SHORT_NUM_OFF;
    const resolvedKLongOff = isV12_19 ? 288 : isSbf ? 288 : V12_17_ENGINE_RESOLVED_K_LONG_OFF;
    const resolvedKShortOff = isV12_19 ? 304 : isSbf ? 304 : V12_17_ENGINE_RESOLVED_K_SHORT_OFF;
    const resolvedLivePriceOff = isV12_19 ? V12_19_SBF_ENGINE_RESOLVED_LIVE_PRICE_OFF : isSbf ? 320 : V12_17_ENGINE_RESOLVED_LIVE_PRICE_OFF;
    const lastCrankSlotOff = isV12_19 ? V12_19_SBF_ENGINE_LAST_MARKET_SLOT_OFF : isSbf ? V12_17_SBF_ENGINE_LAST_CRANK_SLOT_OFF : V12_17_ENGINE_LAST_CRANK_SLOT_OFF;
    const gcCursorOff = isV12_19 ? V12_19_SBF_ENGINE_RR_CURSOR_OFF : isSbf ? V12_17_SBF_ENGINE_GC_CURSOR_OFF : V12_17_ENGINE_GC_CURSOR_OFF;
    const oiEffLongOff = isV12_19 ? V12_19_SBF_ENGINE_OI_EFF_LONG_OFF : isSbf ? V12_17_SBF_ENGINE_OI_EFF_LONG_OFF : V12_17_ENGINE_OI_EFF_LONG_OFF;
    const oiEffShortOff = isV12_19 ? V12_19_SBF_ENGINE_OI_EFF_SHORT_OFF : isSbf ? V12_17_SBF_ENGINE_OI_EFF_SHORT_OFF : V12_17_ENGINE_OI_EFF_SHORT_OFF;
    const longOi = readU128LE(data, base + oiEffLongOff);
    const shortOi = readU128LE(data, base + oiEffShortOff);
    const bitmapEnd = layout.engineBitmapOff + layout.bitmapWords * 8;
    return {
      vault: readU128LE(data, base),
      insuranceFund: {
        balance: readU128LE(data, base + 16),
        feeRevenue: 0n,
        isolatedBalance: 0n,
        isolationBps: 0
      },
      currentSlot: readU64LE(data, base + currentSlotOff),
      fundingIndexQpbE6: 0n,
      // replaced by per-side funding
      lastFundingSlot: 0n,
      fundingRateBpsPerSlotLast: 0n,
      // no stored funding rate in v12.17
      fundingRateE9: 0n,
      // no stored funding rate in v12.17
      marketMode: readU8(data, base + marketModeOff) === 1 ? 1 : 0,
      lastCrankSlot: readU64LE(data, base + lastCrankSlotOff),
      maxCrankStalenessSlots: 0n,
      totalOpenInterest: longOi + shortOi,
      longOi,
      shortOi,
      cTot: readU128LE(data, base + cTotOff),
      pnlPosTot: readU128LE(data, base + pnlPosTotOff),
      pnlMaturedPosTot: readU128LE(data, base + pnlMaturedOff),
      liqCursor: 0,
      gcCursor: readU16LE(data, base + gcCursorOff),
      lastSweepStartSlot: 0n,
      lastSweepCompleteSlot: 0n,
      crankCursor: 0,
      sweepStartIdx: 0,
      lifetimeLiquidations: 0n,
      lifetimeForceCloses: 0n,
      netLpPos: 0n,
      lpSumAbs: 0n,
      lpMaxAbs: 0n,
      lpMaxAbsSweep: 0n,
      emergencyOiMode: false,
      emergencyStartSlot: 0n,
      lastBreakerSlot: 0n,
      markPriceE6: 0n,
      oraclePriceE6: readU64LE(data, base + oraclePriceOff),
      numUsedAccounts: readU16LE(data, base + bitmapEnd),
      nextAccountId: 0n,
      // removed in v12.17 (replaced by mat_counter in header)
      // V12_17 fields
      fLongNum: readI128LE(data, base + fLongNumOff),
      fShortNum: readI128LE(data, base + fShortNumOff),
      negPnlAccountCount: readU64LE(data, base + negPnlOff),
      fundPxLast: readU64LE(data, base + fundPxLastOff),
      resolvedKLongTerminalDelta: readI128LE(data, base + resolvedKLongOff),
      resolvedKShortTerminalDelta: readI128LE(data, base + resolvedKShortOff),
      resolvedLivePrice: readU64LE(data, base + resolvedLivePriceOff)
    };
  }
  const fundingRateBpsPerSlotLast = isV12_15 ? readI128LE(data, base + layout.engineFundingRateBpsOff) : readI64LE(data, base + layout.engineFundingRateBpsOff);
  return {
    vault: readU128LE(data, base),
    insuranceFund: {
      balance: readU128LE(data, base + layout.engineInsuranceOff),
      // feeRevenue: only exists in percolator-core (80-byte InsuranceFund), not deployed (16-byte)
      feeRevenue: layout.hasInsuranceIsolation ? readU128LE(data, base + layout.engineInsuranceOff + 16) : 0n,
      isolatedBalance: layout.hasInsuranceIsolation ? readU128LE(data, base + layout.engineInsuranceIsolatedOff) : 0n,
      isolationBps: layout.hasInsuranceIsolation ? readU16LE(data, base + layout.engineInsuranceIsolationBpsOff) : 0
    },
    currentSlot: readU64LE(data, base + layout.engineCurrentSlotOff),
    fundingIndexQpbE6: layout.engineFundingIndexOff >= 0 ? layout.engineLastFundingSlotOff >= 0 && layout.engineLastFundingSlotOff - layout.engineFundingIndexOff === 8 ? BigInt(readI64LE(data, base + layout.engineFundingIndexOff)) : readI128LE(data, base + layout.engineFundingIndexOff) : 0n,
    lastFundingSlot: layout.engineLastFundingSlotOff >= 0 ? readU64LE(data, base + layout.engineLastFundingSlotOff) : 0n,
    fundingRateBpsPerSlotLast,
    fundingRateE9: isV12_15 ? readI128LE(data, base + layout.engineFundingRateBpsOff) : 0n,
    marketMode: isV12_15 ? readU8(data, base + layout.engineFundingRateBpsOff + 16) === 1 ? 1 : 0 : null,
    lastCrankSlot: layout.engineLastCrankSlotOff >= 0 ? readU64LE(data, base + layout.engineLastCrankSlotOff) : 0n,
    maxCrankStalenessSlots: layout.engineMaxCrankStalenessOff >= 0 ? readU64LE(data, base + layout.engineMaxCrankStalenessOff) : 0n,
    totalOpenInterest: layout.engineTotalOiOff >= 0 ? readU128LE(data, base + layout.engineTotalOiOff) : 0n,
    longOi: layout.engineLongOiOff >= 0 ? readU128LE(data, base + layout.engineLongOiOff) : 0n,
    shortOi: layout.engineShortOiOff >= 0 ? readU128LE(data, base + layout.engineShortOiOff) : 0n,
    cTot: readU128LE(data, base + layout.engineCTotOff),
    pnlPosTot: readU128LE(data, base + layout.enginePnlPosTotOff),
    pnlMaturedPosTot: isV12_15 ? readU128LE(data, base + V12_15_ENGINE_PNL_MATURED_POS_TOT_OFF) : 0n,
    liqCursor: layout.engineLiqCursorOff >= 0 ? readU16LE(data, base + layout.engineLiqCursorOff) : 0,
    gcCursor: layout.engineGcCursorOff >= 0 ? readU16LE(data, base + layout.engineGcCursorOff) : 0,
    lastSweepStartSlot: layout.engineLastSweepStartOff >= 0 ? readU64LE(data, base + layout.engineLastSweepStartOff) : 0n,
    lastSweepCompleteSlot: layout.engineLastSweepCompleteOff >= 0 ? readU64LE(data, base + layout.engineLastSweepCompleteOff) : 0n,
    crankCursor: layout.engineCrankCursorOff >= 0 ? readU16LE(data, base + layout.engineCrankCursorOff) : 0,
    sweepStartIdx: layout.engineSweepStartIdxOff >= 0 ? readU16LE(data, base + layout.engineSweepStartIdxOff) : 0,
    lifetimeLiquidations: layout.engineLifetimeLiquidationsOff >= 0 ? readU64LE(data, base + layout.engineLifetimeLiquidationsOff) : 0n,
    lifetimeForceCloses: layout.engineLifetimeForceClosesOff >= 0 ? readU64LE(data, base + layout.engineLifetimeForceClosesOff) : 0n,
    netLpPos: layout.engineNetLpPosOff >= 0 ? readI128LE(data, base + layout.engineNetLpPosOff) : 0n,
    lpSumAbs: layout.engineLpSumAbsOff >= 0 ? readU128LE(data, base + layout.engineLpSumAbsOff) : 0n,
    lpMaxAbs: layout.engineLpMaxAbsOff >= 0 ? readU128LE(data, base + layout.engineLpMaxAbsOff) : 0n,
    lpMaxAbsSweep: layout.engineLpMaxAbsSweepOff >= 0 ? readU128LE(data, base + layout.engineLpMaxAbsSweepOff) : 0n,
    emergencyOiMode: layout.engineEmergencyOiModeOff >= 0 ? data[base + layout.engineEmergencyOiModeOff] !== 0 : false,
    emergencyStartSlot: layout.engineEmergencyStartSlotOff >= 0 ? readU64LE(data, base + layout.engineEmergencyStartSlotOff) : 0n,
    lastBreakerSlot: layout.engineLastBreakerSlotOff >= 0 ? readU64LE(data, base + layout.engineLastBreakerSlotOff) : 0n,
    markPriceE6: layout.engineMarkPriceOff >= 0 ? readU64LE(data, base + layout.engineMarkPriceOff) : 0n,
    // V12_15: last_oracle_price at engine+608 (SBF) / engine+... (native).
    // Located at bitmapOff - 40 on SBF (648-40=608, verified on-chain).
    oraclePriceE6: isV12_15 ? readU64LE(data, base + layout.engineBitmapOff - 40) : 0n,
    numUsedAccounts: (() => {
      if (layout.postBitmap < 18) return 0;
      const bw = layout.bitmapWords;
      return readU16LE(data, base + layout.engineBitmapOff + bw * 8);
    })(),
    nextAccountId: (() => {
      if (layout.postBitmap < 18) return 0n;
      const bw = layout.bitmapWords;
      const numUsedOff = layout.engineBitmapOff + bw * 8;
      return readU64LE(data, base + Math.ceil((numUsedOff + 2) / 8) * 8);
    })(),
    // V12_17 fields (not present in pre-v12.17)
    fLongNum: 0n,
    fShortNum: 0n,
    negPnlAccountCount: 0n,
    fundPxLast: 0n,
    resolvedKLongTerminalDelta: 0n,
    resolvedKShortTerminalDelta: 0n,
    resolvedLivePrice: 0n
  };
}
function parseUsedIndices(data) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) throw new Error(`Unrecognized slab data length: ${data.length}`);
  const base = layout.engineOff + layout.engineBitmapOff;
  if (data.length < base + layout.bitmapWords * 8) {
    throw new Error("Slab data too short for bitmap");
  }
  const used = [];
  for (let word = 0; word < layout.bitmapWords; word++) {
    const bits = readU64LE(data, base + word * 8);
    if (bits === 0n) continue;
    for (let bit = 0; bit < 64; bit++) {
      if (bits >> BigInt(bit) & 1n) {
        used.push(word * 64 + bit);
      }
    }
  }
  return used;
}
function isAccountUsed(data, idx) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) return false;
  if (!Number.isInteger(idx) || idx < 0 || idx >= layout.maxAccounts) return false;
  const base = layout.engineOff + layout.engineBitmapOff;
  const word = Math.floor(idx / 64);
  const bit = idx % 64;
  const bits = readU64LE(data, base + word * 8);
  return (bits >> BigInt(bit) & 1n) !== 0n;
}
function maxAccountIndex(dataLen) {
  const layout = detectSlabLayout(dataLen);
  if (!layout) return 0;
  const accountsEnd = dataLen - layout.accountsOff;
  if (accountsEnd <= 0) return 0;
  return Math.min(
    Math.floor(accountsEnd / layout.accountSize),
    layout.maxAccounts
  );
}
function parseAccount(data, idx) {
  const layout = detectSlabLayout(data.length, data);
  if (!layout) throw new Error(`Unrecognized slab data length: ${data.length}`);
  const maxIdx = maxAccountIndex(data.length);
  if (!Number.isInteger(idx) || idx < 0 || idx >= maxIdx) {
    throw new Error(`Account index out of range: ${idx} (max: ${maxIdx - 1})`);
  }
  const base = layout.accountsOff + idx * layout.accountSize;
  if (data.length < base + layout.accountSize) {
    throw new Error("Slab data too short for account");
  }
  const isV12_17 = layout.accountSize === V12_17_ACCOUNT_SIZE || layout.accountSize === V12_17_ACCOUNT_SIZE_SBF || layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
  const isV12_15 = !isV12_17 && (layout.accountSize === V12_15_ACCOUNT_SIZE || layout.accountSize === V12_15_ACCOUNT_SIZE_SMALL);
  const isV12_1EP = !isV12_17 && !isV12_15 && layout.accountSize === V12_1_EP_SBF_ACCOUNT_SIZE && layout.engineOff === V12_1_SBF_ENGINE_OFF;
  const isV12_1 = !isV12_17 && !isV12_15 && !isV12_1EP && (layout.engineOff === V12_1_ENGINE_OFF || layout.engineOff === V12_1_SBF_ENGINE_OFF) && (layout.accountSize === V12_1_ACCOUNT_SIZE || layout.accountSize === V12_1_ACCOUNT_SIZE_SBF);
  const isAdl = !isV12_17 && !isV12_15 && (layout.accountSize >= 312 || isV12_1 || isV12_1EP);
  if (isV12_17) {
    const isSbf = layout.accountSize === V12_17_ACCOUNT_SIZE_SBF || layout.accountSize === V12_19_ACCOUNT_SIZE_SBF;
    const d1 = isSbf ? 8 : 0;
    const d2 = isSbf ? 16 : 0;
    const kindByte2 = readU8(data, base + V12_17_ACCT_KIND_OFF);
    const kind2 = kindByte2 === 1 ? 1 /* LP */ : 0 /* User */;
    return {
      kind: kind2,
      accountId: 0n,
      // removed in v12.17
      capital: readU128LE(data, base + V12_17_ACCT_CAPITAL_OFF),
      pnl: readI128LE(data, base + V12_17_ACCT_PNL_OFF - d1),
      reservedPnl: readU128LE(data, base + V12_17_ACCT_RESERVED_PNL_OFF - d1),
      warmupStartedAtSlot: 0n,
      // removed
      warmupSlopePerStep: 0n,
      // removed
      positionSize: readI128LE(data, base + V12_17_ACCT_POSITION_BASIS_Q_OFF - d1),
      entryPrice: 0n,
      // removed — compute off-chain from position_basis_q / effective_pos_q
      fundingIndex: 0n,
      // replaced by per-side f_long_num/f_short_num + per-account f_snap
      matcherProgram: new PublicKey(data.subarray(base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1, base + V12_17_ACCT_MATCHER_PROGRAM_OFF - d1 + 32)),
      matcherContext: new PublicKey(data.subarray(base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1, base + V12_17_ACCT_MATCHER_CONTEXT_OFF - d1 + 32)),
      owner: new PublicKey(data.subarray(base + V12_17_ACCT_OWNER_OFF - d1, base + V12_17_ACCT_OWNER_OFF - d1 + 32)),
      feeCredits: readI128LE(data, base + V12_17_ACCT_FEE_CREDITS_OFF - d1),
      lastFeeSlot: 0n,
      // removed
      feesEarnedTotal: 0n,
      // removed in v12.17
      exactReserveCohorts: null,
      // replaced by two-bucket warmup
      exactCohortCount: null,
      overflowOlder: null,
      overflowOlderPresent: null,
      overflowNewest: null,
      overflowNewestPresent: null,
      // V12_17 fields
      fSnap: readI128LE(data, base + V12_17_ACCT_F_SNAP_OFF - d1),
      adlABasis: readU128LE(data, base + V12_17_ACCT_ADL_A_BASIS_OFF - d1),
      adlKSnap: readI128LE(data, base + V12_17_ACCT_ADL_K_SNAP_OFF - d1),
      adlEpochSnap: readU64LE(data, base + V12_17_ACCT_ADL_EPOCH_SNAP_OFF - d1),
      schedPresent: readU8(data, base + V12_17_ACCT_SCHED_PRESENT_OFF - d1) !== 0,
      schedRemainingQ: readU128LE(data, base + V12_17_ACCT_SCHED_REMAINING_Q_OFF - d1),
      schedAnchorQ: readU128LE(data, base + V12_17_ACCT_SCHED_ANCHOR_Q_OFF - d1),
      schedStartSlot: readU64LE(data, base + V12_17_ACCT_SCHED_START_SLOT_OFF - d1),
      schedHorizon: readU64LE(data, base + V12_17_ACCT_SCHED_HORIZON_OFF - d1),
      schedReleaseQ: readU128LE(data, base + V12_17_ACCT_SCHED_RELEASE_Q_OFF - d1),
      pendingPresent: readU8(data, base + V12_17_ACCT_PENDING_PRESENT_OFF - d1) !== 0,
      pendingRemainingQ: readU128LE(data, base + V12_17_ACCT_PENDING_REMAINING_Q_OFF - d2),
      pendingHorizon: readU64LE(data, base + V12_17_ACCT_PENDING_HORIZON_OFF - d2),
      pendingCreatedSlot: readU64LE(data, base + V12_17_ACCT_PENDING_CREATED_SLOT_OFF - d2)
    };
  }
  if (isV12_15) {
    const kindByte2 = readU8(data, base + V12_15_ACCT_KIND_OFF);
    const kind2 = kindByte2 === 1 ? 1 /* LP */ : 0 /* User */;
    const cohortCount = readU8(data, base + V12_15_ACCT_EXACT_COHORT_COUNT_OFF);
    const exactReserveCohorts = [];
    for (let i = 0; i < 62; i++) {
      const cohortOff = base + V12_15_ACCT_EXACT_RESERVE_COHORTS_OFF + i * 64;
      exactReserveCohorts.push(data.slice(cohortOff, cohortOff + 64));
    }
    const overflowOlderPresent = readU8(data, base + V12_15_ACCT_OVERFLOW_OLDER_PRESENT_OFF) !== 0;
    const overflowNewestPresent = readU8(data, base + V12_15_ACCT_OVERFLOW_NEWEST_PRESENT_OFF) !== 0;
    return {
      kind: kind2,
      accountId: readU64LE(data, base + V12_15_ACCT_ACCOUNT_ID_OFF),
      capital: readU128LE(data, base + V12_15_ACCT_CAPITAL_OFF),
      pnl: readI128LE(data, base + V12_15_ACCT_PNL_OFF),
      reservedPnl: readU128LE(data, base + V12_15_ACCT_RESERVED_PNL_OFF),
      warmupStartedAtSlot: 0n,
      // removed in v12.15
      warmupSlopePerStep: 0n,
      // removed in v12.15
      positionSize: readI128LE(data, base + V12_15_ACCT_POSITION_BASIS_Q_OFF),
      entryPrice: readU64LE(data, base + V12_15_ACCT_ENTRY_PRICE_OFF),
      fundingIndex: 0n,
      // not present in v12.15 account struct
      matcherProgram: new PublicKey(data.subarray(base + V12_15_ACCT_MATCHER_PROGRAM_OFF, base + V12_15_ACCT_MATCHER_PROGRAM_OFF + 32)),
      matcherContext: new PublicKey(data.subarray(base + V12_15_ACCT_MATCHER_CONTEXT_OFF, base + V12_15_ACCT_MATCHER_CONTEXT_OFF + 32)),
      owner: new PublicKey(data.subarray(base + V12_15_ACCT_OWNER_OFF, base + V12_15_ACCT_OWNER_OFF + 32)),
      feeCredits: readI128LE(data, base + V12_15_ACCT_FEE_CREDITS_OFF),
      lastFeeSlot: 0n,
      // removed in v12.15
      feesEarnedTotal: readU128LE(data, base + V12_15_ACCT_FEES_EARNED_TOTAL_OFF),
      exactReserveCohorts,
      exactCohortCount: cohortCount,
      overflowOlder: data.slice(base + V12_15_ACCT_OVERFLOW_OLDER_OFF, base + V12_15_ACCT_OVERFLOW_OLDER_OFF + 64),
      overflowOlderPresent,
      overflowNewest: data.slice(base + V12_15_ACCT_OVERFLOW_NEWEST_OFF, base + V12_15_ACCT_OVERFLOW_NEWEST_OFF + 64),
      overflowNewestPresent,
      // v12.17 fields (not present in v12.15)
      fSnap: 0n,
      adlABasis: 0n,
      adlKSnap: 0n,
      adlEpochSnap: 0n,
      schedPresent: null,
      schedRemainingQ: null,
      schedAnchorQ: null,
      schedStartSlot: null,
      schedHorizon: null,
      schedReleaseQ: null,
      pendingPresent: null,
      pendingRemainingQ: null,
      pendingHorizon: null,
      pendingCreatedSlot: null
    };
  }
  const warmupStartedOff = isAdl ? V_ADL_ACCT_WARMUP_STARTED_OFF : ACCT_WARMUP_STARTED_OFF;
  const warmupSlopeOff = isAdl ? V_ADL_ACCT_WARMUP_SLOPE_OFF : ACCT_WARMUP_SLOPE_OFF;
  const positionSizeOff = isV12_1 || isV12_1EP ? V12_1_ACCT_POSITION_SIZE_OFF : isAdl ? V_ADL_ACCT_POSITION_SIZE_OFF : ACCT_POSITION_SIZE_OFF;
  const entryPriceOff = isV12_1EP ? V12_1_EP_ACCT_ENTRY_PRICE_OFF : isV12_1 ? V12_1_ACCT_ENTRY_PRICE_OFF : isAdl ? V_ADL_ACCT_ENTRY_PRICE_OFF : ACCT_ENTRY_PRICE_OFF;
  const fundingIndexOff = isV12_1 || isV12_1EP ? -1 : isAdl ? V_ADL_ACCT_FUNDING_INDEX_OFF : ACCT_FUNDING_INDEX_OFF;
  const matcherProgOff = isV12_1EP ? V12_1_EP_ACCT_MATCHER_PROGRAM_OFF : isV12_1 ? V12_1_ACCT_MATCHER_PROGRAM_OFF : isAdl ? V_ADL_ACCT_MATCHER_PROGRAM_OFF : ACCT_MATCHER_PROGRAM_OFF;
  const matcherCtxOff = isV12_1EP ? V12_1_EP_ACCT_MATCHER_CONTEXT_OFF : isV12_1 ? V12_1_ACCT_MATCHER_CONTEXT_OFF : isAdl ? V_ADL_ACCT_MATCHER_CONTEXT_OFF : ACCT_MATCHER_CONTEXT_OFF;
  const feeCreditsOff = isV12_1EP ? V12_1_EP_ACCT_FEE_CREDITS_OFF : isV12_1 ? V12_1_ACCT_FEE_CREDITS_OFF : isAdl ? V_ADL_ACCT_FEE_CREDITS_OFF : ACCT_FEE_CREDITS_OFF;
  const lastFeeSlotOff = isV12_1EP ? V12_1_EP_ACCT_LAST_FEE_SLOT_OFF : isV12_1 ? V12_1_ACCT_LAST_FEE_SLOT_OFF : isAdl ? V_ADL_ACCT_LAST_FEE_SLOT_OFF : ACCT_LAST_FEE_SLOT_OFF;
  const kindByte = readU8(data, base + ACCT_KIND_OFF);
  const kind = kindByte === 1 ? 1 /* LP */ : 0 /* User */;
  return {
    kind,
    accountId: readU64LE(data, base + ACCT_ACCOUNT_ID_OFF),
    capital: readU128LE(data, base + ACCT_CAPITAL_OFF),
    pnl: readI128LE(data, base + ACCT_PNL_OFF),
    reservedPnl: isAdl ? readU128LE(data, base + ACCT_RESERVED_PNL_OFF) : readU64LE(data, base + ACCT_RESERVED_PNL_OFF),
    warmupStartedAtSlot: readU64LE(data, base + warmupStartedOff),
    warmupSlopePerStep: readU128LE(data, base + warmupSlopeOff),
    positionSize: readI128LE(data, base + positionSizeOff),
    entryPrice: entryPriceOff >= 0 ? readU64LE(data, base + entryPriceOff) : 0n,
    // V12_1/V12_1_EP: funding_index not present in SBF layout
    fundingIndex: isV12_1 || isV12_1EP ? fundingIndexOff >= 0 ? BigInt(readI64LE(data, base + fundingIndexOff)) : 0n : readI128LE(data, base + fundingIndexOff),
    matcherProgram: new PublicKey(data.subarray(base + matcherProgOff, base + matcherProgOff + 32)),
    matcherContext: new PublicKey(data.subarray(base + matcherCtxOff, base + matcherCtxOff + 32)),
    owner: new PublicKey(data.subarray(base + layout.acctOwnerOff, base + layout.acctOwnerOff + 32)),
    feeCredits: readI128LE(data, base + feeCreditsOff),
    lastFeeSlot: readU64LE(data, base + lastFeeSlotOff),
    feesEarnedTotal: 0n,
    // not present in pre-v12.15 layouts
    exactReserveCohorts: null,
    // not present in pre-v12.15 layouts
    exactCohortCount: null,
    overflowOlder: null,
    overflowOlderPresent: null,
    overflowNewest: null,
    overflowNewestPresent: null,
    // v12.17 fields (not present in pre-v12.17)
    fSnap: 0n,
    adlABasis: 0n,
    adlKSnap: 0n,
    adlEpochSnap: 0n,
    schedPresent: null,
    schedRemainingQ: null,
    schedAnchorQ: null,
    schedStartSlot: null,
    schedHorizon: null,
    schedReleaseQ: null,
    pendingPresent: null,
    pendingRemainingQ: null,
    pendingHorizon: null,
    pendingCreatedSlot: null
  };
}
const V17_MAGIC = 0x5045524356313600n;
const V17_EXPECTED_VERSION = 18;
const V17_KIND_MARKET = 1;
const V17_KIND_OFF = 10;
const V17_WRAPPER_CONFIG_LEN = 576;
const V17_CREATOR_FEE_CLAIMABLE_OFF = 568;
const V17_ASSET_ORACLE_PROFILE_LEN = 512;
const V17_ASSET_ORACLE_WRAPPER_LEN = 1024;
const V17_ASSET_CONTROL_SEQUENCES_OFF = V17_ASSET_ORACLE_PROFILE_LEN;
const V17_ASSET_CONTROL_SEQUENCES_LEN = 88;
const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF = V17_ASSET_CONTROL_SEQUENCES_OFF + V17_ASSET_CONTROL_SEQUENCES_LEN;
const V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN = 8;
const ACS_ORACLE_OBSERVATION_OFF = 0;
const ACS_BACKING_FEE_LONG_OFF = 8;
const ACS_BACKING_FEE_SHORT_OFF = 16;
const ACS_TRADE_FEE_OFF = 24;
const ACS_LIQUIDATION_FEE_OFF = 32;
const ACS_MAINTENANCE_FEE_OFF = 40;
const ACS_FEE_REDIRECT_OFF = 48;
const ACS_MARKET_INIT_FEE_OFF = 56;
const ACS_PERMISSIONLESS_RESOLVE_OFF = 64;
const ACS_AUTHORITY_EPOCH_OFF = 72;
function parseAssetControlSequencesV17(data, assetSlotOff) {
  const base = assetSlotOff + V17_ASSET_CONTROL_SEQUENCES_OFF;
  const MIN_LEN = base + V17_ASSET_CONTROL_SEQUENCES_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseAssetControlSequencesV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  return {
    oracleObservation: readU64LE(data, base + ACS_ORACLE_OBSERVATION_OFF),
    backingFeeLong: readU64LE(data, base + ACS_BACKING_FEE_LONG_OFF),
    backingFeeShort: readU64LE(data, base + ACS_BACKING_FEE_SHORT_OFF),
    tradeFee: readU64LE(data, base + ACS_TRADE_FEE_OFF),
    liquidationFee: readU64LE(data, base + ACS_LIQUIDATION_FEE_OFF),
    maintenanceFee: readU64LE(data, base + ACS_MAINTENANCE_FEE_OFF),
    feeRedirect: readU64LE(data, base + ACS_FEE_REDIRECT_OFF),
    marketInitFee: readU64LE(data, base + ACS_MARKET_INIT_FEE_OFF),
    permissionlessResolve: readU64LE(data, base + ACS_PERMISSIONLESS_RESOLVE_OFF),
    authorityEpoch: readU64LE(data, base + ACS_AUTHORITY_EPOCH_OFF)
  };
}
function parseProtocolFeeAuthorityEpoch(data, asset0SlotOff) {
  const off = asset0SlotOff + V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF;
  const MIN_LEN = off + V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseProtocolFeeAuthorityEpoch: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  return readU64LE(data, off);
}
const V17_HEADER_LEN = 16;
const V17_MARKET_GROUP_OFF = V17_HEADER_LEN + V17_WRAPPER_CONFIG_LEN;
const V17_MARKET_GROUP_LEN = 758;
const V17_MARKET_ASSET_SLOT_LEN = 2325;
function v17MarketAccountLen(maxPortfolioAssets) {
  if (!Number.isInteger(maxPortfolioAssets) || maxPortfolioAssets < 1) {
    throw new Error(`v17MarketAccountLen: maxPortfolioAssets must be a positive integer, got ${maxPortfolioAssets}`);
  }
  return V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN + maxPortfolioAssets * V17_MARKET_ASSET_SLOT_LEN;
}
const V17_PORTFOLIO_ACCOUNT_LEN = 9563;
const V17_PORTFOLIO_LEG_SIZE = 152;
const V17_PORTFOLIO_IDENTITY_TRAILER_LEN = 24;
function parseWrapperConfigV17(data, configOff = V17_HEADER_LEN) {
  const MIN_LEN = configOff + V17_WRAPPER_CONFIG_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseWrapperConfigV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  const b = configOff;
  const marketauth = new PublicKey(data.subarray(b + 0, b + 32));
  const collateralMint = new PublicKey(data.subarray(b + 32, b + 64));
  const secondaryCollateralMint = new PublicKey(data.subarray(b + 64, b + 96));
  const maintenanceFeePerSlot = readU128LE(data, b + 96);
  const permissionlessMarketInitFee = readU128LE(data, b + 112);
  const tradeFeeBps = readU64LE(data, b + 128);
  const permissionlessResolveStaleSlots = readU64LE(data, b + 136);
  const forceCloseDelaySlots = readU64LE(data, b + 144);
  const lastGoodOracleSlot = readU64LE(data, b + 152);
  const insuranceWithdrawDepositRemaining = readU128LE(data, b + 160);
  const insuranceWithdrawMaxBps = readU16LE(data, b + 176);
  const liquidationCrankerFeeShareBps = readU16LE(data, b + 178);
  const maintenanceCrankerFeeShareBps = readU16LE(data, b + 180);
  const backingTradeFeeBpsLong = readU16LE(data, b + 182);
  const unitScale = readU32LE(data, b + 184);
  const confFilterBps = readU16LE(data, b + 188);
  const backingTradeFeeBpsShort = readU16LE(data, b + 190);
  const insuranceWithdrawDepositsOnly = readU8(data, b + 192);
  const oracleMode = readU8(data, b + 193);
  const oracleLegCount = readU8(data, b + 194);
  const oracleLegFlags = readU8(data, b + 195);
  const invert = readU8(data, b + 196);
  const freeMarketSlotCount = readU16LE(data, b + 198);
  const insuranceWithdrawCooldownSlots = readU64LE(data, b + 200);
  const lastInsuranceWithdrawSlot = readU64LE(data, b + 208);
  const maxStalenessSecs = readU64LE(data, b + 216);
  const hybridSoftStaleSlots = readU64LE(data, b + 224);
  const markEwmaE6 = readU64LE(data, b + 232);
  const markEwmaLastSlot = readU64LE(data, b + 240);
  const markEwmaHalflifeSlots = readU64LE(data, b + 248);
  const markMinFee = readU64LE(data, b + 256);
  const oracleTargetPriceE6 = readU64LE(data, b + 264);
  const oracleTargetPublishTime = readI64LE(data, b + 272);
  const ORACLE_LEG_CAP = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegFeeds.push(new PublicKey(data.subarray(b + 280 + i * 32, b + 280 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 376 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPublishTimes.push(readI64LE(data, b + 400 + i * 8));
  }
  const backingTradeFeePolicyCount = readU16LE(data, b + 424);
  const backingTradeFeeInsuranceShareBpsLong = readU16LE(data, b + 426);
  const backingTradeFeeInsuranceShareBpsShort = readU16LE(data, b + 428);
  const feeRedirectToMarket0Bps = readU16LE(data, b + 430);
  const protocolFeeAuthority = new PublicKey(data.subarray(b + 432, b + 464));
  const protocolFeeAccruedAtoms = readU128LE(data, b + 464);
  const protocolFeeWithdrawnAtoms = readU128LE(data, b + 480);
  const lpFeeAccruedAtoms = readU128LE(data, b + 496);
  const lpFeeWithdrawnAtoms = readU128LE(data, b + 512);
  const insuranceReserveAccruedAtoms = readU128LE(data, b + 528);
  const insuranceReserveWithdrawnAtoms = readU128LE(data, b + 544);
  const creatorShareBps = readU16LE(data, b + 560);
  const lpShareBps = readU16LE(data, b + 562);
  const insuranceShareBps = readU16LE(data, b + 564);
  const creatorFeeClaimableAtoms = readU64LE(data, b + V17_CREATOR_FEE_CLAIMABLE_OFF);
  return {
    marketauth,
    collateralMint,
    secondaryCollateralMint,
    maintenanceFeePerSlot,
    permissionlessMarketInitFee,
    tradeFeeBps,
    permissionlessResolveStaleSlots,
    forceCloseDelaySlots,
    lastGoodOracleSlot,
    insuranceWithdrawDepositRemaining,
    insuranceWithdrawMaxBps,
    liquidationCrankerFeeShareBps,
    maintenanceCrankerFeeShareBps,
    backingTradeFeeBpsLong,
    unitScale,
    confFilterBps,
    backingTradeFeeBpsShort,
    insuranceWithdrawDepositsOnly,
    oracleMode,
    oracleLegCount,
    oracleLegFlags,
    invert,
    freeMarketSlotCount,
    insuranceWithdrawCooldownSlots,
    lastInsuranceWithdrawSlot,
    maxStalenessSecs,
    hybridSoftStaleSlots,
    markEwmaE6,
    markEwmaLastSlot,
    markEwmaHalflifeSlots,
    markMinFee,
    oracleTargetPriceE6,
    oracleTargetPublishTime,
    oracleLegFeeds,
    oracleLegPricesE6,
    oracleLegPublishTimes,
    backingTradeFeePolicyCount,
    backingTradeFeeInsuranceShareBpsLong,
    backingTradeFeeInsuranceShareBpsShort,
    feeRedirectToMarket0Bps,
    protocolFeeAuthority,
    protocolFeeAccruedAtoms,
    protocolFeeWithdrawnAtoms,
    lpFeeAccruedAtoms,
    lpFeeWithdrawnAtoms,
    insuranceReserveAccruedAtoms,
    insuranceReserveWithdrawnAtoms,
    creatorShareBps,
    lpShareBps,
    insuranceShareBps,
    creatorFeeClaimableAtoms
  };
}
function parseAssetOracleProfileV17(data, profileOff) {
  const MIN_LEN = profileOff + V17_ASSET_ORACLE_PROFILE_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseAssetOracleProfileV17: data too short \u2014 need ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  const b = profileOff;
  const ORACLE_LEG_CAP = 3;
  const oracleLegFeeds = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegFeeds.push(new PublicKey(data.subarray(b + 224 + i * 32, b + 224 + (i + 1) * 32)));
  }
  const oracleLegPricesE6 = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPricesE6.push(readU64LE(data, b + 320 + i * 8));
  }
  const oracleLegPublishTimes = [];
  for (let i = 0; i < ORACLE_LEG_CAP; i++) {
    oracleLegPublishTimes.push(readI64LE(data, b + 344 + i * 8));
  }
  return {
    oracleMode: readU8(data, b + 0),
    oracleLegCount: readU8(data, b + 1),
    oracleLegFlags: readU8(data, b + 2),
    invert: readU8(data, b + 3),
    unitScale: readU32LE(data, b + 4),
    confFilterBps: readU16LE(data, b + 8),
    backingTradeFeeBpsLong: readU16LE(data, b + 10),
    backingTradeFeeBpsShort: readU16LE(data, b + 12),
    backingTradeFeeInsuranceShareBpsLong: readU16LE(data, b + 14),
    backingTradeFeeInsuranceShareBpsShort: readU16LE(data, b + 16),
    insuranceAuthority: new PublicKey(data.subarray(b + 24, b + 56)),
    insuranceOperator: new PublicKey(data.subarray(b + 56, b + 88)),
    backingBucketAuthority: new PublicKey(data.subarray(b + 88, b + 120)),
    oracleAuthority: new PublicKey(data.subarray(b + 120, b + 152)),
    maxStalenessSecs: readU64LE(data, b + 152),
    hybridSoftStaleSlots: readU64LE(data, b + 160),
    markEwmaE6: readU64LE(data, b + 168),
    markEwmaLastSlot: readU64LE(data, b + 176),
    markEwmaHalflifeSlots: readU64LE(data, b + 184),
    markMinFee: readU64LE(data, b + 192),
    oracleTargetPriceE6: readU64LE(data, b + 200),
    oracleTargetPublishTime: readI64LE(data, b + 208),
    lastGoodOracleSlot: readU64LE(data, b + 216),
    oracleLegFeeds,
    oracleLegPricesE6,
    oracleLegPublishTimes,
    assetAdmin: new PublicKey(data.subarray(b + 368, b + 400)),
    creatorFeeClaimableAtoms: readU64LE(data, b + 400),
    maintenanceFeeCheckpointSlot: readU64LE(data, b + 408),
    maintenanceFeePreviousRate: readU128LE(data, b + 416),
    fundingMarkE6: readU64LE(data, b + 432),
    fundingMarkPendingE6: readU64LE(data, b + 440),
    fundingMarkPendingSlot: readU64LE(data, b + 448),
    priceMoveRemainderBpsNum: readU16LE(data, b + 456),
    // bytes [458, 464) are `_padding1: [u8; 6]`, always zero, not decoded.
    terminalSlabScanProgress: readU128LE(data, b + 464),
    nextPortfolioId: readU64LE(data, b + 480),
    // bytes [488, 496) are `_padding2: [u8; 8]`, always zero, not decoded.
    insuranceTopUp: readU64LE(data, b + 496),
    backingTopUp: readU64LE(data, b + 504)
  };
}
function isV17Account(data) {
  if (data.length < 10) return false;
  const magic = readU64LE(data, 0);
  const version = readU16LE(data, 8);
  return magic === V17_MAGIC && version === V17_EXPECTED_VERSION;
}
function isV17MarketAccount(data) {
  if (data.length < V17_KIND_OFF + 1) return false;
  if (!isV17Account(data)) return false;
  return data[V17_KIND_OFF] === V17_KIND_MARKET;
}
const V17_HEADER_INSURANCE_OFF = 301;
const V17_ASSET_SLOT_WRAPPER_SIZE = V17_ASSET_ORACLE_WRAPPER_LEN;
const V17_ASSET_STATE_OI_LONG_REL = 289;
const V17_ASSET_STATE_OI_SHORT_REL = 305;
function parseMarketGroupV17OI(data) {
  const MIN_LEN = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  if (data.length < MIN_LEN) {
    throw new Error(
      `parseMarketGroupV17OI: buffer too short \u2014 need >= ${MIN_LEN} bytes, got ${data.length}`
    );
  }
  if (!isV17MarketAccount(data)) {
    throw new Error(
      "parseMarketGroupV17OI: not a v17 market account (bad magic, version, or kind)"
    );
  }
  const insuranceOff = V17_MARKET_GROUP_OFF + V17_HEADER_INSURANCE_OFF;
  const insuranceBalance = readU128LE(data, insuranceOff);
  const slotsBase = V17_MARKET_GROUP_OFF + V17_MARKET_GROUP_LEN;
  const numSlots = Math.floor(
    (data.length - slotsBase) / V17_MARKET_ASSET_SLOT_LEN
  );
  let totalLongOiQ = 0n;
  let totalShortOiQ = 0n;
  const assets = [];
  for (let i = 0; i < numSlots; i++) {
    const slotBase = slotsBase + i * V17_MARKET_ASSET_SLOT_LEN;
    const longOff = slotBase + V17_ASSET_SLOT_WRAPPER_SIZE + V17_ASSET_STATE_OI_LONG_REL;
    const shortOff = slotBase + V17_ASSET_SLOT_WRAPPER_SIZE + V17_ASSET_STATE_OI_SHORT_REL;
    if (shortOff + 16 > data.length) break;
    const oiEffLongQ = readU128LE(data, longOff);
    const oiEffShortQ = readU128LE(data, shortOff);
    totalLongOiQ += oiEffLongQ;
    totalShortOiQ += oiEffShortQ;
    if (oiEffLongQ !== 0n || oiEffShortQ !== 0n) {
      assets.push({ assetIndex: i, oiEffLongQ, oiEffShortQ });
    }
  }
  return { insuranceBalance, totalLongOiQ, totalShortOiQ, assets };
}
const V17_ACCOUNT_HEADER_LEN = 16;
const V17_KIND_PORTFOLIO = 2;
const V17_KIND_LP_VAULT_REGISTRY = 5;
const V17_KIND_LP_REDEMPTION = 6;
function assertV17StandaloneHeader(data, parserName, expectedKind) {
  if (data.length < V17_ACCOUNT_HEADER_LEN) {
    throw new Error(`${parserName}: data too short (${data.length} < ${V17_ACCOUNT_HEADER_LEN})`);
  }
  const magic = readU64LE(data, 0);
  if (magic !== V17_MAGIC) {
    throw new Error(`${parserName}: invalid v17 magic`);
  }
  const version = readU16LE(data, 8);
  if (version !== V17_EXPECTED_VERSION) {
    throw new Error(`${parserName}: invalid v17 version (${version} !== ${V17_EXPECTED_VERSION})`);
  }
  const kind = readU8(data, 10);
  if (kind !== expectedKind) {
    throw new Error(`${parserName}: invalid v17 account kind (${kind} !== ${expectedKind})`);
  }
}
const PF_PROVENANCE_OFF = V17_ACCOUNT_HEADER_LEN;
const PF_PROVENANCE_MARKET_GROUP_OFF = PF_PROVENANCE_OFF;
const PF_PROVENANCE_ACCOUNT_ID_OFF = PF_PROVENANCE_OFF + 32;
const PF_PROVENANCE_OWNER_OFF = PF_PROVENANCE_OFF + 64;
const PF_PROVENANCE_VERSION_OFF = PF_PROVENANCE_OFF + 96;
const PF_PROVENANCE_DISC_OFF = PF_PROVENANCE_OFF + 98;
const PF_BODY_OFF = PF_PROVENANCE_OFF + 100;
const PF_OWNER_OFF = PF_BODY_OFF;
const PF_CAPITAL_OFF = PF_BODY_OFF + 32;
const PF_PNL_OFF = PF_BODY_OFF + 48;
const PF_RESERVED_PNL_OFF = PF_BODY_OFF + 64;
const PF_RESIDUAL_LOSS_OFF = PF_BODY_OFF + 80;
const PF_RESIDUAL_PRINCIPAL_OFF = PF_BODY_OFF + 96;
const PF_RESIDUAL_RECEIVED_OFF = PF_BODY_OFF + 112;
const PF_FUNDING_LONG_PAID_OFF = PF_BODY_OFF + 128;
const PF_FUNDING_LONG_RECEIVED_OFF = PF_BODY_OFF + 144;
const PF_FUNDING_SHORT_PAID_OFF = PF_BODY_OFF + 160;
const PF_FUNDING_SHORT_RECEIVED_OFF = PF_BODY_OFF + 176;
const PF_FEE_CREDITS_OFF = PF_BODY_OFF + 192;
const PF_CANCEL_ESCROW_OFF = PF_BODY_OFF + 208;
const PF_LAST_FEE_SLOT_OFF = PF_BODY_OFF + 224;
const PF_ACTIVE_BITMAP_OFF = PF_BODY_OFF + 232;
const PF_LEG_SIZE = V17_PORTFOLIO_LEG_SIZE;
const PF_LEGS_OFF = PF_BODY_OFF + 240;
const PF_LEGS_COUNT = 16;
const PF_SOURCE_DOMAIN_SIZE = 196;
const PF_SOURCE_DOMAINS_OFF = PF_LEGS_OFF + PF_LEGS_COUNT * PF_LEG_SIZE;
const PF_SOURCE_DOMAINS_CAP = 32;
const PF_HEALTH_CERT_OFF = PF_SOURCE_DOMAINS_OFF + PF_SOURCE_DOMAINS_CAP * PF_SOURCE_DOMAIN_SIZE;
const PF_MATCHER_CONFIG_LEN = 104;
const PF_MATCHER_PROGRAM_OFF = V17_PORTFOLIO_ACCOUNT_LEN - PF_MATCHER_CONFIG_LEN - V17_PORTFOLIO_IDENTITY_TRAILER_LEN;
const PF_MATCHER_CONTEXT_OFF = PF_MATCHER_PROGRAM_OFF + 32;
const PF_MATCHER_DELEGATE_OFF = PF_MATCHER_CONTEXT_OFF + 32;
const PF_MATCHER_CONTROL_OFF = PF_MATCHER_DELEGATE_OFF + 32;
const PF_MATCHER_ENABLED_OFF = PF_MATCHER_CONTROL_OFF;
const PF_PORTFOLIO_ID_OFF = PF_MATCHER_PROGRAM_OFF + PF_MATCHER_CONFIG_LEN;
const PF_MATCHER_SEQUENCE_OFF = PF_PORTFOLIO_ID_OFF + 8;
const PF_MATCHER_EXPIRY_OFF = PF_MATCHER_SEQUENCE_OFF + 8;
function decodePortfolioMatcherControl(control) {
  const ENABLED_MASK = 1n;
  const POSITION_EPOCH_BITS = 49n;
  const POSITION_EPOCH_SHIFT = 1n;
  const POSITION_EPOCH_MASK = (1n << POSITION_EPOCH_BITS) - 1n << POSITION_EPOCH_SHIFT;
  const TRADE_FEE_CAP_SHIFT = 50n;
  const TRADE_FEE_CAP_MASK = 0x3fffn << TRADE_FEE_CAP_SHIFT;
  return {
    enabled: (control & ENABLED_MASK) === 1n,
    positionEpoch: (control & POSITION_EPOCH_MASK) >> POSITION_EPOCH_SHIFT,
    tradeFeeCapBps: Number((control & TRADE_FEE_CAP_MASK) >> TRADE_FEE_CAP_SHIFT)
  };
}
function parsePortfolioV17(data) {
  const MIN_PORTFOLIO_BYTES = PF_RESERVED_PNL_OFF + 16;
  if (data.length < MIN_PORTFOLIO_BYTES) {
    throw new Error(`parsePortfolioV17: data too short (${data.length} < ${MIN_PORTFOLIO_BYTES})`);
  }
  assertV17StandaloneHeader(data, "parsePortfolioV17", V17_KIND_PORTFOLIO);
  const marketGroupId = new PublicKey(data.subarray(PF_PROVENANCE_MARKET_GROUP_OFF, PF_PROVENANCE_MARKET_GROUP_OFF + 32));
  const portfolioAccountId = new PublicKey(data.subarray(PF_PROVENANCE_ACCOUNT_ID_OFF, PF_PROVENANCE_ACCOUNT_ID_OFF + 32));
  const provenanceOwner = new PublicKey(data.subarray(PF_PROVENANCE_OWNER_OFF, PF_PROVENANCE_OWNER_OFF + 32));
  const owner = new PublicKey(data.subarray(PF_OWNER_OFF, PF_OWNER_OFF + 32));
  const capital = readU128LE(data, PF_CAPITAL_OFF);
  const pnl = readI128LE(data, PF_PNL_OFF);
  const reservedPnl = readU128LE(data, PF_RESERVED_PNL_OFF);
  const residualCrystallizedLossAtomsTotal = data.length >= PF_RESIDUAL_LOSS_OFF + 16 ? readU128LE(data, PF_RESIDUAL_LOSS_OFF) : 0n;
  const residualSpentPrincipalAtomsTotal = data.length >= PF_RESIDUAL_PRINCIPAL_OFF + 16 ? readU128LE(data, PF_RESIDUAL_PRINCIPAL_OFF) : 0n;
  const residualReceivedAtomsTotal = data.length >= PF_RESIDUAL_RECEIVED_OFF + 16 ? readU128LE(data, PF_RESIDUAL_RECEIVED_OFF) : 0n;
  const fundingLongPaidAtomsTotal = data.length >= PF_FUNDING_LONG_PAID_OFF + 16 ? readU128LE(data, PF_FUNDING_LONG_PAID_OFF) : 0n;
  const fundingLongReceivedAtomsTotal = data.length >= PF_FUNDING_LONG_RECEIVED_OFF + 16 ? readU128LE(data, PF_FUNDING_LONG_RECEIVED_OFF) : 0n;
  const fundingShortPaidAtomsTotal = data.length >= PF_FUNDING_SHORT_PAID_OFF + 16 ? readU128LE(data, PF_FUNDING_SHORT_PAID_OFF) : 0n;
  const fundingShortReceivedAtomsTotal = data.length >= PF_FUNDING_SHORT_RECEIVED_OFF + 16 ? readU128LE(data, PF_FUNDING_SHORT_RECEIVED_OFF) : 0n;
  const feeCredits = data.length >= PF_FEE_CREDITS_OFF + 16 ? readI128LE(data, PF_FEE_CREDITS_OFF) : 0n;
  const cancelDepositEscrow = data.length >= PF_CANCEL_ESCROW_OFF + 16 ? readU128LE(data, PF_CANCEL_ESCROW_OFF) : 0n;
  const lastFeeSlot = data.length >= PF_LAST_FEE_SLOT_OFF + 8 ? readU64LE(data, PF_LAST_FEE_SLOT_OFF) : 0n;
  const activeBitmap = data.length >= PF_ACTIVE_BITMAP_OFF + 8 ? readU64LE(data, PF_ACTIVE_BITMAP_OFF) : 0n;
  const legs = [];
  for (let i = 0; i < PF_LEGS_COUNT; i++) {
    const b = PF_LEGS_OFF + i * PF_LEG_SIZE;
    if (data.length < b + PF_LEG_SIZE) break;
    legs.push({
      active: data[b] !== 0,
      assetIndex: readU32LE(data, b + 1),
      marketId: readU64LE(data, b + 5),
      side: data[b + 13],
      basisPosQ: readI128LE(data, b + 14),
      aBasis: readU128LE(data, b + 30),
      kSnap: readI128LE(data, b + 46),
      fSnap: readI128LE(data, b + 62),
      kfEpochSnap: readU64LE(data, b + 78),
      epochSnap: readU64LE(data, b + 86),
      lossWeight: readU128LE(data, b + 94),
      bSnap: readU128LE(data, b + 110),
      bRem: readU128LE(data, b + 126),
      bEpochSnap: readU64LE(data, b + 142),
      bStale: data[b + 150] !== 0,
      stale: data[b + 151] !== 0
    });
  }
  const sourceDomains = [];
  for (let i = 0; i < PF_SOURCE_DOMAINS_CAP; i++) {
    const b = PF_SOURCE_DOMAINS_OFF + i * PF_SOURCE_DOMAIN_SIZE;
    if (data.length < b + PF_SOURCE_DOMAIN_SIZE) break;
    sourceDomains.push({
      domain: readU32LE(data, b + 0),
      sourceClaimMarketId: readU64LE(data, b + 4),
      sourceClaimBoundNum: readU128LE(data, b + 12),
      sourceClaimLienedNum: readU128LE(data, b + 28),
      sourceClaimCounterpartyLienedNum: readU128LE(data, b + 44),
      sourceClaimInsuranceLienedNum: readU128LE(data, b + 60),
      sourceLienEffectiveReserved: readU128LE(data, b + 76),
      sourceLienCounterpartyBackingNum: readU128LE(data, b + 92),
      sourceLienInsuranceBackingNum: readU128LE(data, b + 108),
      sourceLienFeeLastSlot: readU64LE(data, b + 124),
      sourceClaimImpairedNum: readU128LE(data, b + 132),
      sourceLienImpairedEffectiveReserved: readU128LE(data, b + 148),
      sourceLienCapitalAtRiskFeeRevenue: readU128LE(data, b + 164),
      sourceLienImpairedCapitalAtRiskFeeRevenue: readU128LE(data, b + 180)
    });
  }
  const matcherProgram = data.length >= PF_MATCHER_PROGRAM_OFF + 32 ? new PublicKey(data.subarray(PF_MATCHER_PROGRAM_OFF, PF_MATCHER_PROGRAM_OFF + 32)) : PublicKey.default;
  const matcherContext = data.length >= PF_MATCHER_CONTEXT_OFF + 32 ? new PublicKey(data.subarray(PF_MATCHER_CONTEXT_OFF, PF_MATCHER_CONTEXT_OFF + 32)) : PublicKey.default;
  const matcherDelegate = data.length >= PF_MATCHER_DELEGATE_OFF + 32 ? new PublicKey(data.subarray(PF_MATCHER_DELEGATE_OFF, PF_MATCHER_DELEGATE_OFF + 32)) : PublicKey.default;
  let matcherEnabled = false;
  let matcherPositionEpoch = 0n;
  let matcherTradeFeeCapBps = 0;
  if (data.length >= PF_MATCHER_CONTROL_OFF + 8) {
    const control = readU64LE(data, PF_MATCHER_CONTROL_OFF);
    const decoded = decodePortfolioMatcherControl(control);
    matcherEnabled = decoded.enabled;
    matcherPositionEpoch = decoded.positionEpoch;
    matcherTradeFeeCapBps = decoded.tradeFeeCapBps;
  }
  const portfolioId = data.length >= PF_PORTFOLIO_ID_OFF + 8 ? readU64LE(data, PF_PORTFOLIO_ID_OFF) : 0n;
  const matcherSequence = data.length >= PF_MATCHER_SEQUENCE_OFF + 8 ? readU64LE(data, PF_MATCHER_SEQUENCE_OFF) : 0n;
  const matcherExpirySlot = data.length >= PF_MATCHER_EXPIRY_OFF + 8 ? readU64LE(data, PF_MATCHER_EXPIRY_OFF) : 0n;
  return {
    marketGroupId,
    portfolioAccountId,
    provenanceOwner,
    owner,
    capital,
    pnl,
    reservedPnl,
    residualCrystallizedLossAtomsTotal,
    residualSpentPrincipalAtomsTotal,
    residualReceivedAtomsTotal,
    fundingLongPaidAtomsTotal,
    fundingLongReceivedAtomsTotal,
    fundingShortPaidAtomsTotal,
    fundingShortReceivedAtomsTotal,
    feeCredits,
    cancelDepositEscrow,
    lastFeeSlot,
    activeBitmap,
    legs,
    sourceDomains,
    matcherProgram,
    matcherContext,
    matcherDelegate,
    matcherEnabled,
    matcherPositionEpoch,
    matcherTradeFeeCapBps,
    portfolioId,
    matcherSequence,
    matcherExpirySlot
  };
}
const LP_VAULT_REGISTRY_TOTAL = 176;
function parseLpVaultRegistry(data) {
  if (data.length < LP_VAULT_REGISTRY_TOTAL) {
    throw new Error(
      `parseLpVaultRegistry: data too short (${data.length} < ${LP_VAULT_REGISTRY_TOTAL})`
    );
  }
  assertV17StandaloneHeader(data, "parseLpVaultRegistry", V17_KIND_LP_VAULT_REGISTRY);
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    marketGroup: new PublicKey(data.subarray(b + 0, b + 32)),
    lpMint: new PublicKey(data.subarray(b + 32, b + 64)),
    totalLpSharesOutstanding: readU128LE(data, b + 64),
    insuranceFeeSnapshotAtoms: readU128LE(data, b + 80),
    feeDistributionTotalAtoms: readU128LE(data, b + 96),
    epoch: readU64LE(data, b + 112),
    redemptionCooldownSlots: readU64LE(data, b + 120),
    feeShareBps: readU16LE(data, b + 128),
    oiReservationThresholdBps: readU16LE(data, b + 130),
    domain: readU16LE(data, b + 132),
    paused: data[b + 134] !== 0,
    version: data[b + 135],
    bump: data[b + 136],
    mintBump: data[b + 137]
  };
}
const LP_REDEMPTION_TOTAL = 112;
function parseLpRedemption(data) {
  if (data.length < LP_REDEMPTION_TOTAL) {
    throw new Error(
      `parseLpRedemption: data too short (${data.length} < ${LP_REDEMPTION_TOTAL})`
    );
  }
  assertV17StandaloneHeader(data, "parseLpRedemption", V17_KIND_LP_REDEMPTION);
  const b = V17_ACCOUNT_HEADER_LEN;
  return {
    registry: new PublicKey(data.subarray(b + 0, b + 32)),
    redeemer: new PublicKey(data.subarray(b + 32, b + 64)),
    shares: readU128LE(data, b + 64),
    requestSlot: readU64LE(data, b + 80),
    version: data[b + 88],
    bump: data[b + 89]
  };
}
function parseAllAccounts(data) {
  const indices = parseUsedIndices(data);
  const maxIdx = maxAccountIndex(data.length);
  const validIndices = indices.filter((idx) => idx < maxIdx);
  const droppedCount = indices.length - validIndices.length;
  if (droppedCount > 0) {
    console.warn(
      `[parseAllAccounts] bitmap claims ${indices.length} used accounts but only ${maxIdx} fit in the slab \u2014 ${droppedCount} out-of-bounds indices dropped (possible bitmap corruption)`
    );
  }
  return validIndices.map((idx) => ({
    idx,
    account: parseAccount(data, idx)
  }));
}
export {
  AccountKind,
  DEFAULT_OI_RAMP_SLOTS,
  ENGINE_MARK_PRICE_OFF,
  ENGINE_OFF,
  RAMP_START_BPS,
  SLAB_MAGIC,
  SLAB_TIERS_V12_1,
  SLAB_TIERS_V12_15,
  SLAB_TIERS_V12_17,
  SLAB_TIERS_V12_19,
  SLAB_TIERS_V1M,
  SLAB_TIERS_V1M2,
  SLAB_TIERS_V2,
  SLAB_TIERS_V_ADL,
  SLAB_TIERS_V_SETDEXPOOL,
  V17_ASSET_CONTROL_SEQUENCES_LEN,
  V17_ASSET_CONTROL_SEQUENCES_OFF,
  V17_ASSET_ORACLE_PROFILE_LEN,
  V17_ASSET_ORACLE_WRAPPER_LEN,
  V17_CREATOR_FEE_CLAIMABLE_OFF,
  V17_EXPECTED_VERSION,
  V17_HEADER_LEN,
  V17_KIND_MARKET,
  V17_KIND_OFF,
  V17_MAGIC,
  V17_MARKET_ASSET_SLOT_LEN,
  V17_MARKET_GROUP_LEN,
  V17_MARKET_GROUP_OFF,
  V17_PORTFOLIO_ACCOUNT_LEN,
  V17_PORTFOLIO_IDENTITY_TRAILER_LEN,
  V17_PORTFOLIO_LEG_SIZE,
  V17_PROTOCOL_FEE_AUTHORITY_EPOCH_LEN,
  V17_PROTOCOL_FEE_AUTHORITY_EPOCH_OFF,
  V17_WRAPPER_CONFIG_LEN,
  computeEffectiveOiCapBps,
  decodePortfolioMatcherControl,
  detectLayout,
  detectSlabLayout,
  fetchSlab,
  isAccountUsed,
  isV17Account,
  isV17MarketAccount,
  maxAccountIndex,
  parseAccount,
  parseAllAccounts,
  parseAssetControlSequencesV17,
  parseAssetOracleProfileV17,
  parseConfig,
  parseEngine,
  parseHeader,
  parseLpRedemption,
  parseLpVaultRegistry,
  parseMarketGroupV17OI,
  parseParams,
  parsePortfolioV17,
  parseProtocolFeeAuthorityEpoch,
  parseUsedIndices,
  parseWrapperConfigV17,
  readLastThrUpdateSlot,
  readNonce,
  v17MarketAccountLen
};
//# sourceMappingURL=slab.js.map