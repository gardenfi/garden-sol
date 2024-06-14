import { IBitcoinProvider, IBitcoinWallet, Urgency } from "@catalogfi/wallets";
import * as bitcoin from "bitcoinjs-lib";
import { taggedHash } from "bitcoinjs-lib/src/crypto";
import * as varuint from "varuint-bitcoin";
import * as ecc from "tiny-secp256k1";
import { generateInternalkey, tweakPubkey } from "./internalKey";
import { Taptree } from "bitcoinjs-lib/src/types";
import { LEAF_VERSION } from "./constants";

bitcoin.initEccLib(ecc);

export class GardenHTLC {
	private secretHash: string;
	/**
	 * hash160 of the redeemer's public key without 02 or 03 prefix
	 */
	private redeemerAddress: string;
	/**
	 * hash160 of the initiator's public key without 02 or 03 prefix
	 */
	private initiatorAddress: string;
	private expiry: number;
	private network: bitcoin.Network;

	private internalPubkey: Buffer;

	/**
	 * Note: redeemerAddress and initiatorAddress should be hash160 of the public key without 02 or 03 prefix
	 */
	constructor(
		secretHash: string,
		redeemerAddress: string,
		initiatorAddress: string,
		expiry: number,
		network: bitcoin.Network
	) {
		this.secretHash = secretHash;
		this.redeemerAddress = redeemerAddress;
		this.initiatorAddress = initiatorAddress;
		this.expiry = expiry;
		this.network = network;
		this.internalPubkey = generateInternalkey();
	}

	/**
	 * Generates a taproot address for receiving the funds
	 */
	address(): string {
		const { address } = bitcoin.payments.p2tr({
			internalPubkey: this.internalPubkey,
			network: this.network,
			scriptTree: this.leaves() as Taptree,
		});
		if (!address) throw new Error("Could not generate GardenHTLC address");
		return address;
	}

	/**
	 * Reveals the secret and redeems the HTLC
	 */
	async redeem(
		secret: string,
		signer: IBitcoinWallet,
		provider: IBitcoinProvider,
		fee?: number
	): Promise<string> {
		const address = this.address();
		const output = bitcoin.address.toOutputScript(address, this.network);

		const tweakedPubkey = this.getTweakPubkey();
		const utxos = await provider.getUTXOs(address);

		const balance = utxos.reduce((acc, utxo) => acc + utxo.value, 0);

		const tx = new bitcoin.Transaction();
		tx.version = 2;

		for (let i = 0; i < utxos.length; i++) {
			tx.addInput(Buffer.from(utxos[i].txid, "hex").reverse(), utxos[i].vout);
		}

		fee ??= await provider.suggestFee(address, balance, Urgency.MEDIUM);
		tx.addOutput(output, utxos[0].value - fee);

		const hashtype = bitcoin.Transaction.SIGHASH_DEFAULT;

		const refundLeafHash = this.leafHash("refund");
		const redeemLeafHash = this.leafHash("redeem");

		for (let i = 0; i < tx.ins.length; i++) {
			const hash = tx.hashForWitnessV1(
				i,
				[output],
				[utxos[i].value],
				hashtype,
				redeemLeafHash
			);
			const signature = await signer.signSchnorr(hash);

			tx.setWitness(i, [
				signature,
				// tapscript only accepts 32 bytes public key defined in BIP340
				Buffer.from(await signer.getPublicKey(), "hex").subarray(1, 33),
				Buffer.from(secret, "hex"),
				this.redeemLeaf(),
				Buffer.concat([
					Buffer.from([LEAF_VERSION | tweakedPubkey.parity]),
					this.internalPubkey,
					refundLeafHash,
				]),
			]);
		}

		return await provider.broadcast(tx.toHex());
	}

	/**
	 * Tweaks the internal pubkey with the merkle root hash of the leaves
	 *
	 * As defined in BIP341
	 */
	private getTweakPubkey() {
		const redeemLeafHash = this.leafHash("redeem");
		const refundLeafHash = this.leafHash("refund");
		const rootHash = taggedHash(
			"TapBranch",
			Buffer.concat([redeemLeafHash, refundLeafHash])
		);
		return tweakPubkey(this.internalPubkey, rootHash);
	}

	private leafHash(leaf: "redeem" | "refund"): Buffer {
		return taggedHash(
			"TapLeaf",
			serializeScript(leaf === "redeem" ? this.redeemLeaf() : this.redundLeaf())
		);
	}

	private redundLeaf(): Buffer {
		return bitcoin.script.fromASM(
			`
			${bitcoin.script.number.encode(this.expiry).toString("hex")}
			OP_CHECKSEQUENCEVERIFY
			OP_DROP
			OP_DUP
			OP_HASH160
			${this.initiatorAddress}
			OP_EQUALVERIFY
			OP_CHECKSIG
			`
				.trim()
				.replace(/\s+/g, " ")
		);
	}

	private redeemLeaf(): Buffer {
		return bitcoin.script.fromASM(
			`
			OP_SHA256
			${this.secretHash}
			OP_EQUALVERIFY
			OP_DUP
			OP_HASH160
			${this.redeemerAddress}
			OP_EQUALVERIFY
			OP_CHECKSIG
			`
				.trim()
				.replace(/\s+/g, " ")
		);
	}

	leaves() {
		return [
			{
				version: LEAF_VERSION,
				output: this.redeemLeaf(),
			},
			{
				version: LEAF_VERSION,
				output: this.redundLeaf(),
			},
		];
	}
}
/**
 * concats the leaf version, the length of the script, and the script itself
 */
const serializeScript = (leafScript: Buffer) => {
	return Buffer.concat([Uint8Array.from([LEAF_VERSION]), prefixScriptLength(leafScript)]);
};

/**
 * concats the length of the script and the script itself
 */
function prefixScriptLength(s: Buffer): Buffer {
	const varintLen = varuint.encodingLength(s.length);
	const buffer = Buffer.allocUnsafe(varintLen);
	varuint.encode(s.length, buffer);
	return Buffer.concat([buffer, s]);
}
