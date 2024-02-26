// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
	uint8 private constant _decimals = 8;

	constructor() ERC20("Wrapped BTC", "WBTC") {
		_mint(msg.sender, 147_000_000 * 10 ** decimals());
	}

	function decimals() public view virtual override returns (uint8) {
		return _decimals;
	}
}
