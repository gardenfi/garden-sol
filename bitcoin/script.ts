import { IBitcoinProvider } from "@catalogfi/wallets";
import * as bitcoin from "bitcoinjs-lib";
import { fromBech32 } from "bitcoinjs-lib/src/address";
import { taggedHash } from "bitcoinjs-lib/src/crypto";
import { Taptree } from "bitcoinjs-lib/src/types";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";
import { generateInternalkey } from "./internalKey";

export enum Leaf {
	RedeemLeaf,
	RefundLeaf,
	InstantRefundLeaf,
}

bitcoin.initEccLib(ecc);

export class GardenHTLC {
	private secretHash: string;
	private redeemerAddress: string;
	private initiatorAddress: string;
	private expiry: number;
	private network: bitcoin.Network;

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
	}

	address(): string {
		const { address } = bitcoin.payments.p2tr({
			internalPubkey: generateInternalkey(),
			network: this.network,
			scriptTree: this.leaves() as Taptree,
		});
		return address!;
	}

	async redeem(
		leaf: Leaf,
		secret: string,
		signer: string,
		provider: IBitcoinProvider
	): Promise<string> {
		const tx = new bitcoin.Transaction();
		tx.version = 2;

		const { address, output } = bitcoin.payments.p2tr({
			internalPubkey: generateInternalkey(),
			network: this.network,
			scriptTree: this.leaves() as Taptree,
		});
		if (!address) throw new Error("Could not create address");
		const utxos = await provider.getUTXOs(address!);

		for (let i = 0; i < utxos.length; i++) {
			tx.addInput(Buffer.from(utxos[i].txid, "hex").reverse(), utxos[i].vout);
		}

		tx.addOutput(output!, 1000);
		const hashtype = bitcoin.Transaction.SIGHASH_DEFAULT;

		for (let i = 0; i < tx.ins.length; i++) {
			const hash = tx.hashForWitnessV1(0, [output!], [1000], hashtype);
			const signature = ecc.signSchnorr(hash, Buffer.from(signer, "hex"));

			const merkleProof = generateMerkleProof(
				this.leaves()
					.flat()
					.map((l) => l.output),
				i
			);
			const signerEc = ECPairFactory(ecc).fromPrivateKey(Buffer.from(signer, "hex"));
			tx.setWitness(i, [
				Buffer.from(signature),
				signerEc.publicKey,
				Buffer.from(secret, "hex"),
				// TODO: need to add control block
			]);
		}

		throw new Error("Method not implemented.");
	}

	leaves() {
		return [
			{
				version: 0xc0,
				output: bitcoin.script.fromASM(
					`OP_SHA256
                    ${this.secretHash}
                    OP_EQUALVERIFY
                    OP_DUP
                    OP_HASH160
                    ${fromBech32(this.redeemerAddress).data.toString("hex")}
                    OP_EQUALVERIFY
                    OP_CHECKSIG
                    `
						.trim()
						.replace(/\s+/g, " ")
				),
			},
			[
				{
					version: 0xc0,
					output: bitcoin.script.fromASM(
						`
                    ${bitcoin.script.number.encode(this.expiry).toString("hex")}
                    OP_CHECKSEQUENCEVERIFY
                    OP_DROP
                    OP_DUP
                    OP_HASH160
                    ${fromBech32(this.initiatorAddress).data.toString("hex")}
                    OP_EQUALVERIFY
                    OP_CHECKSIG
                    `
							.trim()
							.replace(/\s+/g, " ")
					),
				},
				{
					version: 0xc0,
					output: bitcoin.script.fromASM(
						`
                    OP_2
                    OP_DUP
                    OP_HASH160
                    ${fromBech32(this.initiatorAddress).data.toString("hex")}
                    OP_EQUALVERIFY
                    OP_DUP
                    OP_HASH160
                    ${fromBech32(this.redeemerAddress).data.toString("hex")}
                    OP_EQUALVERIFY
                    OP_2
                    OP_CHECKMULTISIG
                    `
							.trim()
							.replace(/\s+/g, " ")
					),
				},
			],
		];
	}
}

export const serializeScript = (script: Buffer) => {
	return Buffer.concat([
		Buffer.from("c0", "hex"),
		Buffer.from(script.byteLength.toString(16), "hex"), // add compact size encoding later
		script,
	]);
};

export const generateMerkleProof = (scripts: Buffer[], index: number) => {
	if (index > scripts.length - 1) throw new Error("Invalid index");

	let currentLevel = scripts.map((script) => taggedHash("TapLeaf", serializeScript(script)));

	const proofs = [] as Buffer[];

	while (currentLevel.length != 1) {
		let nextLevel = [] as Buffer[];
		if (index < currentLevel.length) {
			if (index % 2) proofs.push(currentLevel[index - 1]);
			else proofs.push(currentLevel[index + 1]);

			index = Math.floor(index / 2);
		}
		const maxNodes = Math.pow(2, Math.floor(Math.log2(currentLevel.length)));
		for (let i = 0; i < maxNodes; i += 2) {
			const [smaller, bigger] = currentLevel.slice(i, i + 2).sort((a, b) => a.compare(b));

			nextLevel.push(taggedHash("TapBranch", Buffer.concat([smaller, bigger])));
		}
		currentLevel = [...nextLevel, ...currentLevel.slice(maxNodes)];
	}

	return proofs;
};
