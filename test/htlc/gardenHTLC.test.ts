import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { randomBytes } from "crypto";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import type { GardenHTLC, SEED } from "../../typechain-types";
import type {
	AddressLike,
	BigNumberish,
	BytesLike,
	TypedDataDomain,
	TypedDataField,
} from "ethers";

describe("--- HTLC ---", () => {
	type Initiate = {
		redeemer: AddressLike;
		expiry: BigNumberish;
		amount: BigNumberish;
		secretHash: BytesLike;
	};

	const INITIATE_TYPE: Record<string, TypedDataField[]> = {
		Initiate: [
			{ name: "redeemer", type: "address" },
			{ name: "expiry", type: "uint256" },
			{ name: "amount", type: "uint256" },
			{ name: "secretHash", type: "bytes32" },
		],
	};

	const REFUND_TYPE: Record<string, TypedDataField[]> = {
		Refund: [{ name: "orderId", type: "bytes32" }],
	};

	let owner: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let charlie: HardhatEthersSigner;

	let seed: SEED;

	let gardenHTLC: GardenHTLC;
	let DOMAIN: TypedDataDomain;

	let secret1: BytesLike;
	let secret2: BytesLike;
	let secret3: BytesLike;
	let secret4: BytesLike;
	let secret5: BytesLike;
	let secret6: BytesLike;

	let orderID1: BytesLike;
	let orderID2: BytesLike;
	let orderID3: BytesLike;
	let orderID4: BytesLike;
	let orderID5: BytesLike;
	let orderID6: BytesLike;

	let expiry_: BigNumberish;

	before(async () => {
		[owner, alice, bob, charlie] = await ethers.getSigners();

		const SEED = await ethers.getContractFactory("SEED");
		seed = (await SEED.deploy()) as SEED;
		await seed.waitForDeployment();

		const GardenHTLCFactory = await ethers.getContractFactory("GardenHTLC");
		gardenHTLC = (await GardenHTLCFactory.deploy(
			await seed.getAddress(),
			"GardenHTLC",
			"1"
		)) as GardenHTLC;
		await gardenHTLC.waitForDeployment();

		secret1 = randomBytes(32);
		secret2 = randomBytes(32);
		secret3 = randomBytes(32);
		secret4 = randomBytes(32);
		secret5 = randomBytes(32);
		secret6 = randomBytes(32);
	});

	describe("- Pre-Conditions -", () => {
		it("Should have different addresses for each user and owner.", async () => {
			expect(await owner.getAddress()).to.not.equal(await alice.getAddress());
			expect(await owner.getAddress()).to.not.equal(await bob.getAddress());
			expect(await owner.getAddress()).to.not.equal(await charlie.getAddress());
			expect(await alice.getAddress()).to.not.equal(await bob.getAddress());
			expect(await alice.getAddress()).to.not.equal(await charlie.getAddress());
			expect(await bob.getAddress()).to.not.equal(await charlie.getAddress());
		});

		it("Owner should have 147M SEED token.", async () => {
			expect(await seed.balanceOf(await owner.getAddress())).to.equal(
				ethers.parseEther("147000000")
			);
		});

		it("Users should have 0 SEED token.", async () => {
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await charlie.getAddress())).to.equal(0);
		});

		it("HTLC should have 0 SEED token.", async () => {
			expect(await seed.balanceOf(await gardenHTLC.getAddress())).to.equal(0);
		});

		it("Should have different secrets.", async () => {
			expect(secret1).to.not.equal(secret2);
			expect(secret2).to.not.equal(secret3);
			expect(secret3).to.not.equal(secret4);
			expect(secret4).to.not.equal(secret5);
		});

		it("HTLC should be deployed with correct address of SEED.", async () => {
			expect(await gardenHTLC.token()).to.equal(await seed.getAddress());
		});

		it("Should have correct EIP712 order typehash.", async () => {
			const bytecode = await ethers.provider.getCode(await gardenHTLC.getAddress());

			const calculatedOrderTypehash = ethers
				.keccak256(
					ethers.toUtf8Bytes(
						"Initiate(address redeemer,uint256 expiry,uint256 amount,bytes32 secretHash)"
					)
				)
				.slice(2);

			expect(bytecode).to.include(calculatedOrderTypehash);
		});

		it("Should have defined the EIP712 domain.", async () => {
			const domain = await gardenHTLC.eip712Domain();

			DOMAIN = {
				name: "GardenHTLC",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: await gardenHTLC.getAddress(),
			};

			expect(domain).to.deep.equal([
				"0x0f",
				DOMAIN.name,
				DOMAIN.version,
				DOMAIN.chainId,
				DOMAIN.verifyingContract,
				"0x" + "0".repeat(64),
				[],
			]);
		});
	});

	describe("- HTLC - Initiate -", () => {
		it("Should not able to initiate with no redeemer.", async () => {
			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						ethers.ZeroAddress,
						(await ethers.provider.getBlockNumber()) + 7200,
						ethers.parseEther("10"),
						ethers.sha256(secret1)
					)
			).to.be.revertedWith("GardenHTLC: zero address redeemer");
		});

		it("Should not able to initiate a swap with no amount.", async () => {
			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						(await ethers.provider.getBlockNumber()) + 7200,
						0n,
						ethers.sha256(secret1)
					)
			).to.be.revertedWith("GardenHTLC: zero amount");
		});

		it("Should not able to initiate a swap with a 0 expiry.", async () => {
			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(bob.address, 0n, ethers.parseEther("10"), ethers.sha256(secret1))
			).to.be.revertedWith("GardenHTLC: zero expiry");
		});

		it("Should not able to initiate swap with amount greater than allowance.", async () => {
			await seed
				.connect(alice)
				.approve(gardenHTLC.getAddress(), ethers.parseEther("100"));

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						(await ethers.provider.getBlockNumber()) + 7200,
						ethers.parseEther("1000"),
						ethers.sha256(secret1)
					)
			).to.be.revertedWith("ERC20: insufficient allowance");
		});

		it("Should not able to initiate swap with amount greater than balance.", async () => {
			await seed
				.connect(alice)
				.approve(gardenHTLC.getAddress(), ethers.parseEther("1000"));

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						(await ethers.provider.getBlockNumber()) + 7200,
						ethers.parseEther("1000"),
						ethers.sha256(secret1)
					)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");
		});

		it("Should able to initiate a swap with correct parameters.", async () => {
			await seed.connect(owner).transfer(alice.address, ethers.parseEther("100"));

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;

			const initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret1),
			};
			orderID1 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						initiate.redeemer,
						initiate.expiry,
						initiate.amount,
						initiate.secretHash
					)
			)
				.to.emit(gardenHTLC, "Initiated")
				.withArgs(orderID1, initiate.secretHash, initiate.amount);
		});

		it("Should not able to initiate a swap with the same secret.", async () => {
			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						(await ethers.provider.getBlockNumber()) + 7200,
						ethers.parseEther("100"),
						ethers.sha256(secret1)
					)
			).to.be.revertedWith("GardenHTLC: duplicate order");
		});

		it("Should able to initiate another swap with different secret.", async () => {
			await seed.connect(owner).transfer(alice.address, ethers.parseEther("500"));

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			let initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret2),
			};
			orderID2 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						expiry_,
						ethers.parseEther("100"),
						ethers.sha256(secret2)
					)
			)
				.to.emit(gardenHTLC, "Initiated")
				.withArgs(orderID2, initiate.secretHash, initiate.amount);

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			initiate = {
				redeemer: charlie.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret3),
			};
			orderID3 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						expiry_,
						ethers.parseEther("100"),
						ethers.sha256(secret3)
					)
			)
				.to.emit(gardenHTLC, "Initiated")
				.withArgs(orderID3, initiate.secretHash, initiate.amount);

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret4),
			};
			orderID4 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						bob.address,
						expiry_,
						ethers.parseEther("100"),
						ethers.sha256(secret4)
					)
			)
				.to.emit(gardenHTLC, "Initiated")
				.withArgs(orderID4, initiate.secretHash, initiate.amount);
		});
	});

	describe("- HTLC - Signature Initiate -", () => {
		it("Should not able to initiate a swap with same initiator and redeemer.", async () => {
			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			const initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret5),
			};

			const signature = await bob.signTypedData(DOMAIN, INITIATE_TYPE, initiate);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiateWithSignature(
						bob.address,
						expiry_,
						ethers.parseEther("100"),
						ethers.sha256(secret5),
						signature
					)
			).to.be.revertedWith("GardenHTLC: same initiator and redeemer");
		});

		it("Should not able to initiate a swap with no amount.", async () => {
			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			const initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: 0n,
				secretHash: ethers.sha256(secret5),
			};

			const signature = await alice.signTypedData(DOMAIN, INITIATE_TYPE, initiate);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiateWithSignature(
						bob.address,
						expiry_,
						0n,
						ethers.sha256(secret5),
						signature
					)
			).to.be.revertedWith("GardenHTLC: zero amount");
		});

		it("Should able to initiate a swap with valid signature.", async () => {
			await seed.connect(owner).transfer(alice.address, ethers.parseEther("100"));

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			const initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret5),
			};
			orderID5 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);

			const signature = await alice.signTypedData(DOMAIN, INITIATE_TYPE, initiate);

			await expect(
				gardenHTLC
					.connect(alice)
					.initiateWithSignature(
						bob.address,
						expiry_,
						ethers.parseEther("100"),
						ethers.sha256(secret5),
						signature
					)
			).to.emit(gardenHTLC, "Initiated");
		});
	});

	describe("- HTLC - Redeem -", () => {
		it("Bob should not be able to redeem a swap with no initiator.", async () => {
			await expect(
				gardenHTLC.connect(bob).redeem(randomBytes(32), randomBytes(32))
			).to.be.revertedWith("GardenHTLC: order not initiated");
		});

		it("Bob should not be able to redeem a swap with invalid orderId.", async () => {
			await expect(
				gardenHTLC.connect(bob).redeem(randomBytes(32), ethers.sha256(secret1))
			).to.be.revertedWith("GardenHTLC: order not initiated");
		});

		it("Bob should not be able to redeem a swap with invalid secret.", async () => {
			const orderId = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[ethers.sha256(secret1), alice.address]
				)
			);

			await expect(
				gardenHTLC.connect(bob).redeem(orderId, randomBytes(32))
			).to.be.revertedWith("GardenHTLC: incorrect secret");
		});

		it("Bob should be able to redeem a swap with valid secret.", async () => {
			await expect(gardenHTLC.connect(bob).redeem(orderID1, secret1))
				.to.emit(gardenHTLC, "Redeemed")
				.withArgs(orderID1, ethers.sha256(secret1), secret1);

			expect(await seed.balanceOf(bob.address)).to.equal(ethers.parseEther("100"));
		});

		it("Bob should not be able to redeem a swap with the same secret.", async () => {
			await expect(gardenHTLC.connect(bob).redeem(orderID1, secret1)).to.be.revertedWith(
				"GardenHTLC: order fulfilled"
			);
		});

		it("Bob should receive the correct amount even if Charlie redeems with valid secret.", async () => {
			await expect(gardenHTLC.connect(charlie).redeem(orderID2, secret2))
				.to.emit(gardenHTLC, "Redeemed")
				.withArgs(orderID2, ethers.sha256(secret2), secret2);

			expect(await seed.balanceOf(bob.address)).to.equal(ethers.parseEther("200"));
			expect(await seed.balanceOf(charlie.address)).to.equal(0);
		});
	});

	describe("- HTLC - Refund -", () => {
		it("Alice should not be able to refund a swap with no initiator.", async () => {
			await expect(gardenHTLC.connect(alice).refund(randomBytes(32))).to.be.revertedWith(
				"GardenHTLC: order not initiated"
			);
		});

		it("Alice should not be able to refund a swap that is already redeemed.", async () => {
			await expect(gardenHTLC.connect(alice).refund(orderID1)).to.be.revertedWith(
				"GardenHTLC: order fulfilled"
			);
		});

		it("Alice should not be able to refund a swap earlier than the locktime.", async () => {
			await expect(gardenHTLC.connect(alice).refund(orderID3)).to.be.revertedWith(
				"GardenHTLC: order not expired"
			);
		});

		it("Alice should be able to refund a swap after the locktime.", async () => {
			mine((await ethers.provider.getBlockNumber()) + 7200);

			await expect(gardenHTLC.connect(alice).refund(orderID3))
				.to.emit(gardenHTLC, "Refunded")
				.withArgs(orderID3);

			expect(await seed.balanceOf(alice.address)).to.equal(ethers.parseEther("300"));
		});

		it("Alice should not be able to refund a swap that is already refunded.", async () => {
			await expect(gardenHTLC.connect(alice).refund(orderID3)).to.be.revertedWith(
				"GardenHTLC: order fulfilled"
			);
		});

		it("Alice should receive the correct amount even if Charlie refunds after the locktime.", async () => {
			await expect(gardenHTLC.connect(charlie).refund(orderID4))
				.to.emit(gardenHTLC, "Refunded")
				.withArgs(orderID4);

			expect(await seed.balanceOf(alice.address)).to.equal(ethers.parseEther("400"));
			expect(await seed.balanceOf(charlie.address)).to.equal(0);
		});

		it("Alice should able to able to refund a swap with valid signature.", async () => {
			await expect(gardenHTLC.connect(alice).refund(orderID5))
				.to.emit(gardenHTLC, "Refunded")
				.withArgs(orderID5);

			expect(await seed.balanceOf(alice.address)).to.equal(ethers.parseEther("500"));
		});
	});

	describe("- HTLC - Instant Refund -", () => {
		let instantRefund: {
			orderId: string;
		};
		it("Should not able to instant refund a swap with an invalid signature.", async () => {
			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;
			const initiate: Initiate = {
				redeemer: bob.address,
				expiry: expiry_,
				amount: ethers.parseEther("100"),
				secretHash: ethers.sha256(secret6),
			};

			orderID6 = ethers.sha256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes32", "address"],
					[initiate.secretHash, alice.address]
				)
			);
			await expect(
				gardenHTLC
					.connect(alice)
					.initiate(
						initiate.redeemer,
						initiate.expiry,
						initiate.amount,
						initiate.secretHash
					)
			)
				.to.emit(gardenHTLC, "Initiated")
				.withArgs(orderID6, initiate.secretHash, initiate.amount);

			instantRefund = { orderId: orderID6 };

			const instantRefundSig = await alice.signTypedData(
				DOMAIN,
				REFUND_TYPE,
				instantRefund
			);

			await expect(
				gardenHTLC.connect(charlie).instantRefund(orderID6, instantRefundSig)
			).to.be.revertedWith("HTLC: invalid redeemer signature");
		});
		it("Should not able to instant refund a swap with an valid signature.", async () => {
			const instantRefundSig = await bob.signTypedData(
				DOMAIN,
				REFUND_TYPE,
				instantRefund
			);

			await expect(gardenHTLC.connect(charlie).instantRefund(orderID6, instantRefundSig))
				.to.emit(gardenHTLC, "Refunded")
				.withArgs(orderID6);
		});
	});
});
