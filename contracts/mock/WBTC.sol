// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
    constructor() ERC20("Wrapped Bitcoin", "WBTC") {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function selfMint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
