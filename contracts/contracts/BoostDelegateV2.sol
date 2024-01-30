// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./interfaces/ITokenMinter.sol";
import "./interfaces/IBoostDelegateV2.sol";
import "./interfaces/IVoterProxy.sol";
import "./interfaces/IBooster.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract BoostDelegateV2 is IBoostDelegateV2{
    using SafeERC20 for IERC20;

    address public constant escrow = address(0x3f78544364c3eCcDCe4d9C89a630AEa26122829d);
    address public constant crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address public constant cvx = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    address public constant delegationFactory = address(0xd39164369C37c412a04603666DcF4C7b33137748);
    address public immutable convexproxy;
    address public immutable cvxprisma;
    

    uint256 public boostFee;
    uint256 public mintFee;
    address[] public sweepableTokens;
    mapping(address => bool) public feeExemption;

    event SetBoostFees(uint256 _fee, uint256 _mintfee);
    event SetExemption(address indexed _address, bool _valid);
    event SetSweepableTokens(address[] _tokens);

    constructor(address _proxy, address _cvxprisma, uint256 _fee){
        convexproxy = _proxy;
        cvxprisma = _cvxprisma;
        boostFee = _fee;
        sweepableTokens = [cvx, crv];
    }

    modifier onlyOwner() {
        require(IBooster(IVoterProxy(convexproxy).operator()).owner() == msg.sender, "!owner");
        _;
    }

    function setFees(uint256 _boostfee, uint256 _mintfee) external onlyOwner{
        boostFee = _boostfee;
        mintFee = _mintfee;
        emit SetBoostFees(_boostfee, _mintfee);
    }

    function setExemption(address _account, bool _exempt) external onlyOwner{
        feeExemption[_account] = _exempt;
        emit SetExemption(_account, _exempt);
    }

    function setSweepableTokens(address[] calldata _tokens) external onlyOwner{
        sweepableTokens = _tokens;
        emit SetSweepableTokens(_tokens);
    }

    //get fee pct via delegation factory
    function getFeePct(
        address _claimant,
        address _receiver,
        address, //_boostDelegate
        uint256, //_amount
        uint256, //_previousAmount
        uint256 //_totalWeeklyEmissions
    ) external view returns (uint256) {
        if(_receiver == convexproxy){
            return mintFee;
        }
        if(feeExemption[_claimant]){
            return 0;
        }
        return boostFee;
    }

    //delegate callback from factory
    function delegateCallback(
        address,// _claimant,
        address,// _receiver,
        address,// _boostDelegate,
        uint256,// _amount,
        uint256,// _adjustedAmount,
        uint256,// _fee,
        uint256,// _previousAmount,
        uint256// _totalWeeklyEmissions
    ) external returns (bool) {
        require(msg.sender == delegationFactory, "!factory");
        return true;
    }

    //receiver callback from factory
    function receiverCallback(
        address _claimant,
        address _receiver,
        uint256 _adjustedAmount
    ) external returns (bool) {
        require(msg.sender == delegationFactory, "!factory");
        return _onRecieve(_claimant, _receiver, _adjustedAmount);
    }

    //receive -> mint and sweep
    function _onRecieve(
        address _claimant,
        address _receiver,
        uint256 _adjustedAmount
    ) internal returns (bool) {
        if(_receiver == convexproxy){

            //make sure adjusted amount is rounded to whole number
            _adjustedAmount = _adjustedAmount / 1e18 * 1e18;

            if(_adjustedAmount > 0){
                ITokenMinter(cvxprisma).mint(_claimant, _adjustedAmount);
            }

            for(uint256 i = 0; i < sweepableTokens.length; ){
                uint256 balance = IERC20(sweepableTokens[i]).balanceOf(convexproxy);

                if(balance > 0){
                    IBooster(IVoterProxy(convexproxy).operator()).recoverERC20FromProxy(sweepableTokens[i], balance, _claimant);
                }

                unchecked{
                    ++i;
                }
            }
        }
        return true;
    }

}