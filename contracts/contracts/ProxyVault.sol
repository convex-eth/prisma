// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import "./interfaces/IFeeReceiver.sol";

//vault that may hold funds/fees/locks etc but is controlled by an outside operator
contract ProxyVault is IFeeReceiver{
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public operator;
    event WithdrawTo(address indexed user, uint256 amount);
    event SetOperator(address _operator);

    constructor(address _owner, address _operator) {
        owner = _owner;
        operator = _operator;
    }

    function setOperator(address _op) external {
        require(msg.sender == owner, "!owner");
        operator = _op;
        emit SetOperator(operator);
    }
    
    function withdrawTo(IERC20 _asset, uint256 _amount, address _to) external {
    	require(msg.sender == operator, "!auth");

        _asset.safeTransfer(_to, _amount);
        emit WithdrawTo(_to, _amount);
    }

    function processFees() external {
        if(operator != address(0)){
            IFeeReceiver(operator).onProcessFees(msg.sender);
        }
    }

    function onProcessFees(address _caller) external{
        
    }

    function execute(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external returns (bool, bytes memory) {
        require(msg.sender == operator,"!auth");

        (bool success, bytes memory result) = _to.call{value:_value}(_data);

        return (success, result);
    }

}