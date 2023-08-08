// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IAddressProvider.sol";

contract SystemStart {
    uint256 immutable startTime;

    // constructor(address addressProvider) {
    constructor(address) {
        // startTime = IAddressProvider(addressProvider).startTime();
        startTime = block.timestamp;
    }

    function getWeek() public view returns (uint256) {
        return (block.timestamp - startTime) / 1 weeks;
    }
}
