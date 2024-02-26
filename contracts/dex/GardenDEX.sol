// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title Garden Decentralized Exchange
/// @author Garden Finance
/// @notice GardenDEX is a decentralized exchange for ERC20 tokens with offchain order creation and onchain settlement.
/// @dev GardenDEX uses EIP-712 for offchain order creation and ECDSA for onchain order settlement.
contract GardenDEX is EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct Order {
        address creator;
        address filler;
        IERC20 fromToken;
        IERC20 toToken;
        uint256 fromAmount;
        uint256 toAmount;
        uint256 expiry;
    }

    bytes32 private constant _ORDER_TYPEHASH =
        keccak256(
            "Order(address creator,address filler,address fromToken,address toToken,uint256 fromAmount,uint256 toAmount,uint256 expiry)"
        );

    mapping(bytes32 => bool) public settled;

    constructor(string memory name, string memory version) EIP712(name, version) {}

    /// @notice Settlement of an off-chain created and pre-signed order.
    /// @param order Order details according to Order's struct.
    /// @param creatorSig Signature of `order.creator`.
    /// @param fillerSig Signature of `order.filler`.
    /// @dev Requires order to be unsettled, non-expired, and have valid signatures.
    function settle(Order calldata order, bytes calldata creatorSig, bytes calldata fillerSig) external {
        bytes32 orderID = keccak256(abi.encode(order));

        require(!settled[orderID], "GardenDEX: settled order");
        require(order.expiry > block.number, "GardenDEX: expired order");
        require(verify(order, creatorSig, fillerSig), "GardenDEX: invalid signature(s)");

        settled[orderID] = true;

        order.fromToken.safeTransferFrom(order.creator, order.filler, order.fromAmount);
        order.toToken.safeTransferFrom(order.filler, order.creator, order.toAmount);
    }

    /// @notice Verifies creator and filler signatures of an order.
    /// @param order Order details according to Order's struct.
    /// @param creatorSig Signature of `order.creator`.
    /// @param fillerSig Signature of `order.filler`.
    /// @return If both signatures are valid then true, otherwise false.
    function verify(
        Order calldata order,
        bytes calldata creatorSig,
        bytes calldata fillerSig
    ) public view returns (bool) {
        bytes32 typedDataV4Hash = _hashTypedDataV4(keccak256(abi.encode(_ORDER_TYPEHASH, order)));

        address creator = typedDataV4Hash.recover(creatorSig);
        address filler = typedDataV4Hash.recover(fillerSig);

        return creator == order.creator && filler == order.filler;
    }
}
