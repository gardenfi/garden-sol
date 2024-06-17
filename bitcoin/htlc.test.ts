import { expect } from "chai";
import { GardenHTLC, Leaf } from "./htlc";
import { randomBytes } from "ethers";
import { sha256 } from "bitcoinjs-lib/src/crypto";
import {
	BitcoinNetwork,
	BitcoinProvider,
	BitcoinWallet,
	IBitcoinWallet,
} from "@catalogfi/wallets";
import { regTestUtils } from "./regtest";
import { toOutputScript } from "bitcoinjs-lib/src/address";
import { Transaction } from "bitcoinjs-lib";
import { htlcErrors } from "./errors";

describe("Bitcoin GardenHTLC", () => {
	const secret = randomBytes(32);
	const secretHash = sha256(Buffer.from(secret)).toString("hex");
	const amount = 5000;
	const fee = 1000;
	const provider = new BitcoinProvider(BitcoinNetwork.Regtest, "http://localhost:30000");

	it("should be able initiate and redeem with secret", async () => {
		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const alicePubkeyHash = await pubkey(alice);
		const bobPubkeyHash = await pubkey(bob);
		const expiry = 7200;
		await regTestUtils.fund(await alice.getAddress(), provider);
		const aliceHTLC = await GardenHTLC.from(
			alice,
			secretHash,
			alicePubkeyHash,
			bobPubkeyHash,
			expiry
		);
		await aliceHTLC.initiate(amount, fee);
		const bobHTLC = await GardenHTLC.from(
			bob,
			secretHash,
			alicePubkeyHash,
			bobPubkeyHash,
			expiry
		);

		const wrongSecret = randomBytes(32);
		await expect(
			bobHTLC.redeem(Buffer.from(wrongSecret).toString("hex"))
		).to.be.rejectedWith(htlcErrors.secretMismatch);

		const hash = await bobHTLC.redeem(Buffer.from(secret).toString("hex"));

		const tx = await provider.getTransaction(hash);
		expect(tx).to.be.an("object");
		expect(tx.txid).to.be.eq(hash);
		expect(tx.vout[0].scriptpubkey_address).to.be.equal(await bob.getAddress());
	});

	it("should be able to instantly refund", async () => {
		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const alicePubkeyHash = await pubkey(alice);
		const bobPubkeyHash = await pubkey(bob);

		const expiry = 7200;
		await regTestUtils.fund(await alice.getAddress(), provider);

		const aliceHTLC = await GardenHTLC.from(
			alice,
			secretHash,
			alicePubkeyHash,
			bobPubkeyHash,
			expiry
		);
		const initTxId = await aliceHTLC.initiate(amount, fee);

		const bobSigs = await generateSigsForBob(aliceHTLC, bob, await alice.getAddress(), fee);
		expect(bobSigs).to.be.an("array");
		expect(bobSigs[0].utxo).to.be.eq(initTxId);

		// corrupt the signatures and test for failure

		let corruptedSigs = bobSigs.map((sig) => {
			return {
				utxo: sig.utxo,
				sig: Buffer.from(sig.sig, "hex").reverse().toString("hex"),
			};
		});
		await expect(aliceHTLC.instantRefund(corruptedSigs, fee)).to.be.rejectedWith(
			htlcErrors.invalidCounterpartySigForUTXO(corruptedSigs[0].utxo)
		);

		// corrupt the utxo and test for failure
		const corruptedUtxos = bobSigs.map((sig) => {
			return {
				utxo: "0".repeat(64),
				sig: sig.sig,
			};
		});
		// fails as the utxos used are not the same
		await expect(aliceHTLC.instantRefund(corruptedUtxos, fee)).to.be.rejectedWith(
			htlcErrors.counterPartySigNotFound("")
		);

		const hash = await aliceHTLC.instantRefund(bobSigs, fee);

		const tx = await provider.getTransaction(hash);
		expect(tx).to.be.an("object");
		expect(tx.txid).to.be.eq(hash);
		expect(tx.vout[0].scriptpubkey_address).to.be.equal(await alice.getAddress());
	});

	it("should be able to refund only after expiry", async () => {
		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const alicePubkeyHash = await pubkey(alice);
		const bobPubkeyHash = await pubkey(bob);

		const expiry = 1;

		await regTestUtils.fund(await alice.getAddress(), provider);

		const aliceHTLC = await GardenHTLC.from(
			alice,
			secretHash,
			alicePubkeyHash,
			bobPubkeyHash,
			expiry
		);

		const txId = await aliceHTLC.initiate(amount, fee);

		const tx = await provider.getTransaction(txId);
		expect(tx).to.be.an("object");
		expect(tx.txid).to.be.eq(txId);
		expect(tx.vout[0].scriptpubkey_address).to.be.equal(aliceHTLC.address());

		// should not be able to refund before expiry
		await expect(aliceHTLC.refund()).to.be.rejectedWith(htlcErrors.htlcNotExpired(2));

		await regTestUtils.mine(2, provider);

		const hash = await aliceHTLC.refund();

		const refundTx = await provider.getTransaction(hash);
		expect(refundTx).to.be.an("object");
		expect(refundTx.txid).to.be.eq(hash);
		expect(refundTx.vout[0].scriptpubkey_address).to.be.equal(await alice.getAddress());
	});
});

const pubkey = async (wallet: IBitcoinWallet) => {
	return (await wallet.getPublicKey()).slice(2);
};

const generateSigsForBob = async (
	gardenHTLC: GardenHTLC,
	bob: IBitcoinWallet,
	initiatorAddress: string,
	fee: number
) => {
	const network = await bob.getNetwork();
	const output = toOutputScript(gardenHTLC.address(), network);
	const provider = await bob.getProvider();

	const utxos = await provider.getUTXOs(gardenHTLC.address());

	const tx = new Transaction();
	tx.version = 2;

	for (let i = 0; i < utxos.length; i++) {
		tx.addInput(Buffer.from(utxos[i].txid, "hex").reverse(), utxos[i].vout);
	}

	const amount = utxos.reduce((acc, utxo) => acc + utxo.value, 0);

	tx.addOutput(toOutputScript(initiatorAddress, network), amount - fee);

	const sigs = [];
	const values = utxos.map((utxo) => utxo.value);
	const outputs = utxos.map((_) => output);

	const hashType = Transaction.SIGHASH_DEFAULT;

	for (let i = 0; i < tx.ins.length; i++) {
		const hash = tx.hashForWitnessV1(
			i,
			outputs,
			values,
			hashType,
			gardenHTLC.leafHash(Leaf.INSTANT_REFUND)
		);
		const signature = await bob.signSchnorr(hash);
		sigs.push({
			utxo: Buffer.from(tx.ins[i].hash).reverse().toString("hex"),
			sig: signature.toString("hex"),
		});
	}
	return sigs;
};
