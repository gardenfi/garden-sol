import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LightDeploy", (m) => {
	const deployer = m.getAccount(0);

	const WBTC = m.contract("WBTC", []);

	const HTLC = m.contract("HTLC", [WBTC, "HTLC", "1"], { from: deployer, after: [WBTC] });

	return { WBTC, HTLC };
});
