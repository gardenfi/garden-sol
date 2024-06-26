# Garden Finance - Blockchain Assets

<div align="center">
    <img src="./.github/assets/garden_horizontal_white.svg" alt="GitKeeper logo" width="256px">
    <p>the first instant liquidity
layer for bitcoin</p>
</div>

---

[Garden](https://garden.finance) supercharges your Bitcoin to capture DeFi value across any chain, with blazing speeds and deep liquidity.

## About Repository

This repository contains the Smart Contracts and Bitcoin scripts for Garden Finance. The Garden blockchain assets are building blocks for the Garden ecosystem, enabling **cross-chain atomic swaps**, **SEED staking** and **off-chain payment channels**. All the Smart Contracts are written in Solidity and Bitcoin Scripts are written in TypeScript. The Garden blockchain assets are organized into the following directories with logical separation as per their functionality:

`bitcoin/`: Bitcoin Scripts for Atomic Swaps.  
`contracts/`: Smart Contracts for SEED token and Garden NFT.  
`contracts/stake/`: Smart Contracts for SEED staking.  
`contracts/htlc/`: Smart Contracts for Atomic Swaps.  
`contracts/fee/`: Smart Contracts for off-chain Payment Channels.

Audits are an important part of the development process for Garden. We have engaged with several security firms to audit the Garden contracts and here are the reports:

-   [OtterSec](https://github.com/catalogfi/audits/blob/main/OtterSec.pdf)
-   [Trail of Bits](https://github.com/catalogfi/audits/blob/main/TrailOfBits.pdf)

## Usage

### Prerequisites

There are a few things you need to have installed before you can setup Garden locally:

-   [Node.js](https://nodejs.org/en/download/)
-   [Yarn](https://yarnpkg.com/getting-started/install/)
-   [HardHat](https://hardhat.org/hardhat-runner/docs/getting-started/)
-   [Docker](https://docs.docker.com/get-docker/) (optional)

Now that you have all the prerequisites installed, you can setup Garden locally. So let's get started!

### Setup

#### Hardhat Network

```bash
# Clone the repository
git clone https://github.com/gardenfi/garden-sol.git
cd garden-sol

# Install dependencies
yarn install

# Start the Hardhat network in another terminal
npx hardhat node

# Deploy the contracts
npx hardhat ignition deploy ignition/modules/fullDeploy.ts --network hardhat --reset
```

#### Docker

```bash
# Clone the repository
git clone https://github.com/gardenfi/garden-sol.git
cd garden-sol

# Build the Docker image
docker build -t garden-sol .

# Run the Docker container
docker run -it garden-sol
```

### Testing

```bash
# Clone the repository
git clone https://github.com/gardenfi/garden-sol.git
cd garden-sol

# Install dependencies
yarn install

# Run the tests
npx hardhat test

# Run the coverage (optional)
npx hardhat coverage
```

## Contributing

If you would like to contribute to Garden, please take a look at our [Contributing Guidelines](./CONTRIBUTING.md).

## Security

If you discover a security vulnerability within Garden, please send an e-mail to [security@garden.finance](mailto:security@garden.finance). We take these issues very seriously and will respond promptly.

You may view our full security and bug bounty policy [here](https://docs.garden.finance/home/security/bug-bounty).

## License

This project is licensed under the [MIT License](./LICENSE).
