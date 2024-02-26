# GardenStaker, DelegateManager, and FillerManager

This repository contains Solidity contracts for managing staking functionalities within a Garden ecosystem, facilitated by `GardenStaker`, `DelegateManager`, and `FillerManager` contracts. These contracts are designed to allow users to stake tokens as delegates or fillers in a garden, enabling secure, trustless transactions between parties.

- these contracts are crafted with Solidity `0.8.18` and leverages OpenZeppelin's SafeERC20, and EIP712 utilities for secure and standardized interactions.

## Contract Overview

### GardenStaker

The `GardenStaker` contract acts as an entry point for staking functionalities, inheriting from `DelegateManager` and `FillerManager`. It is initialized with parameters such as the seed token address, delegate stake amount, filler stake amount, and filler cooldown period.

- **Key Features:**
  - Inherits from `DelegateManager` and `FillerManager`.
  - Initializes with seed token, delegate stake, filler stake, and filler cooldown.
  - Facilitates staking as delegates or fillers.

### FillerManager

The `FillerManager` contract manages the registration, deregistration, fee update, and refund of fillers. It ensures that fillers can register, update their fee, and deregister themselves, holding the staked tokens during the registration period and refunding them to the fillers after a cooldown period.

- **Key Features:**
  - Manages filler registration, deregistration, fee updates, and refunds.
  - Supports fee updates within a maximum fee limit.
  - Implements a cooldown period for fillers to be refunded after deregistration.

### DelegateManager

The `DelegateManager` contract manages the delegation of voting power to fillers. It allows users to stake their tokens and delegate their voting power to fillers, with the ability to change, extend, renew, or refund the stake.

- **Key Features:**
  - Manages delegation of voting power to fillers.
  - Supports staking with various lock durations, affecting the voting power.
  - Allows stake owners to change, extend, renew, or refund their stakes.

### BaseStaker

The `BaseStaker` contract is an abstract base class that has all State variables and mappings which are used by the `GardenStaker`, `FillerManager`, and `DelegateManager` contracts.

- **Key Features:**
  - Abstract base class for `GardenStaker`, `FillerManager`, and `DelegateManager`

## Implementation Details

### GardenStaker
Acts as entrypoint for staking functionalities for fillers and delegates
- Initializes BaseStaker with following parameters
  - **seed:** seed token address
  - **delegateStake:** amount of seed to stake to be a delegate
  - **fillerStake:** amount of seed to stake to be a filler
  - **fillerCooldown:** cooldown period for fillers to be refunded deregistration

### FillerManager
manages the registration, deregistration, fee update, and refund of fillers.

*Functions*:
- **register:** registers a filler by allowing the caller to stake tokens of FILLER_STAKE amount.
- **deregister:** deregisters a filler by revoking the FILLER role from the caller and setting the `deregisteredAt` timestamp to the current block number, Hence starting the cooldown period.
- **refund:** refunds the staked tokens to a registered filler after the cooldown period has passed.
- **updateFee:** updates the fee of a filler by checking if the new fee is within the maximum fee limit.

*Events*
- **FillerRegistered:** emitted when a filler is registered.
- **FillerDeregistered:** emitted when a filler is deregistered.
- **FeeUpdated:** emitted when the fee of a filler is updated.
- **FillerRefunded:** emitted when a filler is refunded.

### DelegateManager
manages the delegation of voting power to fillers. Delegated votes can be changed, extended, renewed, or refunded by the stake owner.

*Functions*:
- **delegate:** delegates voting power to a filler by allowing the caller to stake tokens of DELEGATE_STAKE amount.
- **changeVote:** allows the stake owner to change the voting power delegation from one filler to another.
- **refund:**  refunds the staked tokens to a delegate after stake expiration has passed same time removing vote cast for respective filler.
- **renew:** allows the stake owner to renew the stake expiration and updating the voting power.
- **extend:** allows the stake owner to extend the stake expiration by extending the lock duration.
- **getVotes:** retrieves the total number of votes delegated to a specific filler address.
  - only stakes that have expired can be accounted.
- **_calculateVoteMultiplier:** calculates the voting power multiplier based on the lock duration.
  - lock duration can only be multiples of `7200 blocks` which is equivalent to one day in ethereum blockTime.
  - having different lock duration impacts on the voting power of delegate uints which are as follows. 
    - 6 months : 1x multiplier
    - 1 year   : 2x multiplier
    - 2 year   : 3x multiplier
    - 4 year   : 4x multiplier
    - perma Staking   : 7x multiplier


*Events*
- **Voted:** emitted when a vote is cast.
- **VoteChanged:** emitted when a vote is changed.
- **Staked:** emitted when a stake is created.
- **StakeExtended:** emitted when a stake is extended.
- **StakeRenewed:** emitted when a stake is renewed.
- **StakeRefunded:** emitted when a stake is refunded.


## Security Considerations
- **FillerCooldown:** The cooldown period for fillers to be refunded after deregistration. which ensures offChain components of Garden Ecosystem to take appropriate actions in case of deregistration.
- **access control:** The contract consists of role `FILLER`. address with FILLER role are only considered to be valid fillers.
  - Functions `deregister`, `refund`, `updateFee` can only be called by addresses with FILLER role.



## Dependencies



## License
The contracts are licensed under the MIT License.
