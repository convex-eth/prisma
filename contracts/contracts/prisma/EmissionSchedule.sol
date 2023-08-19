// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IIncentiveVoting.sol";
import "../interfaces/IPrismaVault.sol";
import "./PrismaOwnable.sol";
import "./SystemStart.sol";

contract EmissionSchedule is PrismaOwnable, SystemStart {
    event WeeklyPctScheduleSet(uint64[2][] schedule);
    event LockParametersSet(uint256 lockWeeks, uint256 lockDecayWeeks);

    IIncentiveVoting public immutable voter;
    IPrismaVault public immutable treasury;

    // current number of weeks that emissions are locked for when they are claimed
    uint64 public lockWeeks;
    // every `lockDecayWeeks`, the number of lock weeks is decreased by one
    uint64 public lockDecayWeeks;

    // percentage of the unallocated PRISMA supply given as emissions in a week
    uint64 public weeklyPct;

    // number representing 100% in `weeklyPct`
    uint256 constant MAX_PCT = 10000;
    uint256 public constant MAX_LOCK_WEEKS = 52;

    // [(week, weeklyPct)... ] ordered by week descending
    // schedule of changes to `weeklyPct` to be applied in future weeks
    uint64[2][] private scheduledWeeklyPct;

    constructor(
        address _addressProvider,
        IIncentiveVoting _voter,
        IPrismaVault _treasury,
        uint64 _initialLockWeeks,
        uint64 _lockDecayWeeks,
        uint64 _weeklyPct,
        uint64[2][] memory _scheduledWeeklyPct
    ) PrismaOwnable(_addressProvider) SystemStart(_addressProvider) {
        voter = _voter;
        treasury = _treasury;

        lockWeeks = _initialLockWeeks;
        lockDecayWeeks = _lockDecayWeeks;
        weeklyPct = _weeklyPct;
        _setWeeklyPctSchedule(_scheduledWeeklyPct);
        emit LockParametersSet(_initialLockWeeks, _lockDecayWeeks);
    }

    function getWeeklyPctSchedule() external view returns (uint64[2][] memory) {
        return scheduledWeeklyPct;
    }

    /**
        @notice Set a schedule for future updates to `weeklyPct`
        @dev The given schedule replaces any existing one
        @param _schedule Dynamic array of (week, weeklyPct) ordered by week descending
     */
    function setWeeklyPctSchedule(uint64[2][] memory _schedule) external onlyOwner returns (bool) {
        uint256 week = _setWeeklyPctSchedule(_schedule);
        require(week > getWeek(), "Cannot schedule past weeks");
        return true;
    }

    /**
        @notice Set the number of lock weeks and rate at which lock weeks decay
     */
    function setLockParameters(uint64 _lockWeeks, uint64 _lockDecayWeeks) external onlyOwner returns (bool) {
        require(_lockWeeks <= MAX_LOCK_WEEKS, "Cannot exceed MAX_LOCK_WEEKS");
        require(_lockDecayWeeks > 0, "Decay weeks cannot be 0");

        lockWeeks = _lockWeeks;
        lockDecayWeeks = _lockDecayWeeks;
        emit LockParametersSet(_lockWeeks, _lockDecayWeeks);
        return true;
    }

    function getReceiverWeeklyEmissions(uint id, uint week, uint totalWeeklyEmissions) external returns (uint256) {
        uint pct = voter.getReceiverVotePct(id, week);

        return (totalWeeklyEmissions * pct) / 1e18;
    }

    function getTotalWeeklyEmissions(uint week, uint unallocatedTotal) external returns (uint amount, uint lock) {
        require(msg.sender == address(treasury));

        // apply the lock week decay
        lock = lockWeeks;
        if (lock > 0 && week % lockDecayWeeks == 0) {
            lock -= 1;
            lockWeeks = uint64(lock);
        }

        // check for and apply scheduled update to `weeklyPct`
        uint length = scheduledWeeklyPct.length;
        uint pct = weeklyPct;
        if (length > 0) {
            uint64[2] memory nextUpdate = scheduledWeeklyPct[length - 1];
            if (nextUpdate[0] == week) {
                scheduledWeeklyPct.pop();
                pct = nextUpdate[1];
                weeklyPct = nextUpdate[1];
            }
        }

        // calculate the weekly emissions as a percentage of the unallocated supply
        amount = (unallocatedTotal * pct) / MAX_PCT;

        return (amount, lock);
    }

    function _setWeeklyPctSchedule(uint64[2][] memory _scheduledWeeklyPct) internal returns (uint256) {
        uint length = _scheduledWeeklyPct.length;
        uint week;
        for (uint i = 0; i < length; i++) {
            if (i == 0) {
                week = _scheduledWeeklyPct[0][0];
            } else {
                require(_scheduledWeeklyPct[i][0] < week, "Must sort by week descending");
                week = _scheduledWeeklyPct[i][0];
            }
            require(_scheduledWeeklyPct[i][1] <= MAX_PCT);
        }
        scheduledWeeklyPct = _scheduledWeeklyPct;
        emit WeeklyPctScheduleSet(_scheduledWeeklyPct);
        return week;
    }
}
