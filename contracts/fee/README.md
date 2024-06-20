# FeeAccount

## Overview

Fee account contract is used to manage payment channels for a single token and serve as an on-chain verification system the off-chain system.

## Contract details

-   Solidity Version: ^0.8.18
-   Dependencies:
    -   Libraries : SafeERC20Upgradeable,ClonesUpgradeable,ECDSAUpgradeable
    -   Contracts : EIP712Upgradeable

## Contract features

There are two types of messages that can be verified on chain

1. Claim messages : A intermediate state that is signed by the user and fee manger that can be submitted on chain to start a timelock.They are used to update the next state of the channel and also contain conditional payments in the form of HTLCs.
2. Close messages : A final state that is signed by both the user and fee manager that can be submitted on chain to close the channel instantly.

## Off-chain features

1. Bi directional payments.
2. Conditional atomic payments.
3. Deposits
    1. Funder deposits are direct transfers to channel address.
    2. Recipient’s first deposit is done by signing a state that reflects the deposit.
    3. Recipient refill is achieved via a atomic swap.
4. Partial withdrawals.
5. fee manager is always the funder.

## Definitions

1. State : It is the current state finalized or agreed upon settlement for the channel.
2. Channel : A multisig contract which allows off chain settlements and on chain verification of state,every channel has 2 participants.
3. Deposits : Depositing to a payment channel increases the balance of that participant.
4. Conditional Payments : HTLC payments that can exist in a state that can be resolved only after secret is revealed in the corresponding atomic swap in orderbook.
5. Partial withdrawals : One sided settlements using atomic swaps (similar to submarine swaps described by lighting network).

## State transitions for off-chain system

State has three parts

```
    Amount             : X
    Htlc state         :[(htlc1),(htlc2),…]
    Nonce              : n
```

Additional state parameter

```
    Balance            : B
```

INITIAL STATE

```
    Amount             : X
    Htlc state         :[(htlc(1)),(htlc(2)),…, (htlc(m))]
    Nonce              : n
```

### Transitions

1. **Funder pays recipient :**

-   Type : Claim
-   This payment is unconditional and state when submitted on chain will start a timelock.
-   Requested by the user via an api with their signature.
-   Condition : x’ ≤ B - X

```
    Amount             : X + x`
    Htlc state         :[(htlc(1)),(htlc(2)),…, (htlc(m))]
    Nonce              : n + 1
```

2. **Recipient pays Funder:**

-   Type : Claim
-   This payment is unconditional and state when submitted on chain will start a timelock.
-   State is signed by the fee manager server and stored in db.
-   Condition : x’ ≤ X

```
    Amount             : X - x`
    Htlc state         :[(htlc(1)),(htlc(2)),…, (htlc(m))]
    Nonce              : n + 1
```

3. **Add htlc:**

-   Type : Claim
-   Requested by the user via an api with their signature
-   Condition: $$ \sum_{i=1}^m (\text{htlc}(m)).\text{sendAmt} + X + htlc(m+1).sendAmt \leq B $$
    $$ \sum_{i=1}^m (\text{htlc}(m)).\text{receiveAmt} + htlc(m+1).receiveAmt \leq X $$

```
    Amount             : X
    Htlc state         :[(htlc(1)),(htlc(2)),…, (htlc(m)),(htlc(m+1))]
    Nonce              : n + 1
```

4. **Reveal Secrets:**

-   Type : Claim
-   _type 1 :_ Requested by the user via an api with user signature.
-   _type 2 :_ If found on chain it is signed by fee manager and stored in db.

```
    Amount             : X + x`- y`
    Htlc state         :[(htlc(1)),(htlc(2)),…, (htlc(m-1))] // signifies reduce in number of htlc position of the htlc does not matter
    Nonce              : n + 1
```

x’ = sum(htlc(i).sendAmt) given `h(s(i))` = htlc(i).`sh`

y’ = sum(htlc(i).receiveAmt) given `h(s(i))` = htlc(i).`sh`


## License
The contracts are licensed under the MIT License.
