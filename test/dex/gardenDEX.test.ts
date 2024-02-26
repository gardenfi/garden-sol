import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import type { GardenDEX, SEED, WBTC } from "../../typechain-types";
import type { TypedDataDomain, BigNumberish, TypedDataField, AddressLike } from "ethers";

describe("--- Garden DEX ---", () => {
	type DexOrder = {
		creator: AddressLike;
		filler: AddressLike;
		fromToken: AddressLike;
		toToken: AddressLike;
		fromAmount: BigNumberish;
		toAmount: BigNumberish;
		expiry: BigNumberish;
	};

	const TYPES: Record<string, TypedDataField[]> = {
		Order: [
			{ name: "creator", type: "address" },
			{ name: "filler", type: "address" },
			{ name: "fromToken", type: "address" },
			{ name: "toToken", type: "address" },
			{ name: "fromAmount", type: "uint256" },
			{ name: "toAmount", type: "uint256" },
			{ name: "expiry", type: "uint256" },
		],
	};

	let owner: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let charlie: HardhatEthersSigner;

	let seed: SEED;
	let wbtc: WBTC;

	let gardenDEX: GardenDEX;
	let DOMAIN: TypedDataDomain;

	let expiry_: BigNumberish;

	before(async () => {
		[owner, alice, bob, charlie] = await ethers.getSigners();

		const SEED = await ethers.getContractFactory("SEED");
		seed = (await SEED.deploy()) as SEED;
		seed.waitForDeployment();

		const WBTC = await ethers.getContractFactory("WBTC");
		wbtc = (await WBTC.deploy()) as WBTC;
		wbtc.waitForDeployment();

		const GardenDEX = await ethers.getContractFactory("GardenDEX");
		gardenDEX = (await GardenDEX.deploy("GardenDEX", "1")) as GardenDEX;
		gardenDEX.waitForDeployment();
	});

	describe("- Pre-Condtions -", () => {
		it("Should have different addresses for each user and owner.", async () => {
			expect(alice.address).to.not.equal(bob.address);
			expect(alice.address).to.not.equal(charlie.address);
			expect(alice.address).to.not.equal(owner.address);
			expect(bob.address).to.not.equal(charlie.address);
			expect(bob.address).to.not.equal(owner.address);
			expect(charlie.address).to.not.equal(owner.address);
		});

		it("Should have different addresses for each token.", async () => {
			expect(await seed.getAddress()).to.not.equal(await wbtc.getAddress());
			expect(await seed.getAddress()).to.not.equal(await gardenDEX.getAddress());
			expect(await wbtc.getAddress()).to.not.equal(await gardenDEX.getAddress());
		});

		it("Owner should have 100% of the supply of each token.", async () => {
			expect(await seed.balanceOf(owner.address)).to.equal(await seed.totalSupply());
			expect(await wbtc.balanceOf(owner.address)).to.equal(await wbtc.totalSupply());
		});

		it("Should have correct EIP712 order typehash.", async () => {
			const bytecode = await ethers.provider.getCode(await gardenDEX.getAddress());

			const calculatedOrderTypehash = ethers
				.keccak256(
					ethers.toUtf8Bytes(
						"Order(address creator,address filler,address fromToken,address toToken,uint256 fromAmount,uint256 toAmount,uint256 expiry)"
					)
				)
				.slice(2);

			expect(bytecode).to.include(calculatedOrderTypehash);
		});

		it("Should have defined the EIP712 domain.", async () => {
			const gardenDexDomain = await gardenDEX.eip712Domain();

			DOMAIN = {
				name: "GardenDEX",
				version: "1",
				chainId: (await ethers.provider.getNetwork()).chainId,
				verifyingContract: await gardenDEX.getAddress(),
			};

			expect(gardenDexDomain).to.deep.equal([
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

	describe("- Swap -", () => {
		it("Signature verification should not pass with any incorrect signatures.", async () => {
			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("20000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) + 7200,
			};

			let aliceSignature = await charlie.signTypedData(DOMAIN, TYPES, order);
			let bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);
			expect(await gardenDEX.verify(order, aliceSignature, bobSignature)).to.be.false;

			aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			bobSignature = await charlie.signTypedData(DOMAIN, TYPES, order);
			expect(await gardenDEX.verify(order, aliceSignature, bobSignature)).to.be.false;
		});

		it("Signature verification should pass with correct set of signatures.", async () => {
			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("20000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) + 7200,
			};

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			expect(await gardenDEX.verify(order, aliceSignature, bobSignature)).to.be.true;
		});

		it("Should not able to swap tokens with insufficient allowance.", async () => {
			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("20000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) + 7200,
			};

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await expect(
				gardenDEX.connect(bob).settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("ERC20: insufficient allowance");

			expect(await seed.balanceOf(alice.address)).to.equal(aliceSeedBalanceBefore);
			expect(await wbtc.balanceOf(alice.address)).to.equal(aliceWbtcBalanceBefore);
			expect(await seed.balanceOf(bob.address)).to.equal(bobSeedBalanceBefore);
			expect(await wbtc.balanceOf(bob.address)).to.equal(bobWbtcBalanceBefore);
		});

		it("Should not able to swap tokens with insufficient balance.", async () => {
			await seed
				.connect(alice)
				.approve(await gardenDEX.getAddress(), ethers.parseUnits("20000", 18));
			await wbtc
				.connect(bob)
				.approve(await gardenDEX.getAddress(), ethers.parseUnits("2", 8));

			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("20000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) + 7200,
			};

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await expect(
				gardenDEX.connect(bob).settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");
			await expect(
				gardenDEX.connect(alice).settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");

			expect(await seed.balanceOf(alice.address)).to.equal(aliceSeedBalanceBefore);
			expect(await wbtc.balanceOf(alice.address)).to.equal(aliceWbtcBalanceBefore);
			expect(await seed.balanceOf(bob.address)).to.equal(bobSeedBalanceBefore);
			expect(await wbtc.balanceOf(bob.address)).to.equal(bobWbtcBalanceBefore);
		});

		it("Should able to swap tokens with valid signature.", async () => {
			await seed.transfer(alice.address, ethers.parseUnits("2000", 18));
			await wbtc.transfer(bob.address, ethers.parseUnits("2", 8));

			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			expiry_ = (await ethers.provider.getBlockNumber()) + 7200;

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("2000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: expiry_,
			};
			const orderID = ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					[
						"address",
						"address",
						"address",
						"address",
						"uint256",
						"uint256",
						"uint256",
					],
					[
						order.creator,
						order.filler,
						order.fromToken,
						order.toToken,
						order.fromAmount,
						order.toAmount,
						order.expiry,
					]
				)
			);

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await gardenDEX.connect(alice).settle(order, aliceSignature, bobSignature);

			expect(await gardenDEX.settled(orderID)).to.be.true;
			expect(await seed.balanceOf(alice.address)).to.equal(
				aliceSeedBalanceBefore - ethers.parseUnits("2000", 18)
			);
			expect(await wbtc.balanceOf(alice.address)).to.equal(
				aliceWbtcBalanceBefore + ethers.parseUnits("2", 8)
			);
			expect(await seed.balanceOf(bob.address)).to.equal(
				bobSeedBalanceBefore + ethers.parseUnits("2000", 18)
			);
			expect(await wbtc.balanceOf(bob.address)).to.equal(
				bobWbtcBalanceBefore - ethers.parseUnits("2", 8)
			);
		});

		it("Should not be able to swap tokens of settled order.", async () => {
			await seed.transfer(alice.address, ethers.parseUnits("2000", 18));
			await wbtc.transfer(bob.address, ethers.parseUnits("2", 8));

			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("2000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: expiry_,
			};

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await expect(
				gardenDEX.settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("GardenDEX: settled order");

			expect(await seed.balanceOf(alice.address)).to.equal(aliceSeedBalanceBefore);
			expect(await wbtc.balanceOf(alice.address)).to.equal(aliceWbtcBalanceBefore);
			expect(await seed.balanceOf(bob.address)).to.equal(bobSeedBalanceBefore);
			expect(await wbtc.balanceOf(bob.address)).to.equal(bobWbtcBalanceBefore);
		});

		it("Should not be able to swap tokens of expired order.", async () => {
			await seed.transfer(alice.address, ethers.parseUnits("2000", 18));
			await wbtc.transfer(bob.address, ethers.parseUnits("2", 8));

			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("2000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) - 1,
			};

			const aliceSignature = await alice.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await expect(
				gardenDEX.settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("GardenDEX: expired order");

			expect(await seed.balanceOf(alice.address)).to.equal(aliceSeedBalanceBefore);
			expect(await wbtc.balanceOf(alice.address)).to.equal(aliceWbtcBalanceBefore);
			expect(await seed.balanceOf(bob.address)).to.equal(bobSeedBalanceBefore);
			expect(await wbtc.balanceOf(bob.address)).to.equal(bobWbtcBalanceBefore);
		});

		it("Should not be able to swap tokens with invalid signature.", async () => {
			await seed.transfer(alice.address, ethers.parseUnits("2000", 18));
			await wbtc.transfer(bob.address, ethers.parseUnits("2", 8));

			const aliceSeedBalanceBefore = await seed.balanceOf(alice.address);
			const aliceWbtcBalanceBefore = await wbtc.balanceOf(alice.address);
			const bobSeedBalanceBefore = await seed.balanceOf(bob.address);
			const bobWbtcBalanceBefore = await wbtc.balanceOf(bob.address);

			const order: DexOrder = {
				creator: alice.address,
				filler: bob.address,
				fromToken: await seed.getAddress(),
				toToken: await wbtc.getAddress(),
				fromAmount: ethers.parseUnits("2000", 18),
				toAmount: ethers.parseUnits("2", 8),
				expiry: (await ethers.provider.getBlockNumber()) + 7200,
			};
			const orderID = ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					[
						"address",
						"address",
						"address",
						"address",
						"uint256",
						"uint256",
						"uint256",
					],
					[
						order.creator,
						order.filler,
						order.fromToken,
						order.toToken,
						order.fromAmount,
						order.toAmount,
						order.expiry,
					]
				)
			);

			const aliceSignature = await charlie.signTypedData(DOMAIN, TYPES, order);
			const bobSignature = await bob.signTypedData(DOMAIN, TYPES, order);

			await expect(
				gardenDEX.settle(order, aliceSignature, bobSignature)
			).to.be.revertedWith("GardenDEX: invalid signature(s)");
			expect(await gardenDEX.settled(orderID)).to.be.false;

			expect(await seed.balanceOf(alice.address)).to.equal(aliceSeedBalanceBefore);
			expect(await wbtc.balanceOf(alice.address)).to.equal(aliceWbtcBalanceBefore);
			expect(await seed.balanceOf(bob.address)).to.equal(bobSeedBalanceBefore);
			expect(await wbtc.balanceOf(bob.address)).to.equal(bobWbtcBalanceBefore);
		});
	});
});
