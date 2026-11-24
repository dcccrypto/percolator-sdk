/**
 * Runs the plain-tsx test scripts (no vitest suites) in ONE tsx process, in
 * the same order `pnpm test` used to run them as 8 separate processes. Saves
 * ~0.45 s of tsx/node startup per step.
 *
 * Failure behaviour matches the old `tsx a && tsx b && ...` chain:
 *  - a step that throws at top level rejects its import; the rejection is not
 *    caught here, so node prints the error and exits 1 before later steps run;
 *  - a step that calls `process.exit(1)` ends the whole run there.
 *
 * Each script stays runnable on its own: `tsx test/<name>.test.ts`.
 * Keep this list in sync with the exclude list in vitest.config.ts.
 */
await import("./abi.test.js");
await import("./slab.test.js");
await import("./validation.test.js");
await import("./dex-oracle.test.js");
await import("./trading.test.js");
await import("./warmup-leverage-cap.test.js");
await import("./dynamic-fees.test.js");
await import("./oracle.test.js");
