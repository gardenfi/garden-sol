import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import type { SEED, GardenStaker } from "../typechain-types";

describe("--- CUSTOM TEST ---", () => {
	const DELEGATE_STAKE = ethers.parseEther("2100");
	const FILLER_STAKE = ethers.parseEther("210000");
	const FILLER_COOL_DOWN = 2 * 7200;

	let owner: HardhatEthersSigner;
	let alice: HardhatEthersSigner;
	let bob: HardhatEthersSigner;
	let carol: HardhatEthersSigner;
	let dave: HardhatEthersSigner;

	let seed: SEED;
	let gardenStaker: GardenStaker;

	let stakeId1: string;
	let stakeId2: string;
	let stakeId3: string;
	let stakeId4: string;
	let stakeId5: string;
	let stakeId6: string;
	let stakeId7: string;
	let stakeId8: string;

	before(async () => {
		[owner, alice, bob, carol, dave] = await ethers.getSigners();

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
	});

	describe("- Pre-Conditons -", () => {
		it("All users and owner should have diffrent addresses.", async () => {
			expect(await owner.getAddress()).to.not.equal(await alice.getAddress());
			expect(await alice.getAddress()).to.not.equal(await bob.getAddress());
			expect(await bob.getAddress()).to.not.equal(await carol.getAddress());
			expect(await carol.getAddress()).to.not.equal(await dave.getAddress());
			expect(await dave.getAddress()).to.not.equal(await owner.getAddress());
		});

		it("All users should have 0 SEED balance.", async () => {
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await carol.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await dave.getAddress())).to.equal(0);
		});

		it("Staker should have 0 SEED balance.", async () => {
			expect(await seed.balanceOf(await gardenStaker.getAddress())).to.equal(0);
		});

		it("Owner should have 147M SEED balance.", async () => {
			expect(await seed.balanceOf(await owner.getAddress())).to.equal(
				ethers.parseEther("147000000")
			);
		});

		it("Staker should have correct initial state.", async () => {
			expect(await gardenStaker.SEED()).to.equal(await seed.getAddress());
			expect(await gardenStaker.DELEGATE_STAKE()).to.equal(DELEGATE_STAKE);
			expect(await gardenStaker.FILLER_STAKE()).to.equal(FILLER_STAKE);
			expect(await gardenStaker.FILLER_COOL_DOWN()).to.equal(FILLER_COOL_DOWN);
		});
	});

	describe("- Enumarable Set -", () => {
		it("Alice and Bob should able to register as filler.", async () => {
			await seed.connect(owner).transfer(await alice.getAddress(), FILLER_STAKE);
			await seed.connect(owner).transfer(await bob.getAddress(), FILLER_STAKE);

			expect(await seed.balanceOf(await alice.getAddress())).to.equal(FILLER_STAKE);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(FILLER_STAKE);

			await seed.connect(alice).approve(await gardenStaker.getAddress(), FILLER_STAKE);
			await seed.connect(bob).approve(await gardenStaker.getAddress(), FILLER_STAKE);

			expect(
				await seed.allowance(await alice.getAddress(), await gardenStaker.getAddress())
			).to.equal(FILLER_STAKE);
			expect(
				await seed.allowance(await bob.getAddress(), await gardenStaker.getAddress())
			).to.equal(FILLER_STAKE);

			await gardenStaker.connect(alice).register();
			await gardenStaker.connect(bob).register();

			expect(
				await gardenStaker.hasRole(
					await gardenStaker.FILLER(),
					await alice.getAddress()
				)
			).to.equal(true);
			expect(
				await gardenStaker.hasRole(await gardenStaker.FILLER(), await bob.getAddress())
			).to.equal(true);
			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				0,
				FILLER_STAKE,
				0,
				[],
			]);
			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				0,
				FILLER_STAKE,
				0,
				[],
			]);
			expect(await seed.balanceOf(await gardenStaker.getAddress())).to.equal(
				FILLER_STAKE * BigInt(2)
			);
			expect(await seed.balanceOf(await alice.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
		});

		it("Alice and Bob should able to update their rewards.", async () => {
			await gardenStaker.connect(alice).updateFee(1000);
			await gardenStaker.connect(bob).updateFee(3000);

			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				1000,
				FILLER_STAKE,
				0,
				[],
			]);
			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				3000,
				FILLER_STAKE,
				0,
				[],
			]);
		});

		it("Bob, Carol and Dave should able to vote Alice as delegate.", async () => {
			await seed.connect(owner).transfer(await bob.getAddress(), DELEGATE_STAKE);
			await seed.connect(owner).transfer(await carol.getAddress(), DELEGATE_STAKE);
			await seed.connect(owner).transfer(await dave.getAddress(), DELEGATE_STAKE);

			expect(await seed.balanceOf(await bob.getAddress())).to.equal(DELEGATE_STAKE);
			expect(await seed.balanceOf(await carol.getAddress())).to.equal(DELEGATE_STAKE);
			expect(await seed.balanceOf(await dave.getAddress())).to.equal(DELEGATE_STAKE);

			await seed.connect(bob).approve(await gardenStaker.getAddress(), DELEGATE_STAKE);
			await seed.connect(carol).approve(await gardenStaker.getAddress(), DELEGATE_STAKE);
			await seed.connect(dave).approve(await gardenStaker.getAddress(), DELEGATE_STAKE);

			expect(
				await seed.allowance(await bob.getAddress(), await gardenStaker.getAddress())
			).to.equal(DELEGATE_STAKE);
			expect(
				await seed.allowance(await carol.getAddress(), await gardenStaker.getAddress())
			).to.equal(DELEGATE_STAKE);
			expect(
				await seed.allowance(await dave.getAddress(), await gardenStaker.getAddress())
			).to.equal(DELEGATE_STAKE);

			stakeId1 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[
					await bob.getAddress(),
					await gardenStaker.delegateNonce(await bob.getAddress()),
				]
			);
			stakeId2 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[
					await carol.getAddress(),
					await gardenStaker.delegateNonce(await carol.getAddress()),
				]
			);
			stakeId3 = ethers.solidityPackedKeccak256(
				["address", "uint256"],
				[
					await dave.getAddress(),
					await gardenStaker.delegateNonce(await dave.getAddress()),
				]
			);

			await gardenStaker
				.connect(bob)
				.vote(await alice.getAddress(), 1, ethers.MaxUint256);
			await gardenStaker.connect(carol).vote(await alice.getAddress(), 1, 365 * 7200);
			await gardenStaker.connect(dave).vote(await alice.getAddress(), 1, 1460 * 7200);

			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				1000,
				FILLER_STAKE,
				0,
				[stakeId1, stakeId2, stakeId3],
			]);
			expect(await seed.balanceOf(await gardenStaker.getAddress())).to.equal(
				FILLER_STAKE * BigInt(2) + DELEGATE_STAKE * BigInt(3)
			);
			expect(await seed.balanceOf(await bob.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await carol.getAddress())).to.equal(0);
			expect(await seed.balanceOf(await dave.getAddress())).to.equal(0);
		});

		it("Bob should able to change his vote.", async () => {
			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				1000,
				FILLER_STAKE,
				0,
				[stakeId1, stakeId2, stakeId3],
			]);
			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				3000,
				FILLER_STAKE,
				0,
				[],
			]);

			await gardenStaker.connect(bob).changeVote(stakeId1, await bob.getAddress());

			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				1000,
				FILLER_STAKE,
				0,
				[stakeId3, stakeId2],
			]);
			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				3000,
				FILLER_STAKE,
				0,
				[stakeId1],
			]);
		});

		it("Alice should able to deregeister and refund as filler.", async () => {
			const deregisterBlockNumber = (await ethers.provider.getBlockNumber()) + 1;

			await gardenStaker.connect(alice).deregister();

			expect(
				await gardenStaker.hasRole(
					await gardenStaker.FILLER(),
					await alice.getAddress()
				)
			).to.equal(false);
			expect(await gardenStaker.getFiller(await alice.getAddress())).to.deep.equal([
				1000,
				FILLER_STAKE,
				deregisterBlockNumber,
				[stakeId3, stakeId2],
			]);

			await mine(2 * 7200);

			await gardenStaker.connect(alice)["refund(address)"](await alice.getAddress());

			expect(await seed.balanceOf(await alice.getAddress())).to.equal(FILLER_STAKE);
			expect(await seed.balanceOf(await gardenStaker.getAddress())).to.equal(
				FILLER_STAKE + DELEGATE_STAKE * BigInt(3)
			);
		});

		it("Carol should able to change her vote.", async () => {
			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				3000,
				FILLER_STAKE,
				0,
				[stakeId1],
			]);

			await gardenStaker.connect(carol).changeVote(stakeId2, await bob.getAddress());

			expect(await gardenStaker.getFiller(await bob.getAddress())).to.deep.equal([
				3000,
				FILLER_STAKE,
				0,
				[stakeId1, stakeId2],
			]);
		});
	});
});
