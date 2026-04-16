import { ExtensionType, getMintLen } from "@solana/spl-token";

console.log("getMintLen sizes:");
console.log("  MetadataPointer only:", getMintLen([ExtensionType.MetadataPointer]));
console.log("  MetadataPointer + TransferHook:", getMintLen([ExtensionType.MetadataPointer, ExtensionType.TransferHook]));
console.log("  MetadataPointer + TransferHook + CloseAuth:", getMintLen([ExtensionType.MetadataPointer, ExtensionType.TransferHook, ExtensionType.MintCloseAuthority]));
console.log("  All 4 (+ TokenMetadata):", getMintLen([ExtensionType.MetadataPointer, ExtensionType.TransferHook, ExtensionType.MintCloseAuthority, ExtensionType.TokenMetadata]));

// ExtensionType values
console.log("\nExtensionType values:");
console.log("  MetadataPointer:", ExtensionType.MetadataPointer);
console.log("  TransferHook:", ExtensionType.TransferHook);
console.log("  MintCloseAuthority:", ExtensionType.MintCloseAuthority);
console.log("  TokenMetadata:", ExtensionType.TokenMetadata);
