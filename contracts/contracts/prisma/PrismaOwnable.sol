// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IAddressProvider.sol";

/**
    Contracts inheriting PrismaOwnable have the same owner as the address provider.
    This ownership cannot be independently modified or renounced.
 */
contract PrismaOwnable {
    // IAddressProvider public immutable ADDRESS_PROVIDER;
    address public immutable ADDRESS_PROVIDER;

    constructor(address _addressProvider) {
        // ADDRESS_PROVIDER = IAddressProvider(_addressProvider);
        ADDRESS_PROVIDER = _addressProvider;
    }

    modifier onlyOwner() {
        // require(msg.sender == ADDRESS_PROVIDER.owner(), "Only owner");
        require(msg.sender == ADDRESS_PROVIDER, "Only owner");
        _;
    }

    function owner() public view returns (address) {
        // return ADDRESS_PROVIDER.owner();
        return ADDRESS_PROVIDER;
    }
}
