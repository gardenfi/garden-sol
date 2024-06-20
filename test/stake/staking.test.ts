import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import type { SEED, GardenStaker, Flower } from "../../typechain-types";

describe("--- STAKING ---", () => {
	const FILLER_STAKE = ethers.parseEther("210000");
	const FILLER_COOL_DOWN = 180 * 7200;
	const DELEGATE_STAKE = ethers.parseEther("2100");

	let owner: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let charlie: HardhatEthersSigner;

	let seed: SEED;
	let gardenStaker: GardenStaker;
	let flower: Flower;

	let stakeId1: string;
	let stakeId2: string;
	let stakeId3: string;
	let stakeId4: string;
	let stakeId5: string;
	let stakeId6: string;

	before(async () => {
		[owner, alice, bob, charlie] = await ethers.getSigners();

		const SEEDFactory = await ethers.getContractFactory("SEED");
		seed = (await SEEDFactory.deploy()) as SEED;
		await seed.waitForDeployment();

		const GardenStakerFactory = await ethers.getContractFactory("GardenStaker");
		gardenStaker = (await GardenStakerFactory.deploy(
			await seed.getAddress(),
			DELEGATE_STAKE,
			FILLER_STAKE,
			FILLER_COOL_DOWN
		)) as GardenStaker;
		await gardenStaker.waitForDeployment();

		const FlowerFactory = await ethers.getContractFactory("Flower");
		flower = (await FlowerFactory.deploy(
			"GardenTest",
			"GT",
			await gardenStaker.getAddress()
		)) as Flower;
		await flower.waitForDeployment();
	});

	describe("- Pre-Conditons -", () => {
		it("All users and owner should have different addresses.", async () => {
			expect(await owner.getAddress()).to.not.equal(await alice.getAddress());
			expect(await owner.getAddress()).to.not.equal(await bob.getAddress());
			expect(await owner.getAddress()).to.not.equal(await charlie.getAddress());
			expect(await alice.getAddress()).to.not.equal(await bob.getAddress());
			expect(await alice.getAddress()).to.not.equal(await charlie.getAddress());
			expect(await bob.getAddress()).to.not.equal(await charlie.getAddress());
		});

		it("Should have total supply of 147M with owner.", async () => {
			expect(await seed.balanceOf(await owner.getAddress())).to.equal(
				ethers.parseEther("147000000")
			);
		});

		it("All users should have 0 balance.", async () => {
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await charlie.getAddress())).to.equal(0);
		});

		it("Should have the correct initial state.", async () => {
			expect(await gardenStaker.DELEGATE_STAKE()).to.equal(DELEGATE_STAKE);
			expect(await gardenStaker.FILLER_STAKE()).to.equal(FILLER_STAKE);
			expect(await gardenStaker.FILLER_COOL_DOWN()).to.equal(FILLER_COOL_DOWN);
			expect(await gardenStaker.SEED()).to.equal(await seed.getAddress());
		});
	});

	describe("- Stake - Filler - ", () => {
		it("Alice should not able to register as a filler without stake.", async () => {
			await seed.connect(alice).approve(await gardenStaker.getAddress(), FILLER_STAKE);

			await expect(gardenStaker.connect(alice).register()).to.be.revertedWith(
				"ERC20: transfer amount exceeds balance"
			);
		});

		it("Alice should be able to register as a filler.", async () => {
			await seed.connect(owner).transfer(await alice.getAddress(), FILLER_STAKE);

			await gardenStaker.connect(alice).register();

			expect(
				await gardenStaker.hasRole(
					await gardenStaker.FILLER(),
					await alice.getAddress()
				)
			).to.equal(true);
			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				0,
				FILLER_STAKE,
				0,
				[],
			]);
		});

		it("Alice should not be able to register as a filler again.", async () => {
			await expect(gardenStaker.connect(alice).register()).to.be.revertedWith(
				"FillerManager: already registered"
			);
		});

		it("Alice should able to update fee.", async () => {
			await gardenStaker.connect(alice).updateFee(100);
			expect((await gardenStaker.getFiller(await alice.getAddress())).feeInBips).to.equal(
				100
			);
		});

		it("Alice should able to update fee again.", async () => {
			await gardenStaker.connect(alice).updateFee(200);
			expect((await gardenStaker.getFiller(await alice.getAddress())).feeInBips).to.equal(
				200
			);
		});

		it("Alice should not able to update fee more than or equal to 100%.", async () => {
			await expect(gardenStaker.connect(alice).updateFee(10001)).to.be.revertedWith(
				"FillerManager: fee too high"
			);

			await expect(gardenStaker.connect(alice).updateFee(10000)).to.be.revertedWith(
				"FillerManager: fee too high"
			);
		});

		it("Alice should able to deregister.", async () => {
			await gardenStaker.connect(alice).deregister();

			expect(
				await gardenStaker.hasRole(
					await gardenStaker.FILLER(),
					await alice.getAddress()
				)
			).to.equal(false);
			expect(
				(await gardenStaker.getFiller(await alice.getAddress())).deregisteredAt
			).to.equal(await ethers.provider.getBlockNumber());
		});

		it("Alice should not able to deregister again.", async () => {
			await expect(gardenStaker.connect(alice).deregister()).to.be.revertedWith(
				`AccessControl: account ${(
					await alice.getAddress()
				).toLowerCase()} is missing role ${(await gardenStaker.FILLER()).toLowerCase()}`
			);
		});

		it("Alice should not able to update fee after deregister.", async () => {
			await expect(gardenStaker.connect(alice).updateFee(100)).to.be.revertedWith(
				`AccessControl: account ${(
					await alice.getAddress()
				).toLowerCase()} is missing role ${(await gardenStaker.FILLER()).toLowerCase()}`
			);
		});

		it("Alice should not able to refund before cooldown period.", async () => {
			await expect(gardenStaker["refund(address)"](alice.address)).to.be.revertedWith(
				"FillerManager: cooldown not passed"
			);
		});

		it("Alice should able to refund after cooldown period.", async () => {
			await mine((await ethers.provider.getBlockNumber()) + FILLER_COOL_DOWN);

			await gardenStaker["refund(address)"](alice.address);
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(FILLER_STAKE);
		});

		it("Alice should not able to refund again.", async () => {
			await expect(gardenStaker["refund(address)"](alice.address)).to.be.revertedWith(
				"FillerManager: not deregistered"
			);
		});

		it("Alice should able to register as a filler again.", async () => {
			await seed.connect(alice).approve(await gardenStaker.getAddress(), FILLER_STAKE);
			await gardenStaker.connect(alice).register();

			expect(
				await gardenStaker.hasRole(
					await gardenStaker.FILLER(),
					await alice.getAddress()
				)
			).to.equal(true);
			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				0,
				FILLER_STAKE,
				0,
				[],
			]);
		});
	});

	describe("- Stake - Delegate - ", () => {
		it("Charlie should not able to vote without stake.", async () => {
			await seed
				.connect(charlie)
				.approve(await gardenStaker.getAddress(), DELEGATE_STAKE);

			await expect(
				gardenStaker.connect(charlie).vote(alice.address, 1, 180 * 7200)
			).to.be.revertedWith("ERC20: transfer amount exceeds balance");
		});

		it("Charlie should be able to vote(1:1) for Alice.", async () => {
			await seed.connect(owner).transfer(charlie.address, DELEGATE_STAKE);

			stakeId1 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[charlie.address, await gardenStaker.delegateNonce(charlie.address)]
			);
			await gardenStaker.connect(charlie).vote(alice.address, 1, 180 * 7200);

			expect(await gardenStaker.getVotes(alice.address)).to.equal(1);
		});

		it("Charlie should be able to vote(1:2, 3, 4 & 7) for Alice.", async () => {
			await seed.connect(owner).transfer(charlie.address, DELEGATE_STAKE * BigInt(100));
			await seed
				.connect(charlie)
				.approve(await gardenStaker.getAddress(), ethers.MaxUint256);

			await seed.connect(owner).transfer(charlie.address, DELEGATE_STAKE);

			stakeId2 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[charlie.address, await gardenStaker.delegateNonce(charlie.address)]
			);
			await gardenStaker.connect(charlie).vote(alice.address, 1, 365 * 7200);

			await mine((await ethers.provider.getBlockNumber()) + 100 * 7200);

			stakeId3 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[charlie.address, await gardenStaker.delegateNonce(charlie.address)]
			);
			await gardenStaker.connect(charlie).vote(alice.address, 1, 730 * 7200);

			stakeId5 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[charlie.address, await gardenStaker.delegateNonce(charlie.address)]
			);
			await gardenStaker.connect(charlie).vote(alice.address, 1, ethers.MaxUint256);

			expect(await gardenStaker.getVotes(alice.address)).to.equal(12);

			stakeId6 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[charlie.address, await gardenStaker.delegateNonce(charlie.address)]
			);
			await gardenStaker.connect(charlie).vote(alice.address, 1, 1460 * 7200);

			expect(await gardenStaker.getVotes(alice.address)).to.equal(16);
		});

		it("Charlie should not able to vote with invalid lock duration.", async () => {
			await expect(
				gardenStaker.connect(charlie).vote(alice.address, 1, 128)
			).to.be.revertedWith("DelegateManager: incorrect lock duration");
		});

		it("Charlie should not able to vote with invalid vote count.", async () => {
			await expect(
				gardenStaker.connect(charlie).vote(alice.address, 0, 180 * 7200)
			).to.be.revertedWith("DelegateManager: zero unit");
		});

		it("Charlie should not able to change expired vote.", async () => {
			await seed.connect(owner).transfer(bob.address, FILLER_STAKE);
			await seed.connect(bob).approve(await gardenStaker.getAddress(), FILLER_STAKE);
			await gardenStaker.connect(bob).register();

			await expect(
				gardenStaker.connect(charlie).changeVote(stakeId1, bob.address)
			).to.be.revertedWith("DelegateManager: stake expired");
		});

		it("Charlie should able to renew his stake.", async () => {
			await mine((await ethers.provider.getBlockNumber()) + 1 * 7200);

			await gardenStaker.connect(charlie).renew(stakeId1, 730 * 7200);
			expect(await gardenStaker.getVotes(alice.address)).to.equal(17);
		});

		it("Charlie should not able to renew unexpired stake.", async () => {
			await expect(
				gardenStaker.connect(charlie).renew(stakeId5, 730 * 7200)
			).to.be.revertedWith("DelegateManager: stake not expired");
		});

		it("Only Charlie should able to renew his stake.", async () => {
			await expect(
				gardenStaker.connect(alice).renew(stakeId1, 730 * 7200)
			).to.be.revertedWith("DelegateManager: incorrect owner");
		});

		it("Charlie should able to change his vote.", async () => {
			await gardenStaker.connect(charlie).changeVote(stakeId3, bob.address);
			expect(await gardenStaker.getVotes(alice.address)).to.equal(14);
			expect(await gardenStaker.getVotes(bob.address)).to.equal(3);
		});

		it("Only Charlie should able to change his vote.", async () => {
			await expect(
				gardenStaker.connect(alice).changeVote(stakeId2, bob.address)
			).to.be.revertedWith("DelegateManager: stake owner mismatch");
		});

		it("Charlie should able to extend his stake for same multiplier.", async () => {
			const expiry = (await gardenStaker.stakes(stakeId3)).expiry;

			await gardenStaker.connect(charlie).extend(stakeId3, 180 * 7200);

			const newExpiry = (await gardenStaker.stakes(stakeId3)).expiry;
			expect(newExpiry).to.equal(expiry + BigInt(180 * 7200));
		});

		it("Charlie should able to extend his stake for more multiplier.", async () => {
			const expiry = (await gardenStaker.stakes(stakeId3)).expiry;

			await gardenStaker.connect(charlie).extend(stakeId3, ethers.MaxUint256);

			const newExpiry = (await gardenStaker.stakes(stakeId3)).expiry;
			expect(newExpiry).to.equal(ethers.MaxUint256);
		});

		it("Only Charlie should able to extend his stake.", async () => {
			await expect(
				gardenStaker.connect(alice).extend(stakeId3, 730 * 7200)
			).to.be.revertedWith("DelegateManager: caller is not the owner of the stake");
		});

		it("Charlie should nopt able to extend expired stake.", async () => {
			await expect(
				gardenStaker.connect(charlie).extend(stakeId2, 730 * 7200)
			).to.be.revertedWith("DelegateManager: expired stake");
		});
	});

	describe("- Stake - Refund - ", () => {
		it("Charlie should not able to refund before expiry.", async () => {
			await expect(gardenStaker["refund(bytes32)"](stakeId5)).to.be.revertedWith(
				"DelegateManager: stake not expired"
			);
		});

		it("Should not able to refund with invalid stake id.", async () => {
			await expect(
				gardenStaker["refund(bytes32)"](stakeId5.replace("a", "b"))
			).to.be.revertedWith("DelegateManager: stake not found");
		});

		it("Charlie should able to refund after expiry.", async () => {
			const expiry = (await gardenStaker.stakes(stakeId1)).expiry;
			await mine(expiry);

			await gardenStaker["refund(bytes32)"](stakeId1);
			expect(await seed.balanceOf(await charlie.getAddress())).to.equal(
				ethers.parseEther("205800")
			);
		});
	});

	describe("- Stake - Flower Delegate - ", () => {
		it("Charlie should not able to vote without allowance.", async () => {
			await expect(flower.connect(charlie).mint(alice.address)).to.be.revertedWith(
				"ERC20: insufficient allowance"
			);
		});

		it("Charlie should not able to vote without balance.", async () => {
			await seed
				.connect(charlie)
				.approve(await flower.getAddress(), DELEGATE_STAKE * BigInt(10));

			await seed
				.connect(charlie)
				.transfer(owner.address, await seed.balanceOf(charlie.address));

			await expect(flower.connect(charlie).mint(alice.address)).to.be.revertedWith(
				"ERC20: transfer amount exceeds balance"
			);
		});

		it("Charlie should able to vote(1:7) for Alice.", async () => {
			await seed.connect(owner).transfer(charlie.address, DELEGATE_STAKE * BigInt(10));
			await seed
				.connect(charlie)
				.approve(await gardenStaker.getAddress(), DELEGATE_STAKE * BigInt(10));

			stakeId4 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[
					await flower.getAddress(),
					await gardenStaker.delegateNonce(await flower.getAddress()),
				]
			);

			await flower.connect(charlie).mint(alice.address);

			expect(await gardenStaker.getVotes(alice.address)).to.equal(77);
		});

		it("Only Charlie should able to change his vote.", async () => {
			await expect(
				flower.connect(alice).changeVote(stakeId4, alice.address)
			).to.be.revertedWith("Flower: incorrect owner");
		});

		it("Charlie should able to change his vote.", async () => {
			await flower.connect(charlie).changeVote(stakeId4, bob.address);

			expect(await gardenStaker.getVotes(alice.address)).to.equal(7);
			expect(await gardenStaker.getVotes(bob.address)).to.equal(77);
		});
	});
});
