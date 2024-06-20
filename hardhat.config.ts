import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";

const config: HardhatUserConfig = {
	solidity: "0.8.18",
	networks: {
		localhost: {
			url: "http://127.0.0.1:8545/",
		},
	},
};

export default config;
