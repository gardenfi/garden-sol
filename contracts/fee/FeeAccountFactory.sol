// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "./FeeAccount.sol";

/**
 * @title FeeAccountFactory
 * @author Garden Finance
 * @notice The FeeAccountFactory contract is used to deploy and manage the fee channels.
 * It allows the funder and recipient to create the channel.
 * @dev Name and version are set when the factory is deployed,they are to initialize the fee channel.
 * The factory deploys a template of the fee channel.
 * Clones are created by the factory.
 */
contract FeeAccountFactory {
    using ClonesUpgradeable for address;

    IERC20Upgradeable public immutable token;
    address public immutable feeManager;
    address public immutable template;

    string public feeAccountName;
    string public feeAccountVersion;

    mapping(address => uint256) public nonces;
    mapping(address => FeeAccount) public channels;

    event Claimed(address indexed channel, uint256 amount, uint256 nonce, uint256 expiration);
    event Created(address indexed funder, address indexed channel);
    event Closed(address indexed channel);

    constructor(
        IERC20Upgradeable token_,
        address feeManager_,
        string memory feeAccountName_,
        string memory feeAccountVersion_
    ) {
        require(address(token_) != address(0), "FeeAccountFactory: token is zero address");
        require(feeManager_ != address(0), "FeeAccountFactory: fee manager is zero address");

        token = token_;
        feeManager = feeManager_;

        feeAccountName = feeAccountName_;
        feeAccountVersion = feeAccountVersion_;

        FeeAccount templateFeeAccount = new FeeAccount();
        template = address(templateFeeAccount);
    }

    /**
     * @notice Create a fee channel and close it.
     * @param amount The amount of tokens to be closed with.
     * @param funderSig The signature of the funder for the close message.
     * @param recipientSig The signature of the recipient for the close message.
     */
    function createAndClose(uint256 amount, bytes memory funderSig, bytes memory recipientSig) external {
        FeeAccount channel = create();
        channel.close(amount, funderSig, recipientSig);
    }

    /**
     * @notice Create a fee channel and claim it.
     * @param amount The amount of tokens to be claimed.
     * @param nonce The nonce value of the claim message.
     * @param htlcs The array of HTLCs in the claim.
     * @param secrets The array of secrets corresponding to the HTLCs.
     * @param funderSig The signature of the funder for the claim message.
     * @param recipientSig The signature of the recipient for the claim message.
     */
    function createAndClaim(
        uint256 amount,
        uint256 nonce,
        FeeAccount.HTLC[] memory htlcs,
        bytes[] memory secrets,
        bytes memory funderSig,
        bytes memory recipientSig
    ) external {
        FeeAccount channel = create();
        channel.claim(amount, nonce, htlcs, secrets, funderSig, recipientSig);
    }

    /**
     * @notice Settle the fee channel.
     * @param recipient The address of the recipient.
     */
    function settle(address recipient) external {
        channels[recipient].settle();
    }

    /**
     * @notice To be called by the fee channels when a claim is made.
     * @param recipient The address of the recipient.
     * @param amount The amount of tokens in the claim.
     */
    function claimed(address recipient, uint256 amount, uint256 nonce, uint256 expiration) external {
        require(msg.sender == address(channels[recipient]), "FeeAccountFactory: caller must be fee channel");

        emit Claimed(address(channels[recipient]), amount, nonce, expiration);
    }

    /**
     * @notice To be called by the fee channels when a channel is closed.
     * @param recipient The address of the recipient.
     */
    function closed(address recipient) external {
        require(msg.sender == address(channels[recipient]), "FeeAccountFactory: caller must be fee channel");

        emit Closed(address(channels[recipient]));

        delete channels[recipient];
    }

    /**
     * @notice Creates a fee channel.
     * @dev The fee channel is created by deploying a clone using the template.
     * This function is only callable by the fee manager.
     * @param recipient The address of the recipient.
     * @return The address of the fee channel.
     */
    function feeManagerCreate(address recipient) external returns (FeeAccount) {
        require(msg.sender == feeManager, "FeeAccountFactory: caller must be fee manager");
        return _create(feeManager, recipient);
    }

    /**
     * @notice Creates a fee channel.
     * @dev The fee channel is created by deploying a clone using the template.
     * This function is only callable by the recipient.
     * @return The address of the fee channel.
     */
    function create() public returns (FeeAccount) {
        return _create(feeManager, msg.sender);
    }

    /**
     * @notice Creates a fee channel.
     * Used by create and feeManagerCreate.
     * @param funder The address of the funder.
     * @param recipient The address of the recipient.
     * @return The address of the fee channel.
     */
    function _create(address funder, address recipient) internal returns (FeeAccount) {
        require(channels[recipient] == FeeAccount(address(0)), "FeeAccountFactory: fee channel exists");
        bytes32 salt = keccak256(abi.encode(token, feeManager, recipient, nonces[recipient]));

        nonces[recipient]++;

        address channel = template.cloneDeterministic(salt);
        channels[recipient] = FeeAccount(channel);
        channels[recipient].__FeeAccount_init(token, funder, recipient, feeAccountName, feeAccountVersion);

        emit Created(recipient, address(channel));

        return FeeAccount(channel);
    }
}
