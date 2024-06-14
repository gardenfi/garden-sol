import { IBitcoinWallet, Urgency } from "@catalogfi/wallets";
import * as bitcoin from "bitcoinjs-lib";
import { toHashTree } from "bitcoinjs-lib/src/payments/bip341";
import { taggedHash } from "bitcoinjs-lib/src/crypto";
import * as varuint from "varuint-bitcoin";
import * as ecc from "tiny-secp256k1";
import { generateInternalkey, tweakPubkey } from "./internalKey";
import { Taptree } from "bitcoinjs-lib/src/types";
import { LEAF_VERSION } from "./constants";

bitcoin.initEccLib(ecc);

export class GardenHTLC {
	private signer: IBitcoinWallet;
	private secretHash: string;
	/**
	 * hash160 of the redeemer's public key without 02 or 03 prefix
	 */
	private redeemerPubkeyHash: string;
	/**
	 * hash160 of the initiator's public key without 02 or 03 prefix
	 */
	private initiatorPubkeyHash: string;
	private expiry: number;
	private internalPubkey: Buffer;
	private network: bitcoin.networks.Network;

	/**
	 * Note: redeemerAddress and initiatorAddress should be hash160 of the public key without 02 or 03 prefix
	 */
	private constructor(
		signer: IBitcoinWallet,
		secretHash: string,
		redeemerPubkeyHash: string,
		initiatorPubkeyHash: string,
		expiry: number,
		network: bitcoin.networks.Network
	) {
		this.secretHash = secretHash;
		this.redeemerPubkeyHash = redeemerPubkeyHash;
		this.initiatorPubkeyHash = initiatorPubkeyHash;
		this.expiry = expiry;
		this.signer = signer;
		this.network = network;
		this.internalPubkey = generateInternalkey();
	}

	static async from(
		signer: IBitcoinWallet,
		secretHash: string,
		initiatorPubkeyHash: string,
		redeemerPubkeyHash: string,
		expiry: number
	): Promise<GardenHTLC> {
		const network = await signer.getNetwork();
		return new GardenHTLC(
			signer,
			secretHash,
			redeemerPubkeyHash,
			initiatorPubkeyHash,
			expiry,
			network
		);
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
	 * Instantly refunds the funds to the initiator given the counterparty's signature and pubkey
	 */
	async instantRefund(counterPartyPubkey: string, counterPartySig: string, fee?: number) {
		const tx = new bitcoin.Transaction();
		tx.version = 2;

		throw new Error("Not implemented");
	}

	/**
	 * Reveals the secret and redeems the HTLC
	 */
	async redeem(secret: string, fee?: number): Promise<string> {
		const address = this.address();
		const output = bitcoin.address.toOutputScript(address, this.network);
		const provider = await this.signer.getProvider();
		const tweakedPubkey = this.getTweakPubkey();
		const utxos = await provider.getUTXOs(address);

		const balance = utxos.reduce((acc, utxo) => acc + utxo.value, 0);

		const tx = new bitcoin.Transaction();
		tx.version = 2;

		for (let i = 0; i < utxos.length; i++) {
			tx.addInput(Buffer.from(utxos[i].txid, "hex").reverse(), utxos[i].vout);
		}

		fee ??= await provider.suggestFee(address, balance, Urgency.MEDIUM);
		tx.addOutput(
			bitcoin.address.toOutputScript(await this.signer.getAddress(), this.network),
			balance - fee
		);

		const hashtype = bitcoin.Transaction.SIGHASH_DEFAULT;

		const refundLeafHash = this.leafHash("refund");
		const redeemLeafHash = this.leafHash("redeem");
		const instantRefundLeafHash = this.leafHash("instant-refund");
		const sortedRefundLeaves = [refundLeafHash, instantRefundLeafHash];

		if (refundLeafHash.compare(instantRefundLeafHash) > 0) {
			const temp = refundLeafHash;
			sortedRefundLeaves[0] = instantRefundLeafHash;
			sortedRefundLeaves[1] = temp;
		}

		const tapBranch = taggedHash("TapBranch", Buffer.concat(sortedRefundLeaves));
		const outputs: Buffer[] = [];
		const values: number[] = [];
		utxos.forEach((_) => {
			outputs.push(output);
			values.push(_.value);
		});
		for (let i = 0; i < tx.ins.length; i++) {
			const hash = tx.hashForWitnessV1(i, outputs, values, hashtype, redeemLeafHash);
			const signature = await this.signer.signSchnorr(hash);

			tx.setWitness(i, [
				signature,
				// tapscript only accepts 32 bytes public key defined in BIP340
				Buffer.from(await this.signer.getPublicKey(), "hex").subarray(1, 33),
				Buffer.from(secret, "hex"),
				this.redeemLeaf(),
				Buffer.concat([
					Buffer.from([LEAF_VERSION | tweakedPubkey.parity]),
					this.internalPubkey,
					tapBranch,
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
		const rootHash = toHashTree(this.leaves() as Taptree);
		return tweakPubkey(this.internalPubkey, rootHash.hash);
	}

	private leafHash(leaf: "redeem" | "refund" | "instant-refund"): Buffer {
		let leafScript = this.redeemLeaf();
		if (leaf === "refund") leafScript = this.redundLeaf();
		if (leaf === "instant-refund") leafScript = this.instantRefundLeaf();

		return taggedHash("TapLeaf", serializeScript(leafScript));
	}

	private redundLeaf(): Buffer {
		return bitcoin.script.fromASM(
			`
			${bitcoin.script.number.encode(this.expiry).toString("hex")}
			OP_CHECKSEQUENCEVERIFY
			OP_DROP
			OP_DUP
			OP_HASH160
			${this.initiatorPubkeyHash}
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
			${this.redeemerPubkeyHash}
			OP_EQUALVERIFY
			OP_CHECKSIG
			`
				.trim()
				.replace(/\s+/g, " ")
		);
	}

	// when spending use sig1,pk1,sig2,pk2
	private instantRefundLeaf(): Buffer {
		return bitcoin.script.fromASM(
			`
			OP_DUP
			OP_HASH160
			${this.initiatorPubkeyHash}
			OP_EQUALVERIFY
			OP_CHECKSIGVERIFY
			OP_DUP
			OP_HASH160
			${this.redeemerPubkeyHash}
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
			[
				{
					version: LEAF_VERSION,
					output: this.redundLeaf(),
				},
				{
					version: LEAF_VERSION,
					output: this.instantRefundLeaf(),
				},
			],
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
