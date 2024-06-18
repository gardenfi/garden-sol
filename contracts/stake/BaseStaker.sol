// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title BaseStaker
 * @dev This contract serves as the base contract for staking functionality.
 * It provides structs and mappings [STATE] to manage stakes and fillers.
 * It also includes a function to retrieve filler information.
 */
abstract contract BaseStaker is AccessControl {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct Stake {
        address owner;
        uint256 stake;
        uint256 units;
        uint256 votes;
        address filler;
        uint256 expiry;
    }

    struct Filler {
        uint16 feeInBips;
        uint256 stake;
        uint256 deregisteredAt;
        EnumerableSet.Bytes32Set delegateStakeIDs;
    }

    IERC20 public immutable SEED;

    uint256 public immutable DELEGATE_STAKE;

    uint256 public immutable FILLER_STAKE;
    uint256 public immutable FILLER_COOL_DOWN;
    bytes32 public constant FILLER = keccak256("FILLER");

    mapping(bytes32 => Stake) public stakes;
    mapping(address => uint256) public delegateNonce;

    mapping(address => Filler) internal fillers;

    constructor(address seed, uint256 delegateStake, uint256 fillerStake, uint256 fillerCooldown) {
        require(seed != address(0), "BaseStaker: seed is zero address");

        SEED = IERC20(seed);
        DELEGATE_STAKE = delegateStake;
        FILLER_STAKE = fillerStake;
        FILLER_COOL_DOWN = fillerCooldown;
    }

    /**
     * @dev Retrieves information about a filler.
     * @param filler The address of the filler.
     * @return feeInBips The fee in basis points set by the filler.
     * @return stake The total stake amount of the filler.
     * @return deregisteredAt The timestamp when the filler was deregistered.
     * @return delegateStakeIDs An array of delegate stake IDs associated with the filler.
     */
    function getFiller(
        address filler
    )
        external
        view
        returns (uint16 feeInBips, uint256 stake, uint256 deregisteredAt, bytes32[] memory delegateStakeIDs)
    {
        Filler storage f = fillers[filler];
        return (f.feeInBips, f.stake, f.deregisteredAt, f.delegateStakeIDs.values());
    }
}
