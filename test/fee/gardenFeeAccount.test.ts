import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import type { GardenFEEAccount, GardenFEEAccountFactory, SEED } from "../../typechain-types";
import type { TypedDataDomain, BigNumberish, TypedDataField, AddressLike } from "ethers";
import { randomBytes } from "crypto";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { fee } from "../../typechain-types/contracts";

describe("--- Garden Fee Account ---", () => {
	type ClaimMessage = {
		nonce: BigNumberish;
		amount: BigNumberish;
		htlcs: GardenFEEAccount.HTLCStruct[];
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
			{ name: "timeLock", type: "uint256" },
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

	let gardenFeeAccountFactory: GardenFEEAccountFactory;

	let aliceDOMAIN: TypedDataDomain;
	let aliceGardenFEEAccountAddress: AddressLike;
	let aliceGardenFEEAccount: GardenFEEAccount;

	let bobDOMAIN: TypedDataDomain;
	let bobGardenFEEAccountAddress: AddressLike;
	let bobGardenFEEAccount: GardenFEEAccount;

	let charlieDOMAIN: TypedDataDomain;
	let charlieGardenFEEAccountAddress: AddressLike;
	let charlieGardenFEEAccount: GardenFEEAccount;

	let davidDOMAIN: TypedDataDomain;
	let davidGardenFEEAccountAddress: AddressLike;
	let davidGardenFEEAccount: GardenFEEAccount;

	before(async () => {
		[feeManager, alice, bob, charlie, david] = await ethers.getSigners();

		const SeedFactory = await ethers.getContractFactory("SEED");
		seed = (await SeedFactory.deploy()) as SEED;
		seed.waitForDeployment();

		const GardenFEEAccountFactory = await ethers.getContractFactory(
			"GardenFEEAccountFactory"
		);
		gardenFeeAccountFactory = (await GardenFEEAccountFactory.deploy(
			await seed.getAddress(),
			feeManager.address,
			"GardenFEEAccount",
			"1"
		)) as GardenFEEAccountFactory;
		gardenFeeAccountFactory.waitForDeployment();
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

	describe("- GardenFEEAccount - Create -", () => {
		it("User should not able to settle GardenFEEAccount with before creation.", async () => {
			await expect(gardenFeeAccountFactory.connect(alice).settle(alice.address)).to.be
				.reverted;
		});

		it("User should not able to emit claim event without creation.", async () => {
			await expect(
				gardenFeeAccountFactory.connect(alice).claimed(feeManager.address, 0, 0, 0)
			).to.be.revertedWith("GardenFEEAccountFactory: caller must be fee channel");
		});

		it("User should not able to emit close event without creation.", async () => {
			await expect(
				gardenFeeAccountFactory.connect(alice).closed(feeManager.address)
			).to.be.revertedWith("GardenFEEAccountFactory: caller must be fee channel");
		});

		it("User should able to create GardenFEEAccount.", async () => {
			// --- Alice --- //
			aliceGardenFEEAccountAddress = await gardenFeeAccountFactory
				.connect(alice)
				.create.staticCall();

			await expect(gardenFeeAccountFactory.connect(alice).create()).to.emit(
				gardenFeeAccountFactory,
				"Created"
			);

			aliceGardenFEEAccount = await ethers.getContractAt(
				"GardenFEEAccount",
				aliceGardenFEEAccountAddress
			);

			aliceDOMAIN = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: aliceGardenFEEAccountAddress.toString(),
			};

			expect(await aliceGardenFEEAccount.funder()).to.equal(feeManager.address);
			expect(await aliceGardenFEEAccount.recipient()).to.equal(alice.address);

			// --- Bob --- //
			bobGardenFEEAccountAddress = await gardenFeeAccountFactory
				.connect(bob)
				.create.staticCall();

			await expect(gardenFeeAccountFactory.connect(bob).create()).to.emit(
				gardenFeeAccountFactory,
				"Created"
			);

			bobGardenFEEAccount = await ethers.getContractAt(
				"GardenFEEAccount",
				bobGardenFEEAccountAddress
			);

			bobDOMAIN = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: bobGardenFEEAccountAddress.toString(),
			};

			expect(await bobGardenFEEAccount.funder()).to.equal(feeManager.address);
			expect(await bobGardenFEEAccount.recipient()).to.equal(bob.address);
		});

		it("Should not able to call initialize again.", async () => {
			await expect(
				aliceGardenFEEAccount.__GardenFEEAccount_init(
					await seed.getAddress(),
					feeManager.address,
					alice.address,
					"GardenFEEAccount",
					"1"
				)
			).to.be.revertedWith("Initializable: contract is already initialized");
		});

		it("User should not able to create GardenFEEAccount while one channel is active.", async () => {
			await expect(gardenFeeAccountFactory.connect(alice).create()).to.be.revertedWith(
				"GardenFEEAccountFactory: fee channel exists"
			);
		});

		it("User should not able to create GardenFEEAccount while one channel is active with createAndClose().", async () => {
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
				gardenFeeAccountFactory
					.connect(alice)
					.createAndClose(
						ethers.parseEther("10"),
						feeManagerSignature,
						aliceSignature
					)
			).to.be.revertedWith("GardenFEEAccountFactory: fee channel exists");
		});

		it("User should not able to create GardenFEEAccount while one channel is active with createAndClaim().", async () => {
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
				gardenFeeAccountFactory
					.connect(alice)
					.createAndClaim(
						ethers.parseEther("1"),
						0,
						[],
						[],
						feeManagerSignature,
						aliceSignature
					)
			).to.be.revertedWith("GardenFEEAccountFactory: fee channel exists");
		});

		it("User should not able to settle GardenFEEAccount without claim.", async () => {
			await expect(
				gardenFeeAccountFactory.connect(alice).settle(alice.address)
			).to.be.revertedWith("GardenFEEAccount: no claim");
		});
	});

	describe("- GardenFEEAccount - Fee Manager Create -", () => {
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
				gardenFeeAccountFactory.connect(david).feeManagerCreate(david.address)
			).to.be.revertedWith("GardenFEEAccountFactory: caller must be fee manager");
		});
		it("Fee manager should able to create GardenFEEAccount.", async () => {
			davidGardenFEEAccountAddress = await gardenFeeAccountFactory
				.connect(david)
				.create.staticCall();

			await expect(
				gardenFeeAccountFactory.connect(feeManager).feeManagerCreate(david.address)
			).to.emit(gardenFeeAccountFactory, "Created");

			davidGardenFEEAccount = await ethers.getContractAt(
				"GardenFEEAccount",
				davidGardenFEEAccountAddress
			);

			davidDOMAIN = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: davidGardenFEEAccountAddress.toString(),
			};

			expect(await davidGardenFEEAccount.funder()).to.equal(feeManager.address);
			expect(await davidGardenFEEAccount.recipient()).to.equal(david.address);
		});
		it("User should not be able to claim with wrong number of secrets message.", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 0,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						timeLock: currentBlock + 10000,
						sendAmount: 1000,
						recieveAmount: 0,
					},
					{
						secretHash: ethers.sha256(secret2),
						timeLock: currentBlock + 1000,
						sendAmount: 0,
						recieveAmount: 1000,
					},
					{
						secretHash: ethers.sha256(secret3),
						timeLock: currentBlock + 100,
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
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						["0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.be.revertedWith("GardenFEEAccount: invalid input");
		});
		it("User should not be able to claim without funding it", async () => {
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						davidSignature,
						davidSignature
					)
			).to.be.revertedWith("GardenFEEAccount: invalid amount");
		});
		it("User should not be able to claim with wrong funder signature", async () => {
			await seed.transfer(davidGardenFEEAccountAddress, ethers.parseEther("1"));
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						davidSignature,
						davidSignature
					)
			).to.be.revertedWith("GardenFEEAccount: invalid funder signature");
		});
		it("User should not be able to claim with wrong user signature", async () => {
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						feeManagerSignature
					)
			).to.be.revertedWith("GardenFEEAccount: invalid recipient signature");
		});
		it("User should be able to claim few htlcs", async () => {
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(gardenFeeAccountFactory, "Claimed");
		});
		it("User should be able to claim with same number of secrets", async () => {
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, "0x"],
						feeManagerSignature,
						davidSignature
					)
			).to.be.revertedWith("GardenFEEAccount: override conditions not met");
		});
		it("User be able to claim with more number of secrets", async () => {
			await expect(
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret2, secret3],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(gardenFeeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 1,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						timeLock: currentBlock + 10000,
						sendAmount: 1000,
						recieveAmount: 0,
					},
					{
						secretHash: ethers.sha256(secret3),
						timeLock: currentBlock + 100,
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
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1, secret3],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(gardenFeeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce and amount equal to totalAmount", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 2,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						timeLock: currentBlock + 10000,
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
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(gardenFeeAccountFactory, "Claimed");
		});
		it("User be able to claim with greater nonce and amount equal to 0", async () => {
			const currentBlock = await ethers.provider.getBlockNumber();
			claimMessage = {
				nonce: 3,
				amount: ethers.parseEther("0.5"),
				htlcs: [
					{
						secretHash: ethers.sha256(secret1),
						timeLock: currentBlock + 10000,
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
				davidGardenFEEAccount
					.connect(david)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[secret1],
						feeManagerSignature,
						davidSignature
					)
			).to.emit(gardenFeeAccountFactory, "Claimed");
		});
		it("User should be able to settle after expiration.", async () => {
			mine((await ethers.provider.getBlockNumber()) + 14400);
			await expect(davidGardenFEEAccount.connect(david).settle()).to.emit(
				gardenFeeAccountFactory,
				"Closed"
			);
		});
	});

	describe("- GardenFEEAccount - Settle -", () => {
		let feeManagerSignature: string;
		let charlieSignature: string;
		let claimMessage: ClaimMessage;
		it("User should able to createAndClaim.", async () => {
			claimMessage = {
				nonce: 0,
				amount: ethers.parseEther("1"),
				htlcs: [],
			};

			charlieGardenFEEAccountAddress = await gardenFeeAccountFactory
				.connect(charlie)
				.create.staticCall();

			charlieDOMAIN = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: charlieGardenFEEAccountAddress.toString(),
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

			await seed.transfer(charlieGardenFEEAccountAddress, ethers.parseEther("1"));

			await expect(
				gardenFeeAccountFactory
					.connect(charlie)
					.createAndClaim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[],
						feeManagerSignature,
						charlieSignature
					)
			).to.emit(gardenFeeAccountFactory, "Created");

			charlieGardenFEEAccount = await ethers.getContractAt(
				"GardenFEEAccount",
				charlieGardenFEEAccountAddress
			);

			expect(await charlieGardenFEEAccount.funder()).to.equal(feeManager.address);
			expect(await charlieGardenFEEAccount.recipient()).to.equal(charlie.address);
		});
		it("User should not be able to claim the same message.", async () => {
			expect(
				charlieGardenFEEAccount
					.connect(charlie)
					.claim(
						claimMessage.amount,
						claimMessage.nonce,
						claimMessage.htlcs,
						[],
						feeManagerSignature,
						charlieSignature
					)
			).to.be.revertedWith("GardenFEEAccount: claim already exists");
		});
		it("User should not be able to settle before expiration.", async () => {
			await expect(charlieGardenFEEAccount.connect(charlie).settle()).to.be.revertedWith(
				"GardenFEEAccount: claim not expired"
			);
		});
		it("User should be able to settle after expiration.", async () => {
			mine((await ethers.provider.getBlockNumber()) + 14400);
			await expect(charlieGardenFEEAccount.connect(charlie).settle()).to.emit(
				gardenFeeAccountFactory,
				"Closed"
			);
		});
	});

	describe("- GardenFEEAccount - Close -", () => {
		it("Alice should not able to close with invalid funder signature.", async () => {
			const fakeDomain: TypedDataDomain = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: 1,
				verifyingContract: aliceGardenFEEAccountAddress.toString(),
			};

			const closeMessage: CloseMessage = {
				amount: await aliceGardenFEEAccount.totalAmount(),
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
				aliceGardenFEEAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, aliceSignature)
			).to.be.revertedWith("GardenFEEAccount: invalid funder signature");
		});

		it("Alice should not able to close with invalid recipient signature.", async () => {
			const closeMessage: CloseMessage = {
				amount: await aliceGardenFEEAccount.totalAmount(),
			};

			const feeManagerSignature = await feeManager.signTypedData(
				aliceDOMAIN,
				CLOSE_TYPES,
				closeMessage
			);

			await expect(
				aliceGardenFEEAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, feeManagerSignature)
			).to.be.revertedWith("GardenFEEAccount: invalid recipient signature");
		});

		it("Alice should able to close with valid close message signatures.", async () => {
			const closeMessage: CloseMessage = {
				amount: await aliceGardenFEEAccount.totalAmount(),
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
				aliceGardenFEEAccount
					.connect(alice)
					.close(closeMessage.amount, feeManagerSignature, aliceSignature)
			).to.emit(gardenFeeAccountFactory, "Closed");
		});

		it("Alice should not able to create and close without appropriate token balance.", async () => {
			await seed
				.connect(feeManager)
				.transfer(await alice.getAddress(), ethers.parseEther("10"));

			aliceGardenFEEAccountAddress = await gardenFeeAccountFactory
				.connect(alice)
				.create.staticCall();

			aliceDOMAIN = {
				name: "GardenFEEAccount",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: aliceGardenFEEAccountAddress.toString(),
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
				gardenFeeAccountFactory
					.connect(alice)
					.createAndClose(ethers.parseEther("1"), feeManagerSignature, aliceSignature)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");
		});

		it("Alice should able to create and close new GardenFEEAccount.", async () => {
			const aliceBalanceBefore = await seed.balanceOf(await alice.getAddress());
			const feeManagerBalanceBefore = await seed.balanceOf(await feeManager.getAddress());

			await seed
				.connect(alice)
				.approve(aliceGardenFEEAccountAddress, ethers.parseEther("2"));
			await seed
				.connect(alice)
				.transfer(aliceGardenFEEAccountAddress, ethers.parseEther("2"));

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
				gardenFeeAccountFactory
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

	describe("- GardenFEEAccount - Claim -", () => {
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
				aliceGardenFEEAccount
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
