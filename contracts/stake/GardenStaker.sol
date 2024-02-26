// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./DelegateManager.sol";
import "./FillerManager.sol";

/**
 * @title GardenStaker
 * @author Garden Finance
 * @dev GardenStaker implements DelegateManager and FillerManager.
 * It allows users to stake tokens as delegates or fillers in a garden.
 * @dev The contract is initialized with
 *      - seed: address of base Stake token
 *      - delegateStake: Amount of Seed to stake as a delegate
 *      - fillerStake: Amount of Seed to stake as a filler
 *      - fillerCooldown: Cooldown period for fillers to be refund after deregistration.
 * The contract inherits from BaseStaker and initializes State with the provided parameters.
 */
contract GardenStaker is DelegateManager, FillerManager {
    constructor(
        address seed,
        uint256 delegateStake,
        uint256 fillerStake,
        uint256 fillerCooldown
    ) BaseStaker(seed, delegateStake, fillerStake, fillerCooldown) {}
}
