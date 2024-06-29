import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";
import "@nomicfoundation/hardhat-verify";
import "@solarity/hardhat-gobind";

const config: HardhatUserConfig = {
	solidity: "0.8.18",
	networks: {
		hardhat: {
			chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 31337,
		},
		docker: {
			url: "http://0.0.0.0:8545",
			chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 31337,
		},
	},
	etherscan: {
		apiKey: {
			docker: "garden",
		},
		customChains: [
			{
				network: "docker",
				chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 31337,
				urls: {
					apiURL: process.env.BLOCKSCOUT_URL
						? process.env.BLOCKSCOUT_URL + "/api"
						: "http://localhost",
					browserURL: process.env.BLOCKSCOUT_URL
						? process.env.BLOCKSCOUT_URL
						: "http://localhost",
				},
			},
		],
	},
	gobind: {
		outdir: "./go/bindings",
		deployable: false,
		runOnCompile: true,
		verbose: false,
		onlyFiles: [],
		skipFiles: [],
	  },
	
};

export default config;
