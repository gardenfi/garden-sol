// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SEED
/// @author Garden Finance
/// @notice SEED is the native token of Garden Finance and is used for governance and staking.
/// @dev SEED is an ERC20 token with a fixed supply of 147,000,000 and 18 decimals.
contract SEED is ERC20 {
    constructor() ERC20("SEED", "SEED") {
        _mint(_msgSender(), 147_000_000 * (10 ** decimals()));
    }
}
