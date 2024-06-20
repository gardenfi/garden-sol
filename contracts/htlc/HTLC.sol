// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @author  Garden Finance
 * @title   HTLC smart contract for atomic swaps
 * @notice  Any signer can create an order to serve as one of either halfs of an cross chain
 *          atomic swap for any user with respective valid signatures.
 * @dev     The contracts can be used to create an order to serve as the the commitment for two
 *          types of users :
 *          Initiator functions: 1. initate
 *                               2. refund
 *          Redeemer function: 1. redeem
 */
contract HTLC is EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct Order {
        bool isFulfilled;
        address initiator;
        address redeemer;
        uint256 initiatedAt;
        uint256 timelock;
        uint256 amount;
    }

    IERC20 public immutable token;

    mapping(bytes32 => Order) public orders;

    bytes32 private constant _INITIATE_TYPEHASH =
        keccak256("Initiate(address redeemer,uint256 timelock,uint256 amount,bytes32 secretHash)");

    bytes32 private constant _REFUND_TYPEHASH = keccak256("Refund(bytes32 orderId)");

    event Initiated(bytes32 indexed orderID, bytes32 indexed secretHash, uint256 amount);
    event Redeemed(bytes32 indexed orderID, bytes32 indexed secretHash, bytes secret);
    event Refunded(bytes32 indexed orderID);

    /**
     * @notice  .
     * @dev     provides checks to ensure
     *              1. redeemer is not null address
     *              3. timelock is greater than 0
     *              4. amount is not zero
     * @param   redeemer  public address of the reedeem
     * @param   timelock  timelock in period for the htlc order
     * @param   amount  amount of tokens to trade
     */
    modifier safeParams(
        address redeemer,
        uint256 timelock,
        uint256 amount
    ) {
        require(redeemer != address(0), "HTLC: zero address redeemer");
        require(timelock > 0, "HTLC: zero timelock");
        require(amount > 0, "HTLC: zero amount");
        _;
    }

    constructor(address token_, string memory name, string memory version) EIP712(name, version) {
        token = IERC20(token_);
    }

    /**
     * @notice  Signers can create an order with order params
     * @dev     Secret used to generate secret hash for iniatiation should be generated randomly
     *          and sha256 hash should be used to support hashing methods on other non-evm chains.
     *          Signers cannot generate orders with same secret hash or override an existing order.
     * @param   redeemer  public address of the redeemer
     * @param   timelock  timelock in period for the htlc order
     * @param   amount  amount of tokens to trade
     * @param   secretHash  sha256 hash of the secret used for redemtion
     **/
    function initiate(
        address redeemer,
        uint256 timelock,
        uint256 amount,
        bytes32 secretHash
    ) external safeParams(redeemer, timelock, amount) {
        _initiate(msg.sender, redeemer, timelock, amount, secretHash);
    }

    /**
     * @notice  Signers can create an order with order params and signature for a user
     * @dev     Secret used to generate secret hash for iniatiation should be generated randomly
     *          and sha256 hash should be used to support hashing methods on other non-evm chains.
     *          Signers cannot generate orders with same secret hash or override an existing order.
     * @param   redeemer  public address of the redeemer
     * @param   timelock  timelock in period for the htlc order
     * @param   amount  amount of tokens to trade
     * @param   secretHash  sha256 hash of the secret used for redemtion
     * @param   signature  EIP712 signature provided by authorized user for iniatiation. user will be assigned as initiator
     **/
    function initiateWithSignature(
        address redeemer,
        uint256 timelock,
        uint256 amount,
        bytes32 secretHash,
        bytes calldata signature
    ) external safeParams(redeemer, timelock, amount) {
        address initiator = _hashTypedDataV4(
            keccak256(abi.encode(_INITIATE_TYPEHASH, redeemer, timelock, amount, secretHash))
        ).recover(signature);

        _initiate(initiator, redeemer, timelock, amount, secretHash);
    }

    /**
     * @notice  Signers with correct secret to an order's secret hash can redeem to claim the locked
     *          token
     * @dev     Signers are not allowed to redeem an order with wrong secret or redeem the same order
     *          multiple times
     * @param   orderID  orderIds if the htlc order
     * @param   secret  secret used to redeem an order
     */
    function redeem(bytes32 orderID, bytes calldata secret) external {
        Order storage order = orders[orderID];

        require(order.redeemer != address(0x0), "HTLC: order not initiated");
        require(!order.isFulfilled, "HTLC: order fulfilled");

        bytes32 secretHash = sha256(secret);

        require(sha256(abi.encode(secretHash, order.initiator)) == orderID, "HTLC: incorrect secret");

        order.isFulfilled = true;

        emit Redeemed(orderID, secretHash, secret);

        token.safeTransfer(order.redeemer, order.amount);
    }

    /**
     * @notice  Signers can refund the locked assets after timelock block number
     * @dev     Signers cannot refund the an order before epiry block number or refund the same order
     *          multiple times.
     *          Funds will be SafeTransferred to the initiator.
     * @param   orderID  orderId of the htlc order
     */
    function refund(bytes32 orderID) external {
        Order storage order = orders[orderID];

        require(order.redeemer != address(0), "HTLC: order not initiated");
        require(!order.isFulfilled, "HTLC: order fulfilled");
        require(order.initiatedAt + order.timelock < block.number, "HTLC: order not expired");

        order.isFulfilled = true;

        emit Refunded(orderID);

        token.safeTransfer(order.initiator, order.amount);
    }

    /**
     * @notice  Internal function to initiate an order for an atomic swap
     * @dev     This function is called internally to create a new order for an atomic swap.
     *          It checks that the initiator and redeemer addresses are different and that there is no duplicate order.
     *          It creates a new order with the provided parameters and stores it in the 'orders' mapping.
     *          It emits an 'Initiated' event with the order ID, secret hash, and amount.
     *          It transfers the specified amount of tokens from the initiator to the contract address.
     * @param   initiator_  The address of the initiator of the atomic swap
     * @param   redeemer_   The address of the redeemer of the atomic swap
     * @param   secretHash_ The hash of the secret used for redemption
     * @param   timelock_     The timelock block number for the atomic swap
     * @param   amount_     The amount of tokens to be traded in the atomic swap
     */
    function _initiate(
        address initiator_,
        address redeemer_,
        uint256 timelock_,
        uint256 amount_,
        bytes32 secretHash_
    ) internal {
        require(initiator_ != redeemer_, "HTLC: same initiator and redeemer");

        bytes32 orderID = sha256(abi.encode(secretHash_, initiator_));
        Order memory order = orders[orderID];

        require(order.redeemer == address(0), "HTLC: duplicate order");

        Order memory newOrder = Order({
            isFulfilled: false,
            initiator: initiator_,
            redeemer: redeemer_,
            initiatedAt: block.number,
            timelock: timelock_,
            amount: amount_
        });
        orders[orderID] = newOrder;

        emit Initiated(orderID, secretHash_, orders[orderID].amount);

        token.safeTransferFrom(initiator_, address(this), orders[orderID].amount);
    }

    /**
     * @notice  Redeemers can let initiator refund the locked assets before expiry block number
     * @dev     Signers cannot refund the the same order multiple times.
     *          Funds will be SafeTransferred to the initiator.
     *
     * @param orderID       orderID of the htlc order
     * @param signature     EIP712 signature provided by redeemer for instant refund.
     */
    function instantRefund(bytes32 orderID, bytes calldata signature) external {
        address redeemer = _hashTypedDataV4(keccak256(abi.encode(_REFUND_TYPEHASH, orderID))).recover(signature);
        Order storage order = orders[orderID];

        require(order.redeemer == redeemer, "HTLC: invalid redeemer signature");
        require(!order.isFulfilled, "HTLC: order fulfilled");

        order.isFulfilled = true;

        emit Refunded(orderID);

        token.safeTransfer(order.initiator, order.amount);
    }
}
