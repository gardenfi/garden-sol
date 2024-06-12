import { expect } from "chai";
import { GardenHTLC } from "./script";
import { randomBytes } from "ethers";
import { sha256 } from "bitcoinjs-lib/src/crypto";
import { BitcoinNetwork, BitcoinProvider, BitcoinWallet } from "@catalogfi/wallets";
import { regtest } from "bitcoinjs-lib/src/networks";
import { regTestUtils } from "./regtest";

describe("Test", () => {
	it("should pass", async () => {
		const provider = new BitcoinProvider(BitcoinNetwork.Regtest, "http://localhost:30000");
		const alice = BitcoinWallet.createRandom(provider);
		const bob = BitcoinWallet.createRandom(provider);

		const secret = randomBytes(32);
		const secretHash = sha256(Buffer.from(secret)).toString("hex");
		const redeemer = await bob.getAddress();
		const initiator = await alice.getAddress();
		const expiry = 7200;

		const htlc = new GardenHTLC(secretHash, redeemer, initiator, expiry, regtest);

		const address = htlc.address();
		expect(address).to.be.a("string");

		await regTestUtils.fund(address, provider);
	});
});
