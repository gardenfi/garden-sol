# Garden Decentralized Exchange (GardenDEX) Smart Contract

## Description

GardenDEX is a decentralized exchange for ERC20 tokens, integrating off-chain order creation and on-chain settlement to enhance efficiency and security. This smart contract is crafted with Solidity `0.8.18` and leverages OpenZeppelin's SafeERC20, ECDSA, and EIP712 utilities for secure and standardized interactions.

## Table of Contents

- [Key Features](#key-features)
- [Contract Structure](#contract-structure)
- [Functionality](#functionality)
- [License](#license)

## Key Features

- **Off-chain Order Creation**: Utilizes EIP-712 for creating orders off-chain.
- **On-chain Settlement**: Employs ECDSA for signing and verifying transactions on-chai.s.
- **ERC20 Token Support**: Compatible with any ERC20 token, providing flexibility for trading a wide range of assets.

## Contract Structure

### Order Struct

The `Order` struct encapsulates the essential details of a trade:

- `creator`: The address initiating the trade.
- `filler`: The address fulfilling the trade.
- `fromToken`: The token being sold.
- `toToken`: The token being bought.
- `fromAmount`: The amount of `fromToken` being sold.
- `toAmount`: The amount of `toToken` being bought.
- `expiry`: The block number at which the order expires.

### Settled Orders

A mapping `settled` tracks the status of orders, with `true` indicating that an order has been settled. Settled Orders can not be settled again.

## Functionality

### Settle

The `settle` function enables the settlement of a pre-signed order. It verifies the order's validity, including its settlement status, expiration, and signatures, before executing the trade.

### Verify

The `verify` function checks the validity of the creator and filler signatures for a given order. It uses EIP-712 to hash the order details and recovers the signer's address from the signature, ensuring the authenticity of the trade.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
