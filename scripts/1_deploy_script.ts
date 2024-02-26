import { ethers } from "hardhat";
import { lzEndpointsMainnet, sleep } from "./helpers";
import "@nomicfoundation/hardhat-verify";
import hre from "hardhat";

// deploys NativOftV2 and verifies it

async function main() {
  const nativeChain = "ethereum";
  const NativOFTV2 = await ethers.deployContract("NativeSEED", [
    lzEndpointsMainnet[nativeChain],
  ]);

  await NativOFTV2.waitForDeployment();

  console.log("NativOFTV2 deployed to: ", NativOFTV2.target);
  console.log("Sleeping for 25 seconds...");
  await sleep(25000); // sleep for 25 seconds
  await hre.run("verify:verify", {
    address: NativOFTV2.target,
    constructorArguments: [lzEndpointsMainnet[nativeChain]],
    contract: "contracts/SEED.sol:NativeSEED",
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
