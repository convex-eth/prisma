// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./interfaces/ITokenMinter.sol";
import "./interfaces/ITokenLocker.sol";
import "./interfaces/IBoostDelegate.sol";
import "./interfaces/IVoterProxy.sol";
import "./interfaces/IBooster.sol";

contract BoostDelegate is IBoostDelegate{

    address public constant escrow = address(0x3f78544364c3eCcDCe4d9C89a630AEa26122829d);
    address public immutable convexproxy;
    address public immutable cvxprisma;

    uint256 public boostFee;
    
    event SetMintableClaimer(address indexed _address, bool _valid);
    event SetBoostFee(uint256 _fee);

    constructor(address _proxy, address _cvxprisma, uint256 _fee){
        convexproxy = _proxy;
        cvxprisma = _cvxprisma;
        boostFee = _fee;
    }

    modifier onlyOwner() {
        require(IBooster(IVoterProxy(convexproxy).operator()).owner() == msg.sender, "!owner");
        _;
    }

    function setFee(uint256 _fee) external onlyOwner{
        boostFee = _fee;
        emit SetBoostFee(_fee);
    }

    function getFeePct(
        address, // claimant,
        address,// receiver,
        uint,// amount,
        uint,// previousAmount,
        uint// totalWeeklyEmissions
    ) external view returns (uint256 feePct){
        return boostFee;
    }

    function delegatedBoostCallback(
        address claimant,
        address receiver,
        uint,// amount,
        uint adjustedAmount,
        uint,// fee,
        uint,// previousAmount,
        uint// totalWeeklyEmissions
    ) external returns (bool success){
        if(receiver == convexproxy){

            adjustedAmount = adjustedAmount / ITokenLocker(escrow).lockToTokenRatio() * ITokenLocker(escrow).lockToTokenRatio();
            if(adjustedAmount > 0){
                ITokenMinter(cvxprisma).mint(claimant, adjustedAmount);
            }
            return true;
        }

        return true;
    }

}