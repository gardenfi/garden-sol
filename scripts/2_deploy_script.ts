import { ethers } from "hardhat";
import { lzEndpointsTestnet, sleep } from "./helpers";
import hre from "hardhat";

async function main() {
  const derivativeChain = "arbitrum";

  const OFTV2 = await ethers.deployContract("SEED", [
    lzEndpointsTestnet[derivativeChain],
  ]);

  await OFTV2.waitForDeployment();

  console.log("OFTV2 deployed to: ", OFTV2.target);
  await sleep(15000); // sleep for 15 seconds
  await hre.run("verify:verify", {
    address: OFTV2.target,
    constructorArguments: [lzEndpointsTestnet[derivativeChain]],
    contract: "contracts/SEED.sol:SEED",
  });

  console.log("Contract Verified");
   // TODO: setTrustedRemoteAddress
   // TODO: setMinDstGas
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
