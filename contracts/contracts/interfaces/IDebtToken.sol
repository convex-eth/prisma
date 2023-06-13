// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

// import { IOFT } from "@layerzerolabs/solidity-examples/contracts/token/oft/IOFT.sol";
import "./IERC2612.sol";

interface IDebtToken {// is IOFT, IERC2612 {
    // --- Functions ---

    function mint(address _account, uint256 _amount) external;

    function burn(address _account, uint256 _amount) external;

    function sendToPool(address _sender, address poolAddress, uint256 _amount) external;

    function returnFromPool(address poolAddress, address user, uint256 _amount) external;

    function enableCollateral(address _troveManager) external;
}
