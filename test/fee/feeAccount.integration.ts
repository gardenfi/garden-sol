import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { randomBytes } from "crypto";

import type { FeeAccount, FeeAccountFactory, HTLC, SEED } from "../../typechain-types";
import type { TypedDataDomain, BigNumberish, TypedDataField, AddressLike } from "ethers";

describe("--- Garden Fee Account - integration tests with htlc ---", () => {
	// ----- TYPES ----- //
	type ClaimMessage = {
		nonce: BigNumberish;
		amount: BigNumberish;
		htlcs: FeeAccount.HTLCStruct[];
	};
	type CloseMessage = {
		amount: BigNumberish;
	};

	// ----- CONSTANTS ----- //
	const CLAIM_TYPE: Record<string, TypedDataField[]> = {
		Claim: [
			{ name: "nonce", type: "uint256" },
			{ name: "amount", type: "uint256" },
			{ name: "htlcs", type: "HTLC[]" },
		],
		HTLC: [
			{ name: "secretHash", type: "bytes32" },
			{ name: "expiry", type: "uint256" },
			{ name: "sendAmount", type: "uint256" },
			{ name: "receiveAmount", type: "uint256" },
		],
	};
	const CLOSE_TYPE: Record<string, TypedDataField[]> = {
		Close: [{ name: "amount", type: "uint256" }],
	};

	// ----- VARIABLES ----- //
	let feeManager: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let charlie: HardhatEthersSigner;

	let DOMAIN: TypedDataDomain;

	let seed: SEED;

	let feeAccount: FeeAccount;
	let feeAccountFactory: FeeAccountFactory;
	let htlc: HTLC;

	let aliceFeeAccount: AddressLike;

	before(async () => {
		[feeManager, alice, bob, charlie] = await ethers.getSigners();

		const SeedFactory = await ethers.getContractFactory("SEED");
		seed = (await SeedFactory.deploy()) as SEED;
		seed.waitForDeployment();

		const FeeAccountFactory = await ethers.getContractFactory("FeeAccountFactory");
		feeAccountFactory = (await FeeAccountFactory.deploy(
			await seed.getAddress(),
			feeManager.address,
			"FeeAccount",
			"1"
		)) as FeeAccountFactory;
		feeAccountFactory.waitForDeployment();

		const htclFactory = await ethers.getContractFactory("HTLC");
		htlc = (await htclFactory.deploy(await seed.getAddress(), "HTLC", "1")) as HTLC;
		await htlc.waitForDeployment();
	});

	it("feeManger sends alice seed", async () => {
		const tx = await seed.connect(feeManager).transfer(alice.address, 100000);
		await tx.wait();
		expect(await seed.balanceOf(alice.address)).to.equal(100000);
	});

	// Fee Account channels supports recipient to deposit
	// Test flow -->
	// 1. Alice opens a channel with FeeManager
	// 2. Alice deposits 1000 FEE tokens after FeeManager signs a claim with 1000 as amount
	describe("-- Recipient deposit -- ", async () => {
		let POST_DEPOSIT_MSG: ClaimMessage;
		let feehubSignature: string;
		it("should open a channel", async () => {
			aliceFeeAccount = await feeAccountFactory.connect(alice).create.staticCall();
			const tx = await feeAccountFactory.connect(alice).create();
			await tx.wait();
			feeAccount = (await ethers.getContractAt(
				"FeeAccount",
				aliceFeeAccount
			)) as FeeAccount;
			DOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: await ethers.provider.getNetwork().then((network) => network.chainId),
				verifyingContract: feeAccount.target.toString(),
			};
		});
		it("feeManger should sign post deposit msg", async () => {
			POST_DEPOSIT_MSG = {
				nonce: 0,
				amount: 1000,
				htlcs: [],
			};
			feehubSignature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				POST_DEPOSIT_MSG
			);
			// ALICE verifies the signature
			await seed.connect(alice).transfer(feeAccount.target.toString(), 1000);
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(1000);
		});
		it("alice should be able to claim", async () => {
			const aliceSignature = await alice.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				POST_DEPOSIT_MSG
			);
			await feeAccount
				.connect(alice)
				.claim.staticCall(
					POST_DEPOSIT_MSG.amount,
					POST_DEPOSIT_MSG.nonce,
					POST_DEPOSIT_MSG.htlcs,
					[],
					feehubSignature,
					aliceSignature
				);
		});
		it("alice should be able to close the channel", async () => {
			const CLOSE_MSG = {
				amount: 1000,
			};
			const fmsignature = await feeManager.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceSignature = await alice.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceBalanceBefore = await seed.balanceOf(alice.address);
			const feeManagerBalanceBefore = await seed.balanceOf(feeManager.address);
			await expect(
				feeAccount.connect(alice).close(CLOSE_MSG.amount, fmsignature, aliceSignature)
			).to.emit(feeAccountFactory, "Closed");
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(0);
			expect(await seed.balanceOf(alice.address)).to.equal(aliceBalanceBefore + 1000n);
		});
	});

	// Fee Account channels supports recipient to fund via a HTLC swap
	// Test flow -->
	// 1. Alice opens a channel with FeeManager
	// 2. Alice deposits 1000 FEE tokens after FeeManager signs a claim with 1000 as amount
	// 3. Alice pays 1000 FEE tokens to FeeManager via claims
	// 4. Alice decides to add 2000 tokens more to the channel
	// 5. ALice initiates an HTLC on HTLC contract for 2000 FEE tokens with fee channel address as the recipient
	// 6. FeeManager signs a claim containing an htlc payment of 2000 FEE tokens
	// 7. Alice claims the 2000 FEE tokens in channel by revealing the secret and requesting the FeeManager to sign the claim with amount 2000
	// 8. FeeManager signs the claim and sends the signature to Alice
	// 9. Alice redeems the HTLC from HTLC contract
	describe("-- Recipient refill -- ", async () => {
		let PRE_DEPOSIT_MSG: ClaimMessage;
		let ALICE_PAY_MSG: ClaimMessage;
		let FEEMANAGER_HTLC_MSG: ClaimMessage;
		let ALICE_POST_HTLC_MSG: ClaimMessage;
		let CLOSE_MSG: CloseMessage;
		let HTLC_SECRET: Buffer;
		let fmPostHTLCSign: string;
		let alicePostHTLCSign: string;
		it("should open a channel", async () => {
			aliceFeeAccount = await feeAccountFactory.connect(alice).create.staticCall();
			const tx = await feeAccountFactory.connect(alice).create();
			await tx.wait();
			feeAccount = (await ethers.getContractAt(
				"FeeAccount",
				aliceFeeAccount
			)) as FeeAccount;
			DOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: await ethers.provider.getNetwork().then((network) => network.chainId),
				verifyingContract: feeAccount.target.toString(),
			};
		});
		it("fee manager should sign pre deposit msg", async () => {
			PRE_DEPOSIT_MSG = {
				nonce: 0,
				amount: 1000,
				htlcs: [],
			};
			const signature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				PRE_DEPOSIT_MSG
			);
		});
		it("alice should deposit 1000 FEE tokens", async () => {
			await seed
				.connect(alice)
				.transfer(feeAccount.target.toString(), PRE_DEPOSIT_MSG.amount);
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(
				PRE_DEPOSIT_MSG.amount
			);
		});
		it("alice should pay fee manager", async () => {
			ALICE_PAY_MSG = {
				nonce: 1,
				amount: 0,
				htlcs: [],
			};
			const aliceSignature = await alice.signTypedData(DOMAIN, CLAIM_TYPE, ALICE_PAY_MSG);
			const feeManagerSignature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				ALICE_PAY_MSG
			);

			await feeAccount
				.connect(alice)
				.claim.staticCall(
					ALICE_PAY_MSG.amount,
					ALICE_PAY_MSG.nonce,
					ALICE_PAY_MSG.htlcs,
					[],
					feeManagerSignature,
					aliceSignature
				);

			// test case fails if static call returns an error
			expect(true).to.equal(true);
		});
		it("alice should initiate an HTLC", async () => {
			HTLC_SECRET = randomBytes(32);
			FEEMANAGER_HTLC_MSG = {
				nonce: 2,
				amount: 0,
				htlcs: [
					{
						secretHash: ethers.sha256(HTLC_SECRET),
						expiry: (await ethers.provider.getBlockNumber()) + 1000,
						sendAmount: 2000,
						receiveAmount: 0,
					},
				],
			};
			await seed
				.connect(alice)
				.approve(htlc.target.toString(), FEEMANAGER_HTLC_MSG.htlcs[0].sendAmount);

			const expiry =
				(FEEMANAGER_HTLC_MSG.htlcs[0].expiry as number) -
				(await ethers.provider.getBlockNumber());

			await expect(
				htlc.connect(alice).initiate(
					feeAccount.target.toString(),
					Math.floor(expiry / 2), // atomic swap time lock is 50% of time lock of initiator
					FEEMANAGER_HTLC_MSG.htlcs[0].sendAmount,
					FEEMANAGER_HTLC_MSG.htlcs[0].secretHash
				)
			).to.emit(htlc, "Initiated");
		});
		it("fee manager should sign HTLC msg", async () => {
			const signature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				FEEMANAGER_HTLC_MSG
			);
			// ALICE verifies the signature
			ALICE_POST_HTLC_MSG = {
				nonce: 3,
				amount: 2000,
				htlcs: [],
			};

			// alice reveals the secret and requests the fee manager to sign the claim
			fmPostHTLCSign = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				ALICE_POST_HTLC_MSG
			);
			alicePostHTLCSign = await alice.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				ALICE_POST_HTLC_MSG
			);
		});
		it("alice should claim the HTLC", async () => {
			const orderId = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[ethers.sha256(HTLC_SECRET), alice.address]
				)
			);
			await expect(htlc.connect(alice).redeem(orderId, HTLC_SECRET)).to.emit(
				htlc,
				"Redeemed"
			);
		});
		it("post htlc should be valid", async () => {
			await feeAccount
				.connect(alice)
				.claim.staticCall(
					ALICE_POST_HTLC_MSG.amount,
					ALICE_POST_HTLC_MSG.nonce,
					ALICE_POST_HTLC_MSG.htlcs,
					[],
					fmPostHTLCSign,
					alicePostHTLCSign
				);
			expect(true).to.equal(true);
		});
		it("fee manager should sign close msg", async () => {
			CLOSE_MSG = {
				amount: 2000,
			};
			const fmsignature = await feeManager.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceSignature = await alice.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceBalanceBefore = await seed.balanceOf(alice.address);
			const feeManagerBalanceBefore = await seed.balanceOf(feeManager.address);
			await expect(
				feeAccount.connect(alice).close(CLOSE_MSG.amount, fmsignature, aliceSignature)
			).to.emit(feeAccountFactory, "Closed");
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(0);
			expect(await seed.balanceOf(alice.address)).to.equal(aliceBalanceBefore + 2000n);
			expect(await seed.balanceOf(feeManager.address)).to.equal(
				feeManagerBalanceBefore + 1000n
			);
		});
	});

	// Fee Account channels supports reciepint to withdraw via a HTLC swap
	// Test flow -->
	// 1. Alice opens a channel with FeeManager
	// 2. FeeManger deposits 1000 FEE tokens
	// 3. FeeManager pays 1000 FEE tokens to Alice via claims
	// 4. Alice decides to withdraw 500 tokens
	// 5. ALice initiates an HTLC in channel paying 500 FEE tokens to FeeManager
	// 6. FeeManager initiates an HTLC in HTLC contract for 500 FEE tokens with Alice as recipient
	// 7. Alice reveals the secret and claims the 500 FEE tokens from HTLC contract
	// 8. FeeManager signs a claim by resolving alice's htlc of 500 FEE tokens and updates the channel state
	describe("-- Recipient withdraw -- ", async () => {
		let FEEMANAGER_PAY_MSG: ClaimMessage;
		let ALICE_HTLC_MSG: ClaimMessage;
		let FEEMANAGER_POST_HTLC_MSG: ClaimMessage;
		let CLOSE_MSG: CloseMessage;
		let HTLC_SECRET: Buffer;
		let fmPostHTLCSign: string;
		let alicePostHTLCSign: string;
		it("should open a channel", async () => {
			aliceFeeAccount = await feeAccountFactory.connect(alice).create.staticCall();
			const tx = await feeAccountFactory.connect(alice).create();
			await tx.wait();
			feeAccount = (await ethers.getContractAt(
				"FeeAccount",
				aliceFeeAccount
			)) as FeeAccount;
			DOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: await ethers.provider.getNetwork().then((network) => network.chainId),
				verifyingContract: feeAccount.target.toString(),
			};
		});
		it("fee manager should deposit 1000 FEE tokens", async () => {
			await seed.connect(feeManager).transfer(feeAccount.target.toString(), 1000);
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(1000);
		});
		it("fee manager should pay alice", async () => {
			FEEMANAGER_PAY_MSG = {
				nonce: 0,
				amount: 1000,
				htlcs: [],
			};
			const aliceSignature = await alice.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				FEEMANAGER_PAY_MSG
			);
			const feeManagerSignature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				FEEMANAGER_PAY_MSG
			);

			await feeAccount
				.connect(alice)
				.claim.staticCall(
					FEEMANAGER_PAY_MSG.amount,
					FEEMANAGER_PAY_MSG.nonce,
					FEEMANAGER_PAY_MSG.htlcs,
					[],
					feeManagerSignature,
					aliceSignature
				);

			//test case fails if static call returns an error
			expect(true).to.equal(true);
		});
		it("alice should initiate an HTLC in channel", async () => {
			HTLC_SECRET = randomBytes(32);
			ALICE_HTLC_MSG = {
				nonce: 1,
				amount: 1000,
				htlcs: [
					{
						secretHash: ethers.sha256(HTLC_SECRET),
						expiry: (await ethers.provider.getBlockNumber()) + 1000,
						sendAmount: 0,
						receiveAmount: 500,
					} as FeeAccount.HTLCStruct,
				],
			};
			const aliceSignature = await alice.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				ALICE_HTLC_MSG
			);

			const claimHash = await feeAccount.claimHash(
				ALICE_HTLC_MSG.amount,
				ALICE_HTLC_MSG.nonce,
				ALICE_HTLC_MSG.htlcs
			);
			// feeManager verifies and signs the claim
			const feeManagerSignature = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				ALICE_HTLC_MSG
			);
			await feeAccount
				.connect(alice)
				.claim.staticCall(
					ALICE_HTLC_MSG.amount,
					ALICE_HTLC_MSG.nonce,
					ALICE_HTLC_MSG.htlcs,
					[HTLC_SECRET],
					feeManagerSignature,
					aliceSignature
				);
		});
		it("fee manager should initiate HTLC in HTLC contract", async () => {
			await seed
				.connect(feeManager)
				.approve(htlc.target.toString(), ALICE_HTLC_MSG.htlcs[0].receiveAmount);

			const expiry =
				(ALICE_HTLC_MSG.htlcs[0].expiry as number) -
				(await ethers.provider.getBlockNumber());

			await expect(
				htlc.connect(feeManager).initiate(
					alice.address,
					Math.floor(expiry / 2), // atomic swap time lock is 50% of time lock of initiator
					ALICE_HTLC_MSG.htlcs[0].receiveAmount,
					ALICE_HTLC_MSG.htlcs[0].secretHash
				)
			).to.emit(htlc, "Initiated");
		});
		it("alice should reveal secret and sign post htlc", async () => {
			// alice reveals the secret and requests the fee manager to sign the claim
			FEEMANAGER_POST_HTLC_MSG = {
				nonce: 2,
				amount: 500,
				htlcs: [],
			};
			const orderId = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[ethers.sha256(HTLC_SECRET), feeManager.address]
				)
			);
			await expect(htlc.connect(alice).redeem(orderId, HTLC_SECRET)).to.emit(
				htlc,
				"Redeemed"
			);
			// alice signs the claim
			fmPostHTLCSign = await feeManager.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				FEEMANAGER_POST_HTLC_MSG
			);
			alicePostHTLCSign = await alice.signTypedData(
				DOMAIN,
				CLAIM_TYPE,
				FEEMANAGER_POST_HTLC_MSG
			);
		});
		it("post htlc should be valid", async () => {
			await feeAccount
				.connect(alice)
				.claim.staticCall(
					FEEMANAGER_POST_HTLC_MSG.amount,
					FEEMANAGER_POST_HTLC_MSG.nonce,
					FEEMANAGER_POST_HTLC_MSG.htlcs,
					[],
					fmPostHTLCSign,
					alicePostHTLCSign
				);
			expect(true).to.equal(true);
		});
		it("fee manager should sign close msg", async () => {
			CLOSE_MSG = {
				amount: 500,
			};
			const fmsignature = await feeManager.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceSignature = await alice.signTypedData(DOMAIN, CLOSE_TYPE, CLOSE_MSG);
			const aliceBalanceBefore = await seed.balanceOf(alice.address);
			const feeManagerBalanceBefore = await seed.balanceOf(feeManager.address);
			await expect(
				feeAccount.connect(alice).close(CLOSE_MSG.amount, fmsignature, aliceSignature)
			).to.emit(feeAccountFactory, "Closed");
			expect(await seed.balanceOf(feeAccount.target.toString())).to.equal(0);
			expect(await seed.balanceOf(alice.address)).to.equal(aliceBalanceBefore + 500n);
			expect(await seed.balanceOf(feeManager.address)).to.equal(
				feeManagerBalanceBefore + 500n
			);
		});
	});
});
