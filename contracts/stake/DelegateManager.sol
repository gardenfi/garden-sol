// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./BaseStaker.sol";

/**
 * @title DelegateManager
 * @dev This contract manages the delegation of voting power to fillers.
 * It allows users to stake their tokens and delegate their voting power to fillers.
 * Delegated votes can be changed, extended, renewed, or refunded by the stake owner.
 * The contract keeps track of the total votes for each filler address.
 * @notice This contract is abstract and will be inherited by a GardenStaker.
 */
abstract contract DelegateManager is BaseStaker {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    uint256 constant HALF_YEAR = 180 * 7200;
    uint256 constant ONE_YEAR = 365 * 7200;
    uint256 constant TWO_YEARS = 730 * 7200;
    uint256 constant FOUR_YEARS = 1460 * 7200;
    uint256 constant MAX_UINT_256 = type(uint256).max;

    event Voted(bytes32 indexed stakeID, address indexed filler, uint256 votes);
    event VotesChanged(bytes32 indexed stakeID, address indexed oldFiller, address indexed newFiller);

    event Staked(bytes32 indexed stakeID, address indexed owner, uint256 stake, uint256 expiry);
    event StakeExtended(bytes32 indexed stakeID, uint256 newLockBlocks);
    event StakeRenewed(bytes32 indexed stakeID, uint256 newLockBlocks);
    event StakeRefunded(bytes32 indexed stakeID);

    /**
     * @notice Allows a user to stake their tokens and delegate their voting power to a filler.
     * @dev The delegated votes can be changed, extended, renewed, or refunded by the stake owner.
     *      - delegate must approve `uints * DELEGATE_STAKE` amount of tokens to this contract
     * @param filler The address of the filler to delegate the voting power to.
     *          - filler: must be a valid address with `FILLER ROLE`.
     * @param units The number of units to stake.
     * @param lockBlocks The number of blocks to lock the stake for.
     *          - LockBlocks define Vote Power a delegate stake gets based on block period.
     * @return stakeID The ID of the stake.
     */
    function vote(address filler, uint256 units, uint256 lockBlocks) external returns (bytes32 stakeID) {
        _checkRole(FILLER, filler);
        require(units != 0, "DelegateManager: zero unit");

        uint8 multiplier = _calculateVoteMultiplier(lockBlocks);
        uint256 stakeAmount = units * DELEGATE_STAKE;

        stakeID = keccak256(abi.encodePacked(_msgSender(), delegateNonce[_msgSender()]));
        uint256 expiry = multiplier == uint8(7) ? MAX_UINT_256 : block.number + lockBlocks;

        stakes[stakeID] = Stake({
            owner: _msgSender(),
            stake: stakeAmount,
            units: units,
            votes: units * multiplier,
            filler: filler,
            expiry: expiry
        });
        delegateNonce[_msgSender()]++;

        require(
            fillers[stakes[stakeID].filler].delegateStakeIDs.add(stakeID),
            "DelegateManager: stakeID already exists"
        );

        SEED.safeTransferFrom(_msgSender(), address(this), stakeAmount);

        emit Staked(stakeID, stakes[stakeID].owner, stakes[stakeID].stake, stakes[stakeID].expiry);

        emit Voted(stakeID, stakes[stakeID].filler, stakes[stakeID].votes);
    }

    /**
     * @notice Allows the stake owner to change the voting power delegation from one filler to another.
     * @dev The stake owner must be the caller of this function.
     *      The stake must not have expired.
     *      The new filler must have the FILLER role.
     * @param stakeID The ID of the stake to change the vote for.
     * @param newFiller The address of the new filler to delegate the voting power to.
     */
    function changeVote(bytes32 stakeID, address newFiller) external {
        _checkRole(FILLER, newFiller);

        Stake memory stake = stakes[stakeID];
        require(stake.owner == _msgSender(), "DelegateManager: stake owner mismatch");
        require(stake.expiry > block.number, "DelegateManager: stake expired");

        address oldFiller = stake.filler;
        stake.filler = newFiller;
        stakes[stakeID] = stake;

        emit VotesChanged(stakeID, oldFiller, stake.filler);

        require(fillers[oldFiller].delegateStakeIDs.remove(stakeID), "DelegateManager: stakeID not found");
        require(fillers[stake.filler].delegateStakeIDs.add(stakeID), "DelegateManager: stakeID already exists");
    }

    /**
     * @notice Allows the stake owner to refund their staked tokens.
     * @dev The stake must have expired and the stake ID must exist.
     * @param stakeID The ID of the stake to refund.
     */
    function refund(bytes32 stakeID) external {
        Stake memory stake = stakes[stakeID];

        require(stake.expiry < block.number, "DelegateManager: stake not expired");
        require(stake.owner != address(0), "DelegateManager: stake not found");

        require(fillers[stake.filler].delegateStakeIDs.remove(stakeID), "DelegateManager: stakeID not found");

        delete (stakes[stakeID]);

        SEED.safeTransfer(stake.owner, stake.stake);

        emit StakeRefunded(stakeID);
    }

    /**
     * @notice Allows the stake owner to renew their stake by extending the lock duration and updating the voting power.
     * @dev The stake owner must be the caller of this function.
     *      The stake must have expired.
     * @param stakeID The ID of the stake to renew.
     * @param newLockBlocks The new number of blocks to lock the stake for.
     */
    function renew(bytes32 stakeID, uint256 newLockBlocks) external {
        Stake memory stake = stakes[stakeID];

        require(stake.owner == _msgSender(), "DelegateManager: incorrect owner");
        require(stake.expiry < block.number, "DelegateManager: stake not expired");

        uint8 multiplier = _calculateVoteMultiplier(newLockBlocks);
        stake.expiry = multiplier == uint8(7) ? MAX_UINT_256 : block.number + newLockBlocks;
        stake.votes = multiplier * stake.units;

        stakes[stakeID] = stake;

        emit StakeRenewed(stakeID, newLockBlocks);
    }

    /**
     * @notice Allows the stake owner to extend the lock duration and update the voting power of a stake.
     * @dev The caller must be the owner of the stake.
     *      The stake must not have expired.
     *      Case: delegate can call this function when his/her stake is about to expire,
     *            to newLockBlocks lesser than previous expiry and still enjoy the same voting power.
     * @param stakeID The ID of the stake to extend.
     * @param newLockBlocks The new number of blocks to lock the stake for.
     */
    function extend(bytes32 stakeID, uint256 newLockBlocks) external {
        Stake memory stake = stakes[stakeID];

        require(stake.owner == _msgSender(), "DelegateManager: caller is not the owner of the stake");
        require(stake.expiry > block.number, "DelegateManager: expired stake");

        uint8 multiplier = _calculateVoteMultiplier(newLockBlocks);
        if (multiplier > stake.votes / stake.units) {
            stake.votes = multiplier * stake.units;
        }
        stake.expiry = multiplier == uint8(7) ? MAX_UINT_256 : stake.expiry + newLockBlocks;

        stakes[stakeID] = stake;

        emit StakeExtended(stakeID, newLockBlocks);
    }

    /**
     * @notice Retrieves the total number of votes delegated to a specific filler address.
     * @dev Vote Calculation iterates through delegateStakeIDs of filler and accounts only those stakes that have not expired.
     * @param filler The address of the filler to retrieve the vote count for.
     * @return voteCount The total number of votes delegated to the specified filler address.
     */
    function getVotes(address filler) external view returns (uint256 voteCount) {
        bytes32[] memory delegates = fillers[filler].delegateStakeIDs.values();
        uint256 delegateLength = delegates.length;

        for (uint256 i = 0; i < delegateLength; i++) {
            Stake memory stake = stakes[delegates[i]];
            if (stake.expiry > block.number) {
                voteCount += stake.votes;
            }
        }
    }

    /**
     * @dev Calculates the vote multiplier based on the lock duration in blocks.
     * @param lockBlocks The number of blocks to lock the stake for.
     * @return The vote multiplier corresponding to the lock duration:
     *         - 1 for a lock duration of half a year (HALF_YEAR)
     *         - 2 for a lock duration of one year (ONE_YEAR)
     *         - 3 for a lock duration of two years (TWO_YEARS)
     *         - 4 for a lock duration of four years (FOUR_YEARS)
     *         - 7 for an indefinite lock duration (MAX_UINT_256)
     * @dev Reverts with an error message if the lock duration is not one of the specified values.
     */
    function _calculateVoteMultiplier(uint256 lockBlocks) internal pure returns (uint8) {
        if (lockBlocks == HALF_YEAR) {
            return 1;
        }
        if (lockBlocks == ONE_YEAR) {
            return 2;
        }
        if (lockBlocks == TWO_YEARS) {
            return 3;
        }
        if (lockBlocks == FOUR_YEARS) {
            return 4;
        }
        if (lockBlocks == MAX_UINT_256) {
            return 7;
        }

        revert("DelegateManager: incorrect lock duration");
    }
}
