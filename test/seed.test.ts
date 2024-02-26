import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import type { SEED } from "../typechain-types";

describe("--- SEED - ERC20 ---", function () {
	const SEED_ADDRESS = "0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED";
	const TOTAL_SUPPLY = 147_000_000;
	const DEPLOYER_ADDRESS = "0x3E4BB2Cfae2ac6c15BF52884Dd14C2e4dE8f77d5";

	let owner: HardhatEthersSigner;
	let deployer: HardhatEthersSigner;

	let seed: SEED;

	before(async () => {
		[owner] = await ethers.getSigners();

		deployer = await ethers.getImpersonatedSigner(DEPLOYER_ADDRESS);
		await owner.sendTransaction({
			to: DEPLOYER_ADDRESS,
			value: ethers.parseEther("1"),
		});

		const SEED = await ethers.getContractFactory("SEED");
		seed = (await SEED.connect(deployer).deploy()) as SEED;
		seed.waitForDeployment();
	});

	it("Should have SEED as name.", async () => {
		expect(await seed.name()).to.equal("SEED");
	});

	it("Should have SEED as symbol.", async () => {
		expect(await seed.symbol()).to.equal("SEED");
	});

	it("Should have 18 decimals.", async () => {
		expect(await seed.decimals()).to.equal(18);
	});

	it("Should have 147 millions total supply.", async () => {
		expect(await seed.totalSupply()).to.equal(
			ethers.parseUnits(TOTAL_SUPPLY.toString(), 18)
		);
	});

	it("Should deployed on deterministic address.", async () => {
		expect(await seed.getAddress()).to.equal(SEED_ADDRESS);
	});

	it("Should mint 147 millions to deployer.", async () => {
		expect(await seed.balanceOf(DEPLOYER_ADDRESS)).to.equal(
			ethers.parseEther(TOTAL_SUPPLY.toString())
		);
	});
});
