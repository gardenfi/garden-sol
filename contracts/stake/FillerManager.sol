// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./BaseStaker.sol";

/**
 * @title FillerManager
 * @dev A contract that manages the registration, deregistration, fee update, and refund of fillers.
 * Fillers can register, update their fee, and deregister themselves. The contract holds the staked tokens
 * during the registration period and refunds them to the fillers after a cooldown period.
 */
abstract contract FillerManager is BaseStaker {
    using SafeERC20 for IERC20;

    uint16 constant MAX_Fee_IN_BIPS = 10_000;

    event FillerRegistered(address indexed filler);
    event FillerFeeUpdated(address indexed filler, uint256 fee);
    event FillerDeregistered(address indexed filler, uint256 deregisteredAt);
    event FillerRefunded(address indexed filler);

    /**
     * @notice Registers a filler by transferring the `FILLER_STAKE` amount of tokens to the contract.
     * Only non-registered fillers can call this function.
     * Emits a FillerRegistered event upon successful registration.
     * @dev
     * - Transfers the FILLER_STAKE amount of tokens from the caller to the contract.
     * - Sets the stake amount of the caller to FILLER_STAKE.
     * - Grants the FILLER role to the caller.
     */
    function register() external {
        require(fillers[_msgSender()].stake == 0, "FillerManager: already registered");

        fillers[_msgSender()].stake = FILLER_STAKE;

        _grantRole(FILLER, _msgSender());

        SEED.safeTransferFrom(_msgSender(), address(this), FILLER_STAKE);

        emit FillerRegistered(_msgSender());
    }

    /**
     * @notice Deregisters a filler by revoking the FILLER role from the caller.
     * @dev sets the `deregisteredAt` timestamp to the current block number.
     * Only fillers with the FILLER role can call this function.
     * Emits a FillerDeregistered event with the filler's address and the current block number.
     */
    function deregister() external onlyRole(FILLER) {
        fillers[_msgSender()].deregisteredAt = block.number;

        _revokeRole(FILLER, _msgSender());

        emit FillerDeregistered(_msgSender(), block.number);
    }

    /**
     * @notice Refunds the staked tokens to a registered filler after the cooldown period has passed.
     * @dev Only fillers who have deregistered can call this function.
     *      - Transfers the FILLER_STAKE amount of tokens from the contract to the filler's address.
     *      - Deletes the filler's registration information from the fillers mapping.
     *      - Emits a FillerRefunded event with the filler's address upon successful refund.
     * @param filler_ The address of the filler to refund the tokens to.
     */
    function refund(address filler_) external {
        Filler storage filler = fillers[filler_];

        require(filler.deregisteredAt != 0, "FillerManager: not deregistered");
        require(filler.deregisteredAt + FILLER_COOL_DOWN < block.number, "FillerManager: cooldown not passed");

        fillers[filler_].feeInBips = 0;
        fillers[filler_].stake = 0;
        fillers[filler_].deregisteredAt = 0;

        SEED.safeTransfer(filler_, FILLER_STAKE);

        emit FillerRefunded(filler_);
    }

    /**
     * @notice Updates the fee for a registered filler.
     * @dev Only fillers with the FILLER role can call this function.
     * @param newFee The new fee in basis points (bips) to be set for the filler.
     *              - Must be less than `MAX_Fee_IN_BIPS`.
     */
    function updateFee(uint16 newFee) external onlyRole(FILLER) {
        require(newFee < MAX_Fee_IN_BIPS, "FillerManager: fee too high");

        fillers[_msgSender()].feeInBips = newFee;

        emit FillerFeeUpdated(_msgSender(), fillers[_msgSender()].feeInBips);
    }
}
