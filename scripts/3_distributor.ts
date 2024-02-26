import { ethers } from "hardhat";
import { sleep } from "./helpers";
import hre from "hardhat";

async function main() {
//   const seed = await ethers.deployContract("SeasonRewardDistributor", ["0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED", "0x7f07240F753af90288d55908Eb24f329c42E76A6"]);

//   await seed.waitForDeployment();

//   console.log(`SeasonRewardDistributor token deployed at ${seed.target}`);

//   await sleep(15000); // sleep for 15 seconds

  await hre.run("verify:verify", {
    address: "0x90CDa43bE19D12E63a9ED2FCcBbA8134374d4a6B",
    constructorArguments: ["0x5eed99d066a8CaF10f3E4327c1b3D8b673485eED", "0x7f07240F753af90288d55908Eb24f329c42E76A6"],
    contract: "contracts/Distributor.sol:SeasonRewardDistributor",
  });

  console.log("Contract Verified");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
