import { ethers } from "hardhat";
import { sleep } from "./helpers";
import hre from "hardhat";

async function main() {
//   const seed = await ethers.deployContract("SEED");

//   await seed.waitForDeployment();

//   console.log(`SEED token deployed at ${seed.target}`);

//   await sleep(15000); // sleep for 15 seconds

  await hre.run("verify:verify", {
    address: "0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED",
    contract: "contracts/SEED.sol:SEED",
  });

  console.log("Contract Verified");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
