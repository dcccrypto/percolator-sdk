# @percolatorct/sdk

TypeScript SDK for [Percolator](https://github.com/dcccrypto/percolator), a perpetual futures protocol on Solana. It builds instruction data and account metas, derives PDAs, parses slab accounts, discovers markets, and has a few math and oracle helpers.

Not audited. Do not use it with funds you cannot lose.

## Install

```bash
pnpm add @percolatorct/sdk
```

Requires Node 20 or newer. `@solana/web3.js` and `@solana/spl-token` are regular dependencies.

## What is in it

| Path | Contents |
|------|----------|
| `src/abi/` | Instruction encoders, account-meta templates, error codes, NFT instructions |
| `src/solana/` | PDA derivation, slab parsing, market discovery, stake program helpers, ATA and RPC utilities |
| `src/math/` | PnL, liquidation price, trading and warmup helpers |
| `src/oracle/` | Price router |
| `src/runtime/` | Transaction helpers (`simulateOrSend` and friends) |
| `src/config/program-ids.ts` | Program IDs per network |
| `specs/` | Wire-format fixtures used by the parity checks |

Everything is re-exported from the package root (`src/index.ts`).

## Example

```typescript
import { getProgramId, deriveVaultAuthority, parseHeader, detectSlabLayout, parseConfig } from "@percolatorct/sdk";

const programId = getProgramId("devnet");
const [vaultAuth] = deriveVaultAuthority(programId, slabPubkey);

const info = await connection.getAccountInfo(slabPubkey);
const data = new Uint8Array(info!.data);
const header = parseHeader(data);
const layout = detectSlabLayout(data.length);
const config = parseConfig(data, layout!);
```

## Program IDs

IDs change when programs are redeployed, so they are not repeated here. The SDK's defaults live in [`src/config/program-ids.ts`](src/config/program-ids.ts); check that file and the [CHANGELOG](CHANGELOG.md) for the set a given release targets. Pass your own IDs where the helpers accept a program ID if you are pointing at a different deployment.

## Build and test

```bash
pnpm install --frozen-lockfile
pnpm lint      # tsc --noEmit
pnpm build     # tsup + type declarations
pnpm test
```

`pnpm parity:check` compares the encoders against the fixtures in `specs/`. `pnpm update-parity-fixtures` regenerates them.

## Related repositories

- [percolator](https://github.com/dcccrypto/percolator): risk engine
- [percolator-prog](https://github.com/dcccrypto/percolator-prog): on-chain wrapper program
- [percolator-stake](https://github.com/dcccrypto/percolator-stake), [percolator-nft](https://github.com/dcccrypto/percolator-nft), [percolator-vault](https://github.com/dcccrypto/percolator-vault): companion programs
- [percolator-shared](https://github.com/dcccrypto/percolator-shared): shared backend utilities

## License

Apache-2.0, see [LICENSE](LICENSE).
