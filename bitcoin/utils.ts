import { LEAF_VERSION } from "./constants";
import * as varuint from "varuint-bitcoin";

/**
 * Given a hex string or a buffer, return the x-only pubkey. (removes y coordinate the prefix)
 */
export function xOnlyPubkey(pubkey: Buffer | string): Buffer {
	if (typeof pubkey === "string") pubkey = Buffer.from(pubkey, "hex");
	return pubkey.length === 32 ? pubkey : pubkey.subarray(1, 33);
}

export function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

/**
 * concats the leaf version, the length of the script, and the script itself
 */
export function serializeScript(leafScript: Buffer) {
	return Buffer.concat([Uint8Array.from([LEAF_VERSION]), prefixScriptLength(leafScript)]);
}

/**
 * concats the length of the script and the script itself
 */
export function prefixScriptLength(s: Buffer): Buffer {
	const varintLen = varuint.encodingLength(s.length);
	const buffer = Buffer.allocUnsafe(varintLen);
	varuint.encode(s.length, buffer);
	return Buffer.concat([buffer, s]);
}

export function sortLeaves(leaf1: Buffer, leaf2: Buffer) {
	if (leaf1.compare(leaf2) > 0) {
		const temp = leaf1;
		leaf1 = leaf2;
		leaf2 = temp;
	}
	return [leaf1, leaf2];
}
