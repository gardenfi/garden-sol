import { expect } from "chai";
import { GardenHTLC } from "./htlc";
import { randomBytes } from "ethers";
import { hash160, sha256 } from "bitcoinjs-lib/src/crypto";
import { BitcoinNetwork, BitcoinProvider, BitcoinWallet } from "@catalogfi/wallets";
import { regtest } from "bitcoinjs-lib/src/networks";
import { regTestUtils } from "./regtest";

describe("Bitcoin GardenHTLC", () => {
	it("should be able initiate and redeem", async () => {
		const provider = new BitcoinProvider(BitcoinNetwork.Regtest, "http://localhost:30000");
		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const secret = randomBytes(32);
		const secretHash = sha256(Buffer.from(secret)).toString("hex");
		// TODO: write utils functions to parse pubkeys as bip340 compliant
		const redeemer = hash160(
			Buffer.from((await bob.getPublicKey()).slice(2), "hex")
		).toString("hex");
		const initiator = hash160(
			Buffer.from((await alice.getPublicKey()).slice(2), "hex")
		).toString("hex");

		const expiry = 7200;

		const htlc = new GardenHTLC(secretHash, redeemer, initiator, expiry, regtest);

		const address = htlc.address();
		expect(address).to.be.a("string");

		await regTestUtils.fund(address, provider);

		const hash = await htlc.redeem(Buffer.from(secret).toString("hex"), bob, provider);

		expect(hash).to.be.a("string");
		console.log(hash);

		const tx = await provider.getTransaction(hash);
		expect(tx).to.be.an("object");
		expect(tx.txid).to.be.eq(hash);
		expect(tx.vout[0].scriptpubkey_address).to.be.equal(address);
	});
});
