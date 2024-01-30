// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

/**
    @title Prisma Boost Delegate Interface
 */
interface IBoostDelegateV2 {
    
    function getFeePct(
        address _claimant,
        address _receiver,
        address, //_boostDelegate
        uint256, //_amount
        uint256, //_previousAmount
        uint256 //_totalWeeklyEmissions
    ) external view returns (uint256 feePct);


    function delegateCallback(
        address,// _claimant,
        address,// _receiver,
        address,// _boostDelegate,
        uint256,// _amount,
        uint256,// _adjustedAmount,
        uint256,// _fee,
        uint256,// _previousAmount,
        uint256// _totalWeeklyEmissions
    ) external returns (bool);

    function receiverCallback(
        address _claimant,
        address _receiver,
        uint256 _adjustedAmount
    ) external returns (bool);
}