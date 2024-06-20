import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import type { FeeAccount, FeeAccountFactory, SEED } from "../../typechain-types";
import type { TypedDataDomain, BigNumberish, TypedDataField, AddressLike } from "ethers";
import { randomBytes } from "crypto";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { fee } from "../../typechain-types/contracts";

describe("--- Garden Fee Account ---", () => {
	type ClaimMessage = {
		nonce: BigNumberish;
		amount: BigNumberish;
		htlcs: FeeAccount.HTLCStruct[];
	};

	type CloseMessage = {
		amount: BigNumberish;
	};

	const CLAIM_TYPES: Record<string, TypedDataField[]> = {
		Claim: [
			{ name: "nonce", type: "uint256" },
			{ name: "amount", type: "uint256" },
			{ name: "htlcs", type: "HTLC[]" },
		],
		HTLC: [
			{ name: "secretHash", type: "bytes32" },
			{ name: "expiry", type: "uint256" },
			{ name: "sendAmount", type: "uint256" },
			{ name: "recieveAmount", type: "uint256" },
		],
	};

	const CLOSE_TYPES: Record<string, TypedDataField[]> = {
		Close: [{ name: "amount", type: "uint256" }],
	};

	let feeManager: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let charlie: HardhatEthersSigner;
	let david: HardhatEthersSigner;

	let seed: SEED;

	let feeAccountFactory: FeeAccountFactory;

	let aliceDOMAIN: TypedDataDomain;
	let aliceFeeAccountAddress: AddressLike;
	let aliceFeeAccount: FeeAccount;

	let bobDOMAIN: TypedDataDomain;
	let bobFeeAccountAddress: AddressLike;
	let bobFeeAccount: FeeAccount;

	let charlieDOMAIN: TypedDataDomain;
	let charlieFeeAccountAddress: AddressLike;
	let charlieFeeAccount: FeeAccount;

	let davidDOMAIN: TypedDataDomain;
	let davidFeeAccountAddress: AddressLike;
	let davidFeeAccount: FeeAccount;

	before(async () => {
		[feeManager, alice, bob, charlie, david] = await ethers.getSigners();

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
	});

	describe("- Pre-Conditons -", () => {
		it("Users and feeManager should have different addresses.", async () => {
			expect(await alice.getAddress()).to.not.equal(await feeManager.getAddress());
			expect(await bob.getAddress()).to.not.equal(await feeManager.getAddress());
			expect(await charlie.getAddress()).to.not.equal(await feeManager.getAddress());
			expect(await david.getAddress()).to.not.equal(await feeManager.getAddress());
		});

		it("Owner should have total supply as SEED balance.", async () => {
			expect(await seed.balanceOf(await feeManager.getAddress())).to.equal(
				await seed.totalSupply()
			);
		});

		it("Users should have 0 SEED balance.", async () => {
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await charlie.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await david.getAddress())).to.equal(0);
		});
	});

	describe("- FeeAccount - Create -", () => {
		it("User should not able to settle FeeAccount with before creation.", async () => {
			await expect(feeAccountFactory.connect(alice).settle(alice.address)).to.be.reverted;
		});

		it("User should not able to emit claim event without creation.", async () => {
			await expect(
				feeAccountFactory.connect(alice).claimed(feeManager.address, 0, 0, 0)
			).to.be.revertedWith("FeeAccountFactory: caller must be fee channel");
		});

		it("User should not able to emit close event without creation.", async () => {
			await expect(
				feeAccountFactory.connect(alice).closed(feeManager.address)
			).to.be.revertedWith("FeeAccountFactory: caller must be fee channel");
		});

		it("User should able to create FeeAccount.", async () => {
			// --- Alice --- //
			aliceFeeAccountAddress = await feeAccountFactory.connect(alice).create.staticCall();

			await expect(feeAccountFactory.connect(alice).create()).to.emit(
				feeAccountFactory,
				"Created"
			);

			aliceFeeAccount = await ethers.getContractAt("FeeAccount", aliceFeeAccountAddress);

			aliceDOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: aliceFeeAccountAddress.toString(),
			};

			expect(await aliceFeeAccount.funder()).to.equal(feeManager.address);
			expect(await aliceFeeAccount.recipient()).to.equal(alice.address);

			// --- Bob --- //
			bobFeeAccountAddress = await feeAccountFactory.connect(bob).create.staticCall();

			await expect(feeAccountFactory.connect(bob).create()).to.emit(
				feeAccountFactory,
				"Created"
			);

			bobFeeAccount = await ethers.getContractAt("FeeAccount", bobFeeAccountAddress);

			bobDOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: bobFeeAccountAddress.toString(),
			};

			expect(await bobFeeAccount.funder()).to.equal(feeManager.address);
			expect(await bobFeeAccount.recipient()).to.equal(bob.address);
		});

		it("Should not able to call initialize again.", async () => {
			await expect(
				aliceFeeAccount.__FeeAccount_init(
					await seed.getAddress(),
					feeManager.address,
					alice.address,
					"FeeAccount",
					"1"
				)
			).to.be.revertedWith("Initializable: contract is already initialized");
		});

		it("User should not able to create FeeAccount while one channel is active.", async () => {
			await expect(feeAccountFactory.connect(alice).create()).to.be.revertedWith(
				"FeeAccountFactory: fee channel exists"
			);
		});

		it("User should not able to create FeeAccount while one channel is active with createAndClose().", async () => {
			const aliceSignature = await alice.signTypedData(aliceDOMAIN, CLOSE_TYPES, {
				amount: ethers.parseEther("10"),
			});
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				{
					amount: ethers.parseEther("10"),
				}
			);

			await expect(
				feeAccountFactory
					.connect(alice)
					.createAndClose(
						ethers.parseEther("10"),
						feeManagerSignature,
						aliceSignature
					)
			).to.be.revertedWith("FeeAccountFactory: fee channel exists");
		});

		it("User should not able to create FeeAccount while one channel is active with createAndClaim().", async () => {
			const aliceSignature = await alice.signTypedData(aliceDOMAIN, CLAIM_TYPES, {
				nonce: 0,
				amount: ethers.parseEther("1"),
				htlcs: [],
			});
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLAIM_TYPES,
				{
					nonce: 0,
					amount: ethers.parseEther("1"),
					htlcs: [],
				}
			);

			await expect(
				feeAccountFactory
					.connect(alice)
					.createAndClaim(
						ethers.parseEther("1"),
						0,
						[],
						[],
						feeManagerSignature,
						aliceSignature
					)
			).to.be.revertedWith("FeeAccountFactory: fee channel exists");
		});

		it("User should not able to settle FeeAccount without claim.", async () => {
			await expect(
				feeAccountFactory.connect(alice).settle(alice.address)
			).to.be.revertedWith("FeeAccount: no claim");
		});
	});

	describe("- FeeAccount - Fee Manager Create -", () => {
		let claimMessage: ClaimMessage;
		let secret1: Buffer;
		let secret2: Buffer;
		let secret3: Buffer;
		let feeManagerSignature: string;
		let davidSignature: string;
		it("should generate secrets.", async () => {
			secret1 = randomBytes(32);
			secret2 = randomBytes(32);
			secret3 = randomBytes(32);
		});
		it("User should able to call feeManagerCreate", async () => {
			await expect(
				feeAccountFactory.connect(david).feeManagerCreate(david.address)
			).to.be.revertedWith("FeeAccountFactory: caller must be fee manager");
		});
		it("Fee manager should able to create FeeAccount.", async () => {
			davidFeeAccountAddress = await feeAccountFactory.connect(david).create.staticCall();

			await expect(
				feeAccountFactory.connect(feeManager).feeManagerCreate(david.address)
			).to.emit(feeAccountFactory, "Created");

			davidFeeAccount = await ethers.getContractAt("FeeAccount", davidFeeAccountAddress);

			davidDOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: davidFeeAccountAddress.toString(),
			};

			expect(await davidFeeAccount.funder()).to.equal(feeManager.address);
			expect(await davidFeeAccount.recipient()).to.equal(david.address);
		});
		it("User should not be able to claim with wrong number of secrets message.", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 1,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						expiry: currentBlock + 10000,
						sendAmount: 1000,
						recieveAmount: 0,
					},
					{
						secretHash: ethers.sha256(secret2),
						expiry: currentBlock + 1000,
						sendAmount: 0,
						recieveAmount: 1000,
					},
					{
						secretHash: ethers.sha256(secret3),
						expiry: currentBlock + 100,
						sendAmount: 1000,
						recieveAmount: 0,
					},
				],
			};

			feeManagerSignature = await feeManager.signTypedData(
				davidDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			davidSignature = await david.signTypedData(davidDOMAIN, CLAIM_TYPES, claimMessage);

			expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						["0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.be.revertedWith("FeeAccount: invalid input");
		});
		it("User should not be able to claim without funding it", async () => {
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						davidSignature,
						davidSignature
					)
			).to.be.revertedWith("FeeAccount: invalid amount");
		});
		it("User should not be able to claim with wrong funder signature", async () => {
			await seed.transfer(davidFeeAccountAddress, ethers.parseEther("1"));
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						davidSignature,
						davidSignature
					)
			).to.be.revertedWith("FeeAccount: invalid funder signature");
		});
		it("User should not be able to claim with wrong user signature", async () => {
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						feeManagerSignature
					)
			).to.be.revertedWith("FeeAccount: invalid recipient signature");
		});
		it("User should be able to claim few htlcs", async () => {
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(feeAccountFactory, "Claimed");
		});
		it("User should be able to claim with same number of secrets", async () => {
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.be.revertedWith("FeeAccount: override conditions not met");
		});
		it("User be able to claim with more number of secrets", async () => {
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, secret3],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(feeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 2,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						expiry: currentBlock + 10000,
						sendAmount: 1000,
						recieveAmount: 0,
					},
					{
						secretHash: ethers.sha256(secret3),
						expiry: currentBlock + 100,
						sendAmount: 1000,
						recieveAmount: 0,
					},
				],
			};

			feeManagerSignature = await feeManager.signTypedData(
				davidDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			davidSignature = await david.signTypedData(davidDOMAIN, CLAIM_TYPES, claimMessage);
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret3],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(feeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce and amount equal to totalAmount", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 3,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						expiry: currentBlock + 10000,
						sendAmount: ethers.parseEther("0.5"),
						recieveAmount: 0,
					},
				],
			};

			feeManagerSignature = await feeManager.signTypedData(
				davidDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			davidSignature = await david.signTypedData(davidDOMAIN, CLAIM_TYPES, claimMessage);
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(feeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce and amount equal to 0", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 4,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						expiry: currentBlock + 10000,
						sendAmount: 0,
						recieveAmount: ethers.parseEther("0.5"),
					},
				],
			};

			feeManagerSignature = await feeManager.signTypedData(
				davidDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			davidSignature = await david.signTypedData(davidDOMAIN, CLAIM_TYPES, claimMessage);
			await expect(
				davidFeeAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(feeAccountFactory, "Claimed");
		});
		it("User should be able to settle after expiration.", async () => {
			await mine((await ethers.provider.getBlockNumber()) + 14400);
			await expect(davidFeeAccount.connect(david).settle()).to.emit(
				feeAccountFactory,
				"Closed"
			);
		});
	});

	describe("- FeeAccount - Settle -", () => {
		let feeManagerSignature: string;
		let charlieSignature: string;
		let claimMessage: ClaimMessage;
		it("User should able to createAndClaim.", async () => {
			claimMessage = {
				nonce: 1,
				amount: ethers.parseEther("1"),
				htlcs: [],
			};

			charlieFeeAccountAddress = await feeAccountFactory
				.connect(charlie)
				.create.staticCall();

			charlieDOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: charlieFeeAccountAddress.toString(),
			};

			charlieSignature = await charlie.signTypedData(
				charlieDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);
			feeManagerSignature = await feeManager.signTypedData(
				charlieDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			await seed.transfer(charlieFeeAccountAddress, ethers.parseEther("1"));

			await expect(
				feeAccountFactory
					.connect(charlie)
					.createAndClaim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[],
						feeManagerSignature,
						charlieSignature
					)
			).to.emit(feeAccountFactory, "Created");

			charlieFeeAccount = await ethers.getContractAt(
				"FeeAccount",
				charlieFeeAccountAddress
			);

			expect(await charlieFeeAccount.funder()).to.equal(feeManager.address);
			expect(await charlieFeeAccount.recipient()).to.equal(charlie.address);
		});
		it("User should not be able to claim the same message.", async () => {
			expect(
				charlieFeeAccount
					.connect(charlie)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[],
						feeManagerSignature,
						charlieSignature
					)
			).to.be.revertedWith("FeeAccount: claim already exists");
		});
		it("User should not be able to settle before expiration.", async () => {
			await expect(charlieFeeAccount.connect(charlie).settle()).to.be.revertedWith(
				"FeeAccount: claim not expired"
			);
		});
		it("User should be able to settle after expiration.", async () => {
			mine((await ethers.provider.getBlockNumber()) + 14400);
			await expect(charlieFeeAccount.connect(charlie).settle()).to.emit(
				feeAccountFactory,
				"Closed"
			);
		});
	});

	describe("- FeeAccount - Close -", () => {
		it("Alice should not able to close with invalid funder signature.", async () => {
			const fakeDomain: TypedDataDomain = {
				name: "FeeAccount",
				version: "1",
				chainId: 1,
				verifyingContract: aliceFeeAccountAddress.toString(),
			};

			const closeMessage: CloseMessage = {
				amount: await aliceFeeAccount.totalAmount(),
			};

			const aliceSignature = await alice.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				closeMessage
			);
			const feeManagerSignature = await feeManager.signTypedData(
				fakeDomain,
				CLOSE_TYPES,
				closeMessage
			);

			await expect(
				aliceFeeAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, aliceSignature)
			).to.be.revertedWith("FeeAccount: invalid funder signature");
		});

		it("Alice should not able to close with invalid recipient signature.", async () => {
			const closeMessage: CloseMessage = {
				amount: await aliceFeeAccount.totalAmount(),
			};

			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				closeMessage
			);

			await expect(
				aliceFeeAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, feeManagerSignature)
			).to.be.revertedWith("FeeAccount: invalid recipient signature");
		});

		it("Alice should able to close with valid close message signatures.", async () => {
			const closeMessage: CloseMessage = {
				amount: await aliceFeeAccount.totalAmount(),
			};

			const aliceSignature = await alice.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				closeMessage
			);
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				closeMessage
			);

			await expect(
				aliceFeeAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, aliceSignature)
			).to.emit(feeAccountFactory, "Closed");
		});

		it("Alice should not able to create and close without appropriate token balance.", async () => {
			await seed
				.connect(feeManager)
				.transfer(await alice.getAddress(), ethers.parseEther("10"));

			aliceFeeAccountAddress = await feeAccountFactory.connect(alice).create.staticCall();

			aliceDOMAIN = {
				name: "FeeAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: aliceFeeAccountAddress.toString(),
			};

			const aliceSignature = await alice.signTypedData(aliceDOMAIN, CLOSE_TYPES, {
				amount: ethers.parseEther("1"),
			});
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				{
					amount: ethers.parseEther("1"),
				}
			);

			await expect(
				feeAccountFactory
					.connect(alice)
					.createAndClose(ethers.parseEther("1"), feeManagerSignature, aliceSignature)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");
		});

		it("Alice should able to create and close new FeeAccount.", async () => {
			const aliceBalanceBefore = await seed.balanceOf(await alice.getAddress());
			const feeManagerBalanceBefore = await seed.balanceOf(await feeManager.getAddress());

			await seed.connect(alice).approve(aliceFeeAccountAddress, ethers.parseEther("2"));
			await seed.connect(alice).transfer(aliceFeeAccountAddress, ethers.parseEther("2"));

			const aliceSignature = await alice.signTypedData(aliceDOMAIN, CLOSE_TYPES, {
				amount: ethers.parseEther("1"),
			});
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				{
					amount: ethers.parseEther("1"),
				}
			);

			await expect(
				feeAccountFactory
					.connect(alice)
					.createAndClose(ethers.parseEther("1"), feeManagerSignature, aliceSignature)
			).to.not.be.reverted;

			const aliceBalanceAfter = await seed.balanceOf(await alice.getAddress());
			const feeManagerBalanceAfter = await seed.balanceOf(await feeManager.getAddress());

			expect(aliceBalanceBefore - aliceBalanceAfter).to.equal(ethers.parseEther("1"));
			expect(feeManagerBalanceAfter - feeManagerBalanceBefore).to.equal(
				ethers.parseEther("1")
			);
		});
	});

	describe("- FeeAccount - Claim -", () => {
		it("Alice should able to claim 0 amount when there is no balance.", async () => {
			const claimMessage: ClaimMessage = {
				nonce: 0,
				amount: 0,
				htlcs: [],
			};

			const aliceSignature = await alice.signTypedData(
				aliceDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);
			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLAIM_TYPES,
				claimMessage
			);

			await expect(
				aliceFeeAccount
					.connect(alice)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[],
						feeManagerSignature,
						aliceSignature
					)
			).to.not.be.reverted;
		});
	});
});
