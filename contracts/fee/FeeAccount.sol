// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

interface IFeeAccountFactory {
    function closed(address recipient) external;

    function claimed(address recipient, uint256 amount, uint256 nonce, uint256 expiration) external;
}

/**
 * @title   FeeAccount
 * @author  Catalog
 * @notice  The FeeAccount contract is used to manage the funds of a channel between a funder and a recipient.
 *          It allows the funder and recipient to close the channel and claim the funds.
 *          It also allows the recipient to settle the channel.
 * @dev     A template of contract is deployed by the factory.
 *          Clones are created by the factory.
 */
contract FeeAccount is EIP712Upgradeable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    struct HTLC {
        bytes32 secretHash;
        uint256 timeLock;
        uint256 sendAmount;
        uint256 receiveAmount;
    }

    bytes32 private constant CLOSE_TYPEHASH = keccak256("Close(uint256 amount)");
    bytes32 private constant CLAIM_HTLC_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Claim(uint256 nonce,uint256 amount,HTLC[] htlcs)",
                "HTLC(bytes32 secretHash,uint256 timeLock,uint256 sendAmount,uint256 receiveAmount)"
            )
        );
    bytes32 private constant HTLC_TYPEHASH =
        keccak256("HTLC(bytes32 secretHash,uint256 timeLock,uint256 sendAmount,uint256 receiveAmount)");

    // Are set when the channel is created
    IERC20 public token;
    address public funder;
    address public recipient;
    IFeeAccountFactory public factory;

    // Are set when a claim is made
    uint256 public amount;
    uint256 public nonce;
    uint256 public expiration;
    uint256 public secretsProvided;

    mapping(bytes => bool) public secretsClaimed;

    uint256 private constant TWO_DAYS = 2 * 7200;

    function initialize() external {
        _disableInitializers();
    }

    function __FeeAccount_init(
        IERC20 token_,
        address funder_,
        address recipient_,
        string memory feeAccountName,
        string memory feeAccountVersion
    ) external initializer {
        __EIP712_init_unchained(feeAccountName, feeAccountVersion);
        __FeeAccount_init_unchained(token_, funder_, recipient_);
    }

    function __FeeAccount_init_unchained(
        IERC20 token_,
        address funder_,
        address recipient_
    ) internal onlyInitializing {
        token = token_;
        funder = funder_;
        recipient = recipient_;
        factory = IFeeAccountFactory(msg.sender);
    }

    /**
     * @notice  Allows a participant to close the channel and claim their funds.
     *          - The amount_ is sent to the recipient.
     *          - The remaining amount is sent to the funder.
     * @dev     The funder and recipient must sign the close message.
     *
     * @param amount_       The amount of tokens to be closed with.
     * @param funderSig     The signature of the funder for the close message.
     * @param recipientSig  The signature of the recipient for the close message.
     */
    function close(uint256 amount_, bytes memory funderSig, bytes memory recipientSig) external {
        bytes32 id = _hashTypedDataV4(keccak256(abi.encode(CLOSE_TYPEHASH, amount_)));
        address funderSigner = id.recover(funderSig);
        address recipientSigner = id.recover(recipientSig);

        require(funderSigner == funder, "FeeAccount: invalid funder signature");
        require(recipientSigner == recipient, "FeeAccount: invalid recipient signature");

        closeChannel(amount_);
    }

    /**
     * @notice  Allows a participant to claim funds from the FeeAccount.
     *          - The claim can only be made if the provided secrets match the corresponding HTLCs and the amount is valid.
     *          - The amount is updated to the new amount.
     *          - The nonce is updated to the new nonce.
     *          - The funder and recipient must sign the claim message.
     *          - The expiration is updated to the current block number plus two days.
     *          - The secretsProvided is updated to the number of secrets provided.
     *          - A claim can be overridden by a new claim with the same nonce and more secrets.
     *          - A claim can be overridden by a new claim with the higher nonce.
     *
     * @param amount_       The amount of tokens to be claimed.
     * @param nonce_        The nonce value for the claim message.
     * @param htlcs         The array of HTLCs in the claim.
     * @param secrets       The array of secrets corresponding to the HTLCs.
     * @param funderSig     The signature of the funder for the claim message.
     * @param recipientSig  The signature of the recipient for the claim message.
     */
    function claim(
        uint256 amount_,
        uint256 nonce_,
        HTLC[] memory htlcs,
        bytes[] memory secrets,
        bytes memory funderSig,
        bytes memory recipientSig
    ) external {
        require(htlcs.length == secrets.length, "FeeAccount: invalid input");
        bytes32 claimID = claimHash(amount_, nonce_, htlcs);

        if (nonce == nonce_ && expiration != 0) {
            amount_ = amount;
        }

        uint256 localSecretsProvided = 0;
        for (uint256 i = 0; i < htlcs.length; i++) {
            if (!secretsClaimed[secrets[i]]) {
                if (htlcs[i].timeLock > block.number && sha256(secrets[i]) == htlcs[i].secretHash) {
                    localSecretsProvided++;
                    secretsClaimed[secrets[i]] = true;
                    amount_ += htlcs[i].sendAmount;
                    amount_ -= htlcs[i].receiveAmount;
                }
            } else {
                localSecretsProvided++;
            }
        }

        require(amount_ <= totalAmount(), "FeeAccount: invalid amount");
        if (expiration != 0) {
            // a claim exists, so should satisfy override conditions
            require(
                nonce_ > nonce || (nonce_ == nonce && localSecretsProvided > secretsProvided),
                "FeeAccount: override conditions not met"
            );
        }

        // verify funder and recipient signatures
        address funderSigner = claimID.recover(funderSig);
        address recipientSigner = claimID.recover(recipientSig);
        require(funderSigner == funder, "FeeAccount: invalid funder signature");
        require(recipientSigner == recipient, "FeeAccount: invalid recipient signature");

        // update global claim state
        secretsProvided = localSecretsProvided;
        expiration = block.number + TWO_DAYS;
        amount = amount_;
        nonce = nonce_;

        factory.claimed(recipient, amount_, nonce_, expiration);
    }

    /**
     * @notice  Allows the recipient to settle the FeeAccount.
     *          - The amount is sent to the recipient.
     *          - The remaining amount is sent to the funder.
     *          - The recipient can only settle the channel after the expiration block.
     */
    function settle() external {
        require(expiration > 0, "FeeAccount: no claim");
        require(expiration <= block.number, "FeeAccount: claim not expired");

        closeChannel(amount);
    }

    /**
     * @notice  Returns the total amount of tokens held by the FeeAccount.
     *
     * @return  The total amount of tokens.
     */
    function totalAmount() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice  Generates the hash to be signed by the participants to agree on claim messages.
     *
     * @param amount_   The amount to be claimed.
     * @param nonce_    The nonce value for the claim.
     * @param htlcs     The array of HTLCs.
     */
    function claimHash(uint256 amount_, uint256 nonce_, HTLC[] memory htlcs) public view returns (bytes32) {
        bytes32[] memory htlcHashes = new bytes32[](htlcs.length);

        for (uint256 i = 0; i < htlcs.length; i++) {
            htlcHashes[i] = keccak256(
                abi.encode(
                    HTLC_TYPEHASH,
                    htlcs[i].secretHash,
                    htlcs[i].timeLock,
                    htlcs[i].sendAmount,
                    htlcs[i].receiveAmount
                )
            );
        }

        return
            _hashTypedDataV4(
                keccak256(abi.encode(CLAIM_HTLC_TYPEHASH, nonce_, amount_, keccak256(abi.encodePacked(htlcHashes))))
            );
    }

    /**
     * @notice Closes the channel and sends the funds to the recipient and funder.
     *          - Used by the close and settle functions.
     * @param amount_ The amount to be sent to the recipient.
     */
    function closeChannel(uint256 amount_) internal {
        token.safeTransfer(recipient, amount_);
        token.safeTransfer(funder, totalAmount());

        factory.closed(recipient);

        selfdestruct(payable(funder));
    }
}
