# @percolator/sdk

TypeScript SDK for interacting with Percolator on-chain programs on Solana.

## Installation

```bash
pnpm add @percolator/sdk
# or
npm install @percolator/sdk
```

## Usage

```typescript
import {
  buildInitUserInstruction,
  buildPlaceOrderInstruction,
  buildDepositInstruction,
  buildWithdrawInstruction,
  deriveUserAccountPda,
  deriveMarketPda,
} from "@percolator/sdk";
```

## Features

- **Instruction builders** — Type-safe transaction construction for all Percolator instructions
- **Account deserialization** — Parse on-chain account data (markets, users, slabs)
- **PDA derivation** — Deterministic program-derived address calculation
- **ABI encoding** — Binary encoding/decoding matching the on-chain program layout
- **Oracle integration** — DEX oracle price feeds
- **Validation** — Client-side parameter validation before submission

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

Apache-2.0
