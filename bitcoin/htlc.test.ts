import { expect } from "chai";
import { GardenHTLC } from "./htlc";
import { randomBytes } from "ethers";
import { hash160, sha256 } from "bitcoinjs-lib/src/crypto";
import {
	BitcoinNetwork,
	BitcoinProvider,
	BitcoinWallet,
	IBitcoinWallet,
} from "@catalogfi/wallets";
import { regTestUtils } from "./regtest";

describe("Bitcoin GardenHTLC", () => {
	const secret = randomBytes(32);
	const secretHash = sha256(Buffer.from(secret)).toString("hex");
	const amount = 5000;
	const provider = new BitcoinProvider(BitcoinNetwork.Regtest, "http://localhost:30000");

	it("should be able initiate and redeem", async () => {
		// simulate a single htlc where initiator is alice and redeemer is bob

		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const alicePubkeyHash = await pubkeyHash(alice);
		const bobPubkeyHash = await pubkeyHash(bob);

		const expiry = 7200;
		await regTestUtils.fund(await alice.getAddress(), provider);

		const bobHTLC = await GardenHTLC.from(
			bob,
			secretHash,
			alicePubkeyHash,
			bobPubkeyHash,
			expiry
		);
		const bobHTLCAddress = bobHTLC.address();

		// alice sending to bob htlc address
		await alice.send(bobHTLCAddress, amount, 1000);

		const hash = await bobHTLC.redeem(Buffer.from(secret).toString("hex"));

		const tx = await provider.getTransaction(hash);
		expect(tx).to.be.an("object");
		expect(tx.txid).to.be.eq(hash);
		expect(tx.vout[0].scriptpubkey_address).to.be.equal(await bob.getAddress());
	});
});

const pubkeyHash = async (wallet: IBitcoinWallet) => {
	return hash160(Buffer.from((await wallet.getPublicKey()).slice(2), "hex")).toString("hex");
};
