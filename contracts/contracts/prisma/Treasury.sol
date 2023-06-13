// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./PrismaOwnable.sol";
import "./SystemStart.sol";
import "../interfaces/IPrismaToken.sol";
import "../interfaces/IEmissionSchedule.sol";
import "../interfaces/IIncentiveVoting.sol";
import "../interfaces/ITokenLocker.sol";
import "../interfaces/IBoostDelegate.sol";
import "../interfaces/IBoostCalculator.sol";

interface IEmissionReceiver {
    function notifyRegisteredId(uint256[] memory assignedIds) external returns (bool);
}

interface IRewards {
    function treasuryClaimReward(address claimant, address receiver) external returns (uint256);

    function claimableReward(address account) external view returns (uint256);
}

contract PrismaTreasury is PrismaOwnable, SystemStart {
    using Address for address;
    using SafeERC20 for IERC20;

    IPrismaToken public immutable prismaToken;
    ITokenLocker public immutable locker;
    IIncentiveVoting public immutable voter;

    IEmissionSchedule public emissionSchedule;
    IBoostCalculator public boostCalculator;

    // `prismaToken` balance within the treasury that is not yet allocated.
    // Starts as `prismaToken.totalSupply()` and decreases over time.
    uint128 public unallocatedTotal;
    // most recent week that `unallocatedTotal` was reduced by a call to
    // `emissionSchedule.getTotalWeeklyEmissions`
    uint64 public totalUpdateWeek;
    // number of weeks that PRISMA is locked for when transferred using
    // `transferAllocatedTokens`. updated weekly by the emission schedule.
    uint64 public lockWeeks;

    // id -> receiver data
    uint16[65535] public receiverUpdatedWeek;
    // id -> address of receiver
    // not bi-directional, one receiver can have multiple ids
    mapping(uint => address) public idToReceiver;

    mapping(address => uint) public allocated;

    uint256 immutable lockToTokenRatio;

    uint128[65535] public weeklyEmissions;

    // amount claimed by each account in a given week
    mapping(address => uint128[65535]) accountWeeklyEarned;

    // pending rewards for an address (dust after locking, fees from delegation)
    mapping(address => uint256) public pendingRewardFor;

    mapping(address => Delegation) public boostDelegation;

    struct Delegation {
        bool isEnabled;
        uint16 feePct;
        IBoostDelegate callback;
    }

    struct InitialAllowance {
        address receiver;
        uint amount;
    }

    event NewReceiverRegistered(address receiver, uint id);
    event ReducedUnallocatedSupply(uint newAllocatedAmount, uint unallocatedTotal);
    event UnallocatedSupplyIncreased(uint256 amount, uint unallocatedTotal);
    event IncreasedAllowance(address indexed receiver, uint increasedAmount);
    event EmissionScheduleSet(address emissionScheduler);
    event BoostDelegationSet(address indexed boostDelegate, bool isEnabled, uint feePct, address callback);

    constructor(
        address _addressProvider,
        IPrismaToken _token,
        ITokenLocker _locker,
        IIncentiveVoting _voter,
        IEmissionSchedule _emissionSchedule,
        IBoostCalculator _boostCalculator,
        address _stabilityPool,
        uint64 initialLockWeeks,
        uint128[] memory _fixedInitialAmounts,
        InitialAllowance[] memory initialAllowances
    ) PrismaOwnable(_addressProvider) SystemStart(_addressProvider) {
        prismaToken = _token;
        locker = _locker;
        voter = _voter;
        emissionSchedule = _emissionSchedule;
        boostCalculator = _boostCalculator;

        _token.approve(address(_locker), type(uint256).max);

        // ensure the stability pool is registered with receiver ID 0
        _voter.registerNewReceiver();
        idToReceiver[0] = _stabilityPool;
        emit NewReceiverRegistered(_stabilityPool, 0);

        for (uint i = 0; i < _fixedInitialAmounts.length; i++) {
            weeklyEmissions[i + 1] = _fixedInitialAmounts[i];
        }
        lockWeeks = initialLockWeeks;

        // set initial transfer allowances for airdrops, vests, bribes
        uint total;
        for (uint i = 0; i < initialAllowances.length; i++) {
            uint amount = initialAllowances[i].amount;
            address receiver = initialAllowances[i].receiver;
            total += amount;
            // initial allocations are given as approvals
            _token.increaseAllowance(receiver, amount);
            emit IncreasedAllowance(receiver, amount);
        }

        unallocatedTotal = uint128(_token.totalSupply() - total);
        lockToTokenRatio = _locker.lockToTokenRatio();

        emit ReducedUnallocatedSupply(total, unallocatedTotal);
    }

    /**
        @notice Register a new emission receiver
        @dev Once this function is called, the receiver ID is immediately
             eligible for votes within `IncentiveVoting`
        @param receiver Address of the receiver
        @param count Number of IDs to assign to the receiver
     */
    function registerReceiver(address receiver, uint count) external onlyOwner returns (bool) {
        uint[] memory assignedIds = new uint[](count);
        for (uint i = 0; i < count; i++) {
            uint id = voter.registerNewReceiver();
            assignedIds[i] = id;
            receiverUpdatedWeek[id] = uint16(getWeek());
            idToReceiver[id] = receiver;
            emit NewReceiverRegistered(receiver, id);
        }
        // notify the receiver contract of the newly registered ID
        // also serves as a sanity check to ensure the contract is capable of receiving emissions
        IEmissionReceiver(receiver).notifyRegisteredId(assignedIds);

        return true;
    }

    /**
        @notice Set the `emissionSchedule` contract
        @dev Callable only by the owner (the DAO admin voter, to change the emission schedule)
     */
    function setEmissionSchedule(IEmissionSchedule _emissionSchedule) external onlyOwner returns (bool) {
        emissionSchedule = _emissionSchedule;
        emit EmissionScheduleSet(address(_emissionSchedule));

        return true;
    }

    function setBoostCalculator(IBoostCalculator _boostCalculator) external onlyOwner returns (bool) {
        boostCalculator = _boostCalculator;

        return true;
    }

    /**
        @notice Transfer tokens out of the treasury
     */
    function transferTokens(IERC20 token, address receiver, uint amount) external onlyOwner returns (bool) {
        if (address(token) == address(prismaToken)) {
            uint unallocated = unallocatedTotal - amount;
            unallocatedTotal = uint128(unallocated);
            emit ReducedUnallocatedSupply(amount, unallocated);
        }
        token.safeTransfer(receiver, amount);

        return true;
    }

    /**
        @notice Receive PRISMA tokens and add them to the unallocated supply
     */
    function increaseUnallocatedSupply(uint amount) external returns (bool) {
        prismaToken.transferFrom(msg.sender, address(this), amount);
        uint128 unallocated = unallocatedTotal;
        unallocatedTotal = unallocated + uint128(amount);
        emit UnallocatedSupplyIncreased(amount, unallocated);

        return true;
    }

    /**
        @notice Allocate additional `prismaToken` allowance to an emission reciever
                based on the emission schedule
        @param id Receiver ID. The caller must be the receiver mapped to this ID.
        @return uint256 Additional `prismaToken` allowance for the receiver. The receiver
                        accesses the tokens using `Treasury.transferAllocatedTokens`
     */
    function allocateNewEmissions(uint id) external returns (uint256) {
        require(idToReceiver[id] == msg.sender, "Receiver not registered");
        uint receiverWeek = receiverUpdatedWeek[id];
        uint currentWeek = getWeek();
        if (receiverWeek == currentWeek) return 0;

        uint week = totalUpdateWeek;
        uint weeklyAmount;
        uint lock;
        while (week < currentWeek) {
            week++;
            weeklyAmount = weeklyEmissions[week];
            uint unallocated = unallocatedTotal;
            if (weeklyAmount == 0) {
                (weeklyAmount, lock) = emissionSchedule.getTotalWeeklyEmissions(week, unallocated);
                weeklyEmissions[week] = uint128(weeklyAmount);
                lockWeeks = uint64(lock);
            }
            unallocated -= weeklyAmount;
            unallocatedTotal = uint128(unallocated);

            // very unlikely that this function is not called at least weekly,
            // so we directly update the storage variable on each iteration
            totalUpdateWeek = uint64(week);

            emit ReducedUnallocatedSupply(weeklyAmount, unallocated);
        }

        uint amount;
        while (receiverWeek < currentWeek) {
            receiverWeek++;
            amount += emissionSchedule.getReceiverWeeklyEmissions(id, receiverWeek, weeklyAmount);
        }

        receiverUpdatedWeek[id] = uint16(currentWeek);
        if (amount > 0) allocated[msg.sender] += amount;
        emit IncreasedAllowance(msg.sender, amount);

        return amount;
    }

    /**
        @notice Transfer `prismaToken` tokens previously allocated to the caller
        @dev Callable only by registered receiver contracts which were previously
             allocated tokens using `allocateNewEmissions`.
        @param receiver Address to transfer tokens to
        @param amount Desired amount of tokens to transfer. This value always assumes max boost.
        @return uint256 Actual amount of tokens transferred, plus the sum left behind due to
                        insufficient boost. May be less than `amount` if tokens were locked.
     */
    function transferAllocatedTokens(address receiver, uint256 amount) external returns (uint256) {
        allocated[msg.sender] -= amount;
        amount += pendingRewardFor[msg.sender];
        if (amount > 0) {
            uint claimed = _transferAllocated(receiver, receiver, address(0), amount);
            pendingRewardFor[receiver] = amount - claimed;
        }

        return amount;
    }

    /**
        @notice Claim earned tokens from multiple reward contracts, optionally with delegated boost
        @param receiver Address to transfer tokens to. Any earned 3rd-party rewards
                        are also sent to this address.
        @param boostDelegate Address to delegate boost from during this claim. Set as
                             `address(0)` to use the boost of the claimer.
        @param rewardContracts Array of addresses of registered receiver contracts where
                               the caller has pending rewards to claim.
        @return uint256 Actual amount of tokens transferred, plus the sum left behind due to
                        insufficient boost. May be less than `amount` if tokens were locked.
     */
    function batchClaimRewards(
        address receiver,
        address boostDelegate,
        IRewards[] calldata rewardContracts
    ) external returns (uint256) {
        uint total = pendingRewardFor[msg.sender];
        uint length = rewardContracts.length;
        for (uint i = 0; i < length; i++) {
            uint amount = rewardContracts[i].treasuryClaimReward(msg.sender, receiver);
            allocated[address(rewardContracts[i])] -= amount;
            total += amount;
        }
        uint claimed = _transferAllocated(msg.sender, receiver, boostDelegate, total);
        pendingRewardFor[msg.sender] = total - claimed;
        return claimed;
    }

    function _transferAllocated(
        address account,
        address receiver,
        address boostDelegate,
        uint amount
    ) internal returns (uint256) {
        if (amount > 0) {
            uint week = getWeek();
            uint totalWeekly = weeklyEmissions[week];
            address claimant = boostDelegate == address(0) ? account : boostDelegate;
            uint previousAmount = accountWeeklyEarned[claimant][week];

            // if boost delegation is active, get the fee and optional callback address
            uint fee;
            IBoostDelegate delegateCallback;
            if (boostDelegate != address(0)) {
                Delegation memory data = boostDelegation[boostDelegate];
                delegateCallback = data.callback;
                require(data.isEnabled, "Invalid delegate");
                if (data.feePct == type(uint16).max) {
                    fee = delegateCallback.getFeePct(account, amount, previousAmount, totalWeekly);
                    require(fee <= 10000, "Invalid delegate fee");
                } else fee = data.feePct;
            }

            // calculate adjusted amount with actual boost applied
            uint adjustedAmount = boostCalculator.getBoostedAmountWrite(claimant, amount, previousAmount, totalWeekly);
            uint boostUnclaimed = amount - adjustedAmount;

            // apply boost delegation fee
            if (fee != 0) {
                fee = (adjustedAmount * fee) / 10000;
                adjustedAmount -= fee;
            }

            // transfer or lock tokens
            uint _lockWeeks = lockWeeks;
            if (_lockWeeks == 0) prismaToken.transfer(receiver, adjustedAmount);
            else {
                // if token lock ratio reduces amount to zero, do nothing
                uint lockAmount = adjustedAmount / lockToTokenRatio;
                if (lockAmount == 0) return 0;

                // lock for receiver, and adjust amounts based on token lock ratio
                locker.lock(receiver, lockAmount, _lockWeeks);
                adjustedAmount = lockAmount * lockToTokenRatio;
                amount = adjustedAmount + boostUnclaimed + fee;
            }

            // remaining tokens from unboosted claims are added to the unallocated total
            if (boostUnclaimed > 0) unallocatedTotal += uint128(boostUnclaimed);
            accountWeeklyEarned[claimant][week] = uint128(previousAmount + amount);

            // apply delegate fee and optionally perform callback
            if (fee != 0) pendingRewardFor[boostDelegate] += fee;
            if (address(delegateCallback) != address(0)) {
                require(
                    delegateCallback.delegatedBoostCallback(
                        account,
                        amount,
                        adjustedAmount,
                        fee,
                        previousAmount,
                        totalWeekly
                    ),
                    "Delegate callback rejected"
                );
            }
        }

        return amount;
    }

    /**
        @notice Claimable PRISMA amount for `account` in `rewardContract` after applying boost
        @dev Returns (0, 0) if the boost delegate is invalid, or the delgate's callback fee
             function is incorrectly configured.
        @param account Address claiming rewards
        @param boostDelegate Address to delegate boost from when claiming. Set as
                             `address(0)` to use the boost of the claimer.
        @param rewardContract Address of the contract where rewards are being claimed
        @return adjustedAmount Amount received after boost and delegate fees
        @return feeToDelegate Fee amount paid to `boostDelegate`

     */
    function claimableRewardAfterBoost(
        address account,
        address boostDelegate,
        IRewards rewardContract
    ) external view returns (uint256 adjustedAmount, uint256 feeToDelegate) {
        uint amount = rewardContract.claimableReward(account);
        uint week = getWeek();
        uint totalWeekly = weeklyEmissions[week];
        address claimant = boostDelegate == address(0) ? account : boostDelegate;
        uint previousAmount = accountWeeklyEarned[claimant][week];

        uint fee;
        if (boostDelegate != address(0)) {
            Delegation memory data = boostDelegation[boostDelegate];
            if (!data.isEnabled) return (0, 0);
            fee = data.feePct;
            if (fee == type(uint16).max) {
                try data.callback.getFeePct(claimant, amount, previousAmount, totalWeekly) returns (uint rfee) {
                    fee = rfee;
                    } catch {
                    return (0, 0);
                }
            }
            if (fee >= 10000) return (0, 0);
        }

        adjustedAmount = boostCalculator.getBoostedAmount(claimant, amount, previousAmount, totalWeekly);
        fee = (adjustedAmount * fee) / 10000;

        return (adjustedAmount, fee);
    }

    /**
        @notice Enable or disable boost delegation, and set boost delegation parameters
        @param isEnabled is boost delegation enabled?
        @param feePct Fee % charged when claims are made that delegate to the caller's boost.
                      Given as a whole number out of 10000. If set to type(uint16).max, the fee
                      is set by calling `IBoostDelegate(callback).getFeePct` prior to each claim.
        @param callback Optional contract address to receive a callback each time a claim is
                        made which delegates to the caller's boost.
     */
    function setBoostDelegationParams(bool isEnabled, uint feePct, address callback) external returns (bool) {
        if (isEnabled) {
            require(feePct <= 10000 || feePct == type(uint16).max, "Invalid feePct");
            if (callback != address(0) || feePct == type(uint16).max) {
                require(callback.isContract(), "Callback must be a contract");
            }
            boostDelegation[msg.sender] = Delegation({
                isEnabled: true,
                feePct: uint16(feePct),
                callback: IBoostDelegate(callback)
            });
        } else {
            delete boostDelegation[msg.sender];
        }
        emit BoostDelegationSet(msg.sender, isEnabled, feePct, callback);

        return true;
    }
}
