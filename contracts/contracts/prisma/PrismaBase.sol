// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./BaseMath.sol";
import "./PrismaMath.sol";
import "../interfaces/IPriceFeed.sol";

/*
 * Base contract for TroveManager, BorrowerOperations and StabilityPool. Contains global system constants and
 * common functions.
 */
contract PrismaBase is BaseMath {
    uint public constant _100pct = 1000000000000000000; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint public constant MCR = 1100000000000000000; // 110%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint public constant CCR = 1500000000000000000; // 150%

    // Amount of debt to be locked in gas pool on opening troves
    uint public immutable DEBT_GAS_COMPENSATION;

    uint public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    constructor(uint _gasCompensation) {
        DEBT_GAS_COMPENSATION = _gasCompensation;
    }

    // --- Gas compensation functions ---

    // Returns the composite debt (drawn debt + gas compensation) of a trove, for the purpose of ICR calculation
    function _getCompositeDebt(uint _debt) internal view returns (uint) {
        return _debt + DEBT_GAS_COMPENSATION;
    }

    function _getNetDebt(uint _debt) internal view returns (uint) {
        return _debt - DEBT_GAS_COMPENSATION;
    }

    // Return the amount of collateral to be drawn from a trove's collateral and sent as gas compensation.
    function _getCollGasCompensation(uint _entireColl) internal pure returns (uint) {
        return _entireColl / PERCENT_DIVISOR;
    }

    function _requireUserAcceptsFee(uint _fee, uint _amount, uint _maxFeePercentage) internal pure {
        uint feePercentage = (_fee * DECIMAL_PRECISION) / _amount;
        require(feePercentage <= _maxFeePercentage, "Fee exceeded provided maximum");
    }
}
