// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;


import "./interfaces/IStaker.sol";
import "./interfaces/IFeeReceiver.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


/*
Main interface for the whitelisted proxy contract.

**This contract is meant to be able to be replaced for upgrade purposes. use IVoterProxy.operator() to always reference the current booster

*/
contract Booster{
    using SafeERC20 for IERC20;

    address public immutable prisma;

    address public immutable proxy;
    address public immutable prismaDepositor;
    address public immutable prismaTreasury;
    address public immutable prismaVoting;
    address public immutable prismaIncentives;
    address public immutable cvxfpis;
    address public owner;
    address public pendingOwner;

    address public rewardManager;
    address public voteManager;
    address public feeclaimer;
    bool public isShutdown;
    address public feeQueue;
    bool public feeQueueProcess;


    constructor(address _proxy, address _depositor, address _ptreasury, address _pVoting, address _pIncentives, address _prisma, address _cvxfpis) {
        proxy = _proxy;
        prismaDepositor = _depositor;
        prisma = _prisma;
        cvxfpis = _cvxfpis;
        prismaTreasury = _ptreasury;
        prismaVoting = _pVoting;
        prismaIncentives = _pIncentives;
        isShutdown = false;
        owner = msg.sender;
        rewardManager = msg.sender;
     }

    /////// Owner Section /////////

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    // modifier onlyVoteManager() {
    //     require(voteManager == msg.sender, "!vauth");
    //     _;
    // }

    //set pending owner
    function setPendingOwner(address _po) external onlyOwner{
        pendingOwner = _po;
        emit SetPendingOwner(_po);
    }

    //claim ownership
    function acceptPendingOwner() external {
        require(pendingOwner != address(0) && msg.sender == pendingOwner, "!p_owner");

        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerChanged(owner);
    }

    //set a reward manager
    function setRewardManager(address _rmanager) external onlyOwner{
        rewardManager = _rmanager;
        emit RewardManagerChanged(_rmanager);
    }

    function setVoteManager(address _vmanager) external onlyOwner{
        if(voteManager != address(0)){
            //remove old delegate
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setDelegateApproval(address,bool)")), voteManager, false);
            _proxyCall(prismaTreasury,data);
        }
        if(_vmanager != address(0)){
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setDelegateApproval(address,bool)")), _vmanager, true);
            _proxyCall(prismaTreasury,data);
        }

        voteManager = _vmanager;
        emit VoteManagerChanged(_vmanager);
    }

    //make execute() calls to the proxy voter
    function _proxyCall(address _to, bytes memory _data) internal{
        (bool success,) = IStaker(proxy).execute(_to,uint256(0),_data);
        require(success, "Proxy Call Fail");
    }

    //set fee queue, a contract fees are moved to when claiming
    function setFeeQueue(address _queue, bool _process) external onlyOwner{
        feeQueue = _queue;
        feeQueueProcess = _process;
        emit FeeQueueChanged(_queue, _process);
    }

    //set who can call claim fees, 0x0 address will allow anyone to call
    function setFeeClaimer(address _claimer) external onlyOwner{
        feeclaimer = _claimer;
        emit FeeClaimerChanged(_claimer);
    }
    
    //shutdown this contract.
    function shutdownSystem() external onlyOwner{
        //This version of booster does not require any special steps before shutting down
        //and can just immediately be set.
        isShutdown = true;
        emit Shutdown();
    }


    // function voteForProposal(address account, uint id, uint weight) external onlyVoteManager{
    //     bytes memory data = abi.encodeWithSelector(bytes4(keccak256("voteForProposal(address,uint,uint)")), account, id, weight);
    //     _proxyCall(prismaTreasury,data);
    // }


    function setBoosterFees(bool isEnabled, uint feePct, address callback) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("setBoostDelegationParams(bool,uint,address)")), isEnabled, feePct, callback);
        _proxyCall(prismaTreasury,data);
    }

    //recover tokens on this contract
    function recoverERC20(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        IERC20(_tokenAddress).safeTransfer(_withdrawTo, _tokenAmount);
        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //recover tokens on the proxy
    function recoverERC20FromProxy(address _tokenAddress, uint256 _tokenAmount, address _withdrawTo) external onlyOwner{
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), _withdrawTo, _tokenAmount);
        _proxyCall(_tokenAddress,data);

        emit Recovered(_tokenAddress, _tokenAmount);
    }

    //////// End Owner Section ///////////


    //claim fees - if set, move to a fee queue that rewards can pull from
    function claimFees() external {
        require(feeclaimer == address(0) || feeclaimer == msg.sender, "!auth");
        require(feeQueue != address(0),"!fee queue");

        //TODO: refactor later to pull returned value from call
        uint256 bal = IERC20(prisma).balanceOf(feeQueue);
        
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("batchClaimRewards(address,address,address[])")), feeQueue, address(0), new address[](0));
        _proxyCall(prismaTreasury,data);

        if(feeQueueProcess){
            IFeeReceiver(feeQueue).processFees();
        }

        emit FeesClaimed(IERC20(prisma).balanceOf(feeQueue) - bal);
    }

    
    /* ========== EVENTS ========== */
    event SetPendingOwner(address indexed _address);
    event OwnerChanged(address indexed _address);
    event FeeQueueChanged(address indexed _address, bool _useProcess);
    event FeeClaimerChanged(address indexed _address);
    event FeeClaimPairSet(address indexed _address, address indexed _token, bool _value);
    event RewardManagerChanged(address indexed _address);
    event VoteManagerChanged(address indexed _address);
    event Shutdown();
    event DelegateSet(address indexed _address);
    event FeesClaimed(uint256 _amount);
    event Recovered(address indexed _token, uint256 _amount);
}