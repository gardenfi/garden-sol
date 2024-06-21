import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

export default buildModule("FullDeploy", (m) => {
	const FILLER_STAKE = ethers.parseEther("210000");
	const FILLER_COOL_DOWN = 180 * 7200;
	const DELEGATE_STAKE = ethers.parseEther("2100");

	const deployer = m.getAccount(0);
	const feeManager = m.getAccount(1);

	const WBTC = m.contract("WBTC", []);
	const SEED = m.contract("SEED", [], { from: deployer });

	const GardenStaker = m.contract(
		"GardenStaker",
		[SEED, DELEGATE_STAKE, FILLER_STAKE, FILLER_COOL_DOWN],
		{ from: deployer, after: [SEED] }
	);

	const Flower = m.contract("Flower", ["Garden Pass", "GARDEN", GardenStaker], {
		from: deployer,
		after: [SEED, GardenStaker],
	});

	const HTLC = m.contract("HTLC", [WBTC, "HTLC", "1"], { from: deployer, after: [WBTC] });

	const FeeAccountFactory = m.contract(
		"FeeAccountFactory",
		[SEED, feeManager, "FeeAccount", "1"],
		{
			from: deployer,
			after: [SEED],
		}
	);

	return { SEED };
});
