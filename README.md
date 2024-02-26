## Solidity Smart Contracts for Garden Finance

**Introduction**

This repository contains the solidity smart contracts for the Garden Finance project. These contracts are designed to facilitate payment channels, HTLCs, and staking functionalities within the ethereum ecosystem.

**Smart Contract Breakdown**

The contracts are organized into the following directories, each containing related functionalities:

- **Contracts:**
    - [**Flower.sol:**](./contracts/Flower.sol) This contract Follows ERC721 NFT standard and is responsible for minting Flower NFTs.
    - [**SEED.sol:**](./contracts/SEED.sol) This contract follows ERC20 standard and is the base token used across all garden decentralized applications.
- [**fee:**](./contracts/fee/README.md)
    - [**GardenFEEAccount.sol:**](./contracts/fee/GardenFEEAccount.sol) This contract is used to manage the funds of a channel between a funder and a recipient using `Payment Channel` Architecture along with `HTLC`.
    - [**GardenFEEAccountFactory.sol:**](./contracts/fee/GardenFEEAccountFactory.sol) This contract is used to deploy and manage the fee channels per signer.
- [**htlc:**](./contracts/htlc/Readme.md)
    - [**GardenHTLC.sol:**](./contracts/htlc/GardenHTLC.sol) This contract is used to settle an order which is committed offchain.
- [**stake:**](./contracts/stake/README.md)
    - [**BaseStaker.sol:**](./contracts/stake/BaseStaker.sol) Serves as Base Class for GardenStaker, Contains all State for FillerManager and DelegateManager.
    - [**DelegateManager.sol:**](./contracts/stake/DelegateManager.sol) This contract is responsible for managing the delegation of voting power to fillers.
    - [**FillerManager.sol:**](./contracts/stake/FillerManager.sol) This contract is responsible for managing the fillers.
    - [**GardenStaker.sol:**](./contracts/stake/GardenStaker.sol) Acts as Entry point for staking functionalities.

## Prerequisites
- [Hardhat](https://hardhat.org/)
- [Solidity](https://docs.soliditylang.org/)
- Node >= 20
- Slither [https://github.com/crytic/slither]
- Uses TypeChain

**Getting Started**

For developers familiar with Hardhat and Solidity, follow these steps to set up the development environment:

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. Compile the contracts
   ```bash
   npx hardhat compile
   ```

3. **Run the tests:**
   ```bash
   npx hardhat test
   ```

## License
This project is licensed under the MIT License.