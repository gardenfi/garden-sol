// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IGardenStaker {
    function vote(address filler, uint256 units, uint256 lockBlocks) external returns (bytes32);

    function changeVote(bytes32 stakeID, address newFiller) external;

    function DELEGATE_STAKE() external returns (uint256);

    function SEED() external returns (IERC20);
}

/**
 * @title Flower
 * @author Garden Finance
 * @dev This contract represents a Flower ERC721 token.
 * It allows users to mint flowers by staking a ` 10 * DELEGATE_STAKE` of tokens and vote for a filler.
 * Users can also change their vote by providing the [stake ID / Nft Token ID] and the new filler address.
 */
contract Flower is ERC721 {
    using SafeERC20 for IERC20;

    IGardenStaker immutable gardenStaker;

    uint256 private constant MAX_UINT_256 = type(uint256).max;

    constructor(string memory name, string memory symbol, address gardenStaker_) ERC721(name, symbol) {
        require(gardenStaker_ != address(0), "Flower: gardenStaker is zero address");

        gardenStaker = IGardenStaker(gardenStaker_);
    }

    /**
     * @notice Mint a Flower ERC721 token by staking a `DELEGATE_STAKE` of tokens and voting for a filler.
     * @dev This function transfers the required stake amount of tokens from the caller to the contract,
     * approves the contract to spend the tokens, and calls the `vote` function of the `gardenStaker` contract
     * to vote for the specified filler. The stake ID is then used to mint a new Flower ERC721 token for the caller.
     * `stakeID` generated from `gardenStaker` is used as the token ID.
     * @param filler The address of the filler to vote for.
     */
    function mint(address filler) external {
        uint256 stakeAmount = 10 * gardenStaker.DELEGATE_STAKE();

        gardenStaker.SEED().safeTransferFrom(_msgSender(), address(this), stakeAmount);
        gardenStaker.SEED().safeApprove(address(gardenStaker), stakeAmount);

        bytes32 stakeID = gardenStaker.vote(filler, 10, MAX_UINT_256);

        _safeMint(_msgSender(), uint256(stakeID));
    }

    /**
     * @notice Change the vote for a Flower ERC721 token.
     * @dev This function allows the token owner to change their vote by providing the stake ID and the new filler address.
     * @param stakeID The stake ID of the Flower ERC721 token.
     * @param newFiller The new address of the filler to vote for.
     */
    function changeVote(bytes32 stakeID, address newFiller) external {
        require(_ownerOf(uint256(stakeID)) == _msgSender(), "Flower: incorrect owner");

        gardenStaker.changeVote(stakeID, newFiller);
    }
}
