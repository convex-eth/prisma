// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./DelegatedOps.sol";
import "./SystemStart.sol";
import "../interfaces/ITokenLocker.sol";

contract IncentiveVoting is DelegatedOps, SystemStart {
    uint public constant MAX_POINTS = 10000; // must be less than 2**16 or things will break
    uint256 public constant MAX_LOCK_WEEKS = 52; // must be the same as `MultiLocker`

    struct AccountData {
        // system week when the account's lock weights were registered
        // used to offset `weeksToUnlock` when calculating vote weight
        // as it decays over time
        uint16 week;
        // total registered vote weight, only recorded when frozen.
        // for unfrozen weight, recording the total is unnecessary because the
        // value decays. throughout the code, we check if frozenWeight > 0 as
        // a way to indicate if a lock is frozen.
        uint40 frozenWeight;
        uint16 points;
        uint8 lockLength; // length of activeVotes
        uint16 voteLength; // length of weeksToUnlock and lockedAmounts
        // array of [(receiver id, points), ... ] stored as uint16[2] for optimal packing
        uint16[2][MAX_POINTS] activeVotes;
        // arrays map to one another: lockedAmounts[0] unlocks in weeksToUnlock[0] weeks
        // values are sorted by time-to-unlock descending
        uint32[MAX_LOCK_WEEKS] lockedAmounts;
        uint8[MAX_LOCK_WEEKS] weeksToUnlock;
    }

    struct Vote {
        uint id;
        uint points;
    }

    struct LockData {
        uint amount;
        uint weeksToUnlock;
    }

    mapping(address => AccountData) accountLockData;

    uint public receiverCount;
    // id -> receiver data
    uint32[65535] public receiverDecayRate;
    uint16[65535] public receiverUpdatedWeek;
    // id -> week -> absolute vote weight
    uint40[65535][65535] receiverWeeklyWeights;
    // id -> week -> registered lock weight that is lost
    uint32[65535][65535] public receiverWeeklyUnlocks;

    uint32 public totalDecayRate;
    uint16 public totalUpdatedWeek;
    uint40[65535] totalWeeklyWeights;
    uint32[65535] public totalWeeklyUnlocks;

    ITokenLocker public immutable tokenLocker;
    address public immutable treasury;

    constructor(address _addressProvider, ITokenLocker _tokenLocker, address _treasury) SystemStart(_addressProvider) {
        tokenLocker = _tokenLocker;
        treasury = _treasury;
    }

    function getAccountRegisteredLocks(
        address account
    ) external view returns (uint frozenWeight, LockData[] memory lockData) {
        return (accountLockData[account].frozenWeight, _getAccountLocks(account));
    }

    function getAccountCurrentVotes(address account) public view returns (Vote[] memory votes) {
        votes = new Vote[](accountLockData[account].voteLength);
        uint16[2][MAX_POINTS] storage storedVotes = accountLockData[account].activeVotes;
        uint length = votes.length;
        for (uint i = 0; i < length; i++) {
            votes[i] = Vote({ id: storedVotes[i][0], points: storedVotes[i][1] });
        }
        return votes;
    }

    function getReceiverWeight(uint idx) external view returns (uint) {
        return getReceiverWeightAt(idx, getWeek());
    }

    function getReceiverWeightAt(uint idx, uint week) public view returns (uint) {
        if (idx >= receiverCount) return 0;
        uint rate = receiverDecayRate[idx];
        uint updatedWeek = receiverUpdatedWeek[idx];
        if (week <= updatedWeek) return receiverWeeklyWeights[idx][week];

        uint weight = receiverWeeklyWeights[idx][updatedWeek];
        if (weight == 0) return 0;

        while (updatedWeek < week) {
            updatedWeek++;
            weight -= rate;
            rate -= receiverWeeklyUnlocks[idx][updatedWeek];
        }

        return weight;
    }

    function getTotalWeight() external view returns (uint) {
        return getTotalWeightAt(getWeek());
    }

    function getTotalWeightAt(uint week) public view returns (uint) {
        uint rate = totalDecayRate;
        uint updatedWeek = totalUpdatedWeek;
        if (week <= updatedWeek) return totalWeeklyWeights[week];

        uint weight = totalWeeklyWeights[updatedWeek];
        if (weight == 0) return 0;

        while (updatedWeek < week) {
            updatedWeek++;
            weight -= rate;
            rate -= totalWeeklyUnlocks[updatedWeek];
        }
        return weight;
    }

    function getReceiverWeightWrite(uint idx) public returns (uint) {
        require(idx < receiverCount, "Invalid ID");
        uint week = getWeek();
        uint updatedWeek = receiverUpdatedWeek[idx];
        uint weight = receiverWeeklyWeights[idx][updatedWeek];

        if (weight == 0) {
            receiverUpdatedWeek[idx] = uint16(week);
            return 0;
        }

        uint rate = receiverDecayRate[idx];
        while (updatedWeek < week) {
            updatedWeek++;
            weight -= rate;
            receiverWeeklyWeights[idx][updatedWeek] = uint40(weight);
            rate -= receiverWeeklyUnlocks[idx][updatedWeek];
        }

        receiverDecayRate[idx] = uint32(rate);
        receiverUpdatedWeek[idx] = uint16(week);

        return weight;
    }

    function getTotalWeightWrite() public returns (uint) {
        uint week = getWeek();
        uint updatedWeek = totalUpdatedWeek;
        uint weight = totalWeeklyWeights[updatedWeek];

        if (weight == 0) {
            totalUpdatedWeek = uint16(week);
            return 0;
        }

        uint rate = totalDecayRate;
        while (updatedWeek < week) {
            updatedWeek++;
            weight -= rate;
            totalWeeklyWeights[updatedWeek] = uint40(weight);
            rate -= totalWeeklyUnlocks[updatedWeek];
        }

        totalDecayRate = uint32(rate);
        totalUpdatedWeek = uint16(week);

        return weight;
    }

    function getReceiverVotePct(uint id, uint week) external returns (uint) {
        week -= 1;
        getReceiverWeightWrite(id);
        getTotalWeightWrite();

        uint256 totalWeight = totalWeeklyWeights[week];
        if (totalWeight == 0) return 0;

        return (1e18 * uint(receiverWeeklyWeights[id][week])) / totalWeight;
    }

    function registerNewReceiver() external returns (uint) {
        require(msg.sender == treasury, "Not Treasury");
        uint id = receiverCount;
        receiverUpdatedWeek[id] = uint16(getWeek());
        receiverCount = id + 1;
        return id;
    }

    /**
        @notice Record the current lock weights for `account`, which can then
                be used to vote.
        @param minWeeks The minimum number of weeks-to-unlock to record weights
                        for. The more active lock weeks that are registered, the
                        more expensive it will be to vote. Accounts with many active
                        locks may wish to skip smaller locks to reduce gas costs.
     */
    function registerAccountWeight(address account, uint minWeeks) external callerOrDelegated(account) {
        Vote[] memory existingVotes = getAccountCurrentVotes(account);
        uint frozenWeight = accountLockData[account].frozenWeight;

        // if account has an active vote, clear the recorded vote
        // weights prior to updating the registered account weights
        _removeVoteWeights(account, existingVotes, frozenWeight);

        // get updated account lock weights and store locally
        frozenWeight = _registerAccountWeight(account, minWeeks);

        // resubmit the account's active vote using the newly registered weights
        _addVoteWeights(account, existingVotes, frozenWeight);
        // do not call `_storeAccountVotes` because the vote is unchanged
    }

    /**
        @notice Record the current lock weights for `account` and submit new votes
        @dev New votes replace any prior active votes
        @param minWeeks Minimum number of weeks-to-unlock to record weights for
        @param votes Array of tuples of (recipient id, vote points)
     */
    function registerAccountWeightAndVote(
        address account,
        uint minWeeks,
        Vote[] calldata votes
    ) external callerOrDelegated(account) {
        AccountData storage accountData = accountLockData[account];
        uint frozenWeight = accountData.frozenWeight;

        // if account has an active vote, clear the recorded vote
        // weights prior to updating the registered account weights
        _removeVoteWeights(account, getAccountCurrentVotes(account), frozenWeight);

        // get updated account lock weights and store locally
        frozenWeight = _registerAccountWeight(account, minWeeks);

        // adjust vote weights based on the account's new vote
        _addVoteWeights(account, votes, frozenWeight);
        // store the new account votes
        _storeAccountVotes(accountData, votes, 0, 0);
    }

    /**
        @notice Vote for one or more recipients
        @dev * Each voter can vote with up to `MAX_POINTS` points
             * It is not required to use every point in a single call
             * Votes carry over week-to-week and decay at the same rate as lock
               weight
             * The total weight is NOT distributed porportionally based on the
               points used, an account must allocate all points in order to use
               it's full vote weight
        @param votes Array of tuples of (recipient id, vote points)
        @param clearPrevious if true, the voter's current votes are cleared
                             prior to recording the new votes. If false, new
                             votes are added in addition to previous votes.
     */
    function vote(address account, Vote[] calldata votes, bool clearPrevious) external callerOrDelegated(account) {
        AccountData storage accountData = accountLockData[account];
        uint frozenWeight = accountData.frozenWeight;
        require(frozenWeight > 0 || accountData.lockLength > 0, "No registered weight");
        uint points;
        uint offset;

        // optionally clear previous votes
        if (clearPrevious) {
            _removeVoteWeights(account, getAccountCurrentVotes(account), frozenWeight);
        } else {
            points = accountData.points;
            offset = accountData.voteLength;
        }

        // adjust vote weights based on the new vote
        _addVoteWeights(account, votes, frozenWeight);
        // store the new account votes
        _storeAccountVotes(accountData, votes, points, offset);
    }

    /**
        @notice Remove all active votes for the caller
     */
    function clearVote(address account) external callerOrDelegated(account) {
        AccountData storage accountData = accountLockData[account];
        uint frozenWeight = accountData.frozenWeight;
        _removeVoteWeights(account, getAccountCurrentVotes(account), frozenWeight);
        accountData.voteLength = 0;
        accountData.points = 0;
    }

    /**
        @notice Set a frozen account weight as unfrozen
        @dev Callable only by the token locker. This prevents users from
             registering frozen locks, unfreezing, and having a larger registered
             vote weight than their actual lock weight.
     */
    function unfreeze(address account, bool keepVote) external returns (bool) {
        require(msg.sender == address(tokenLocker));
        AccountData storage accountData = accountLockData[account];
        uint frozenWeight = accountData.frozenWeight;

        // if frozenWeight == 0, the account was not registered so nothing needed
        if (frozenWeight > 0) {
            // clear previous votes
            Vote[] memory existingVotes = getAccountCurrentVotes(account);
            if (existingVotes.length > 0) {
                _removeVoteWeightsFrozen(existingVotes, frozenWeight);
            }

            accountData.week = uint16(getWeek());
            accountData.frozenWeight = 0;

            accountData.lockedAmounts[0] = uint32(frozenWeight / MAX_LOCK_WEEKS);
            accountData.weeksToUnlock[0] = uint8(MAX_LOCK_WEEKS);
            accountData.lockLength = 1;

            // optionally resubmit previous votes
            if (keepVote && existingVotes.length > 0) {
                _addVoteWeightsUnfrozen(account, existingVotes);
            } else {
                accountData.voteLength = 0;
                accountData.points = 0;
            }
        }
        return true;
    }

    /**
        @dev Get the current registered lock weights for `account`, as an array
             of [(amount, weeks to unlock)] sorted by weeks-to-unlock descending.
     */
    function _getAccountLocks(address account) internal view returns (LockData[] memory lockData) {
        AccountData storage accountData = accountLockData[account];

        uint length = accountData.lockLength;
        uint systemWeek = getWeek();
        uint accountWeek = accountData.frozenWeight > 0 ? systemWeek : accountData.week;
        uint8[MAX_LOCK_WEEKS] storage weeksToUnlock = accountData.weeksToUnlock;
        uint32[MAX_LOCK_WEEKS] storage amounts = accountData.lockedAmounts;

        lockData = new LockData[](length);
        uint idx;
        for (; idx < length; idx++) {
            uint unlockWeek = weeksToUnlock[idx] + accountWeek;
            if (unlockWeek <= systemWeek) {
                assembly {
                    mstore(lockData, idx)
                }
                break;
            }
            uint remainingWeeks = unlockWeek - systemWeek;
            uint amount = amounts[idx];
            lockData[idx] = LockData({ amount: amount, weeksToUnlock: remainingWeeks });
        }

        return lockData;
    }

    function _registerAccountWeight(address account, uint minWeeks) internal returns (uint) {
        AccountData storage accountData = accountLockData[account];

        // get updated account lock weights and store locally
        (ITokenLocker.LockData[] memory lockData, uint frozen) = tokenLocker.getAccountActiveLocks(account, minWeeks);
        uint length = lockData.length;
        if (frozen > 0) {
            frozen *= MAX_LOCK_WEEKS;
            accountData.frozenWeight = uint40(frozen);
        } else if (length > 0) {
            for (uint i = 0; i < length; i++) {
                uint amount = lockData[i].amount;
                uint weeksToUnlock = lockData[i].weeksToUnlock;
                accountData.lockedAmounts[i] = uint32(amount);
                accountData.weeksToUnlock[i] = uint8(weeksToUnlock);
            }
        } else {
            revert("No active locks");
        }
        accountData.week = uint16(getWeek());
        accountData.lockLength = uint8(length);

        return frozen;
    }

    function _storeAccountVotes(
        AccountData storage accountData,
        Vote[] calldata votes,
        uint points,
        uint offset
    ) internal {
        uint16[2][MAX_POINTS] storage storedVotes = accountData.activeVotes;
        uint length = votes.length;
        for (uint i = 0; i < length; i++) {
            storedVotes[offset + i] = [uint16(votes[i].id), uint16(votes[i].points)];
            points += votes[i].points;
        }
        require(points <= MAX_POINTS, "Exceeded max vote points");
        accountData.voteLength = uint16(offset + length);
        accountData.points = uint16(points);
    }

    /**
        @dev Increases receiver and total weights, using a vote array and the
             registered weights of `msg.sender`. Account related values are not
             adjusted, they must be handled in the calling function.
     */
    function _addVoteWeights(address account, Vote[] memory votes, uint frozenWeight) internal {
        if (votes.length > 0) {
            if (frozenWeight > 0) {
                _addVoteWeightsFrozen(votes, frozenWeight);
            } else {
                _addVoteWeightsUnfrozen(account, votes);
            }
        }
    }

    /**
        @dev Decreases receiver and total weights, using a vote array and the
             registered weights of `msg.sender`. Account related values are not
             adjusted, they must be handled in the calling function.
     */
    function _removeVoteWeights(address account, Vote[] memory votes, uint frozenWeight) internal {
        if (votes.length > 0) {
            if (frozenWeight > 0) {
                _removeVoteWeightsFrozen(votes, frozenWeight);
            } else {
                _removeVoteWeightsUnfrozen(account, votes);
            }
        }
    }

    /** @dev Should not be called directly, use `_addVoteWeights` */
    function _addVoteWeightsUnfrozen(address account, Vote[] memory votes) internal {
        LockData[] memory lockData = _getAccountLocks(account);
        uint lockLength = lockData.length;
        require(lockLength > 0, "Registered weight has expired");

        uint totalWeight;
        uint totalDecay;
        uint systemWeek = getWeek();
        uint[MAX_LOCK_WEEKS + 1] memory weeklyUnlocks;
        for (uint i = 0; i < votes.length; i++) {
            uint id = votes[i].id;
            uint points = votes[i].points;

            uint weight = 0;
            uint decayRate = 0;
            for (uint x = 0; x < lockLength; x++) {
                uint weeksToUnlock = lockData[x].weeksToUnlock;
                uint amount = (lockData[x].amount * points) / MAX_POINTS;
                receiverWeeklyUnlocks[id][systemWeek + weeksToUnlock] += uint32(amount);

                weeklyUnlocks[weeksToUnlock] += uint32(amount);
                weight += amount * weeksToUnlock;
                decayRate += amount;
            }
            receiverWeeklyWeights[id][systemWeek] = uint40(getReceiverWeightWrite(id) + weight);
            receiverDecayRate[id] += uint32(decayRate);

            totalWeight += weight;
            totalDecay += decayRate;
        }

        for (uint i = 0; i < lockLength; i++) {
            uint weeksToUnlock = lockData[i].weeksToUnlock;
            totalWeeklyUnlocks[systemWeek + weeksToUnlock] += uint32(weeklyUnlocks[weeksToUnlock]);
        }
        totalWeeklyWeights[systemWeek] = uint40(getTotalWeightWrite() + totalWeight);
        totalDecayRate += uint32(totalDecay);
    }

    /** @dev Should not be called directly, use `_addVoteWeights` */
    function _addVoteWeightsFrozen(Vote[] memory votes, uint frozenWeight) internal {
        uint systemWeek = getWeek();
        uint totalWeight;
        uint length = votes.length;
        for (uint i = 0; i < length; i++) {
            uint id = votes[i].id;
            uint points = votes[i].points;

            uint weight = (frozenWeight * points) / MAX_POINTS;

            receiverWeeklyWeights[id][systemWeek] = uint40(getReceiverWeightWrite(id) + weight);
            totalWeight += weight;
        }

        totalWeeklyWeights[systemWeek] = uint40(getTotalWeightWrite() + totalWeight);
    }

    /** @dev Should not be called directly, use `_removeVoteWeights` */
    function _removeVoteWeightsUnfrozen(address account, Vote[] memory votes) internal {
        LockData[] memory lockData = _getAccountLocks(account);
        uint lockLength = lockData.length;

        uint totalWeight;
        uint totalDecay;
        uint systemWeek = getWeek();
        uint[MAX_LOCK_WEEKS + 1] memory weeklyUnlocks;

        for (uint i = 0; i < votes.length; i++) {
            (uint id, uint points) = (votes[i].id, votes[i].points);

            uint weight = 0;
            uint decayRate = 0;
            for (uint x = 0; x < lockLength; x++) {
                uint weeksToUnlock = lockData[x].weeksToUnlock;
                uint amount = (lockData[x].amount * points) / MAX_POINTS;
                receiverWeeklyUnlocks[id][systemWeek + weeksToUnlock] -= uint32(amount);

                weeklyUnlocks[weeksToUnlock] += uint32(amount);
                weight += amount * weeksToUnlock;
                decayRate += amount;
            }
            receiverWeeklyWeights[id][systemWeek] = uint40(getReceiverWeightWrite(id) - weight);
            receiverDecayRate[id] -= uint32(decayRate);

            totalWeight += weight;
            totalDecay += decayRate;
        }

        for (uint i = 0; i < lockLength; i++) {
            uint weeksToUnlock = lockData[i].weeksToUnlock;
            totalWeeklyUnlocks[systemWeek + weeksToUnlock] -= uint32(weeklyUnlocks[weeksToUnlock]);
        }
        totalWeeklyWeights[systemWeek] = uint40(getTotalWeightWrite() - totalWeight);
        totalDecayRate -= uint32(totalDecay);
    }

    /** @dev Should not be called directly, use `_removeVoteWeights` */
    function _removeVoteWeightsFrozen(Vote[] memory votes, uint frozenWeight) internal {
        uint systemWeek = getWeek();

        uint totalWeight;
        uint length = votes.length;
        for (uint i = 0; i < length; i++) {
            (uint id, uint points) = (votes[i].id, votes[i].points);

            uint weight = (frozenWeight * points) / MAX_POINTS;

            receiverWeeklyWeights[id][systemWeek] = uint40(getReceiverWeightWrite(id) - weight);

            totalWeight += weight;
        }

        totalWeeklyWeights[systemWeek] = uint40(getTotalWeightWrite() - totalWeight);
    }
}
