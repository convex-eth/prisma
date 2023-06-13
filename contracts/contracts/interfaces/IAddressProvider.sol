// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IAddressProvider {
    function owner() external view returns (address);

    function feeReceiver() external view returns (address);

    function priceFeed() external view returns (address);

    function paused() external view returns (bool);

    function startTime() external view returns (uint256);
}
