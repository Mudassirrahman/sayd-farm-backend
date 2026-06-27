const { PAYROLL, roundMoney } = require("./payrollConstants");

/**
 * Analyze attendance for a month. Unmarked past days count as absent (salary cut).
 */
const analyzeMonthAttendance = (attendanceByDate, dates, todayKey, isCurrentMonth) => {
  const stats = {
    fullDays: 0,
    halfDays: 0,
    absentDays: 0,
    leaveDays: 0,
    adminApprovedLeaveDays: 0,
    excessLeaveDays: 0,
    unmarkedPastDays: 0,
    paidLeaveDays: 0,
    totalEarnedDayFraction: 0,
  };

  let regularLeaveCount = 0;

  for (const dateKey of dates) {
    if (isCurrentMonth && dateKey > todayKey) continue;

    const att = attendanceByDate[dateKey];

    if (!att) {
      if (dateKey <= todayKey) {
        stats.unmarkedPastDays += 1;
        stats.absentDays += 1;
      }
      continue;
    }

    switch (att.status) {
      case "full":
        stats.fullDays += 1;
        stats.totalEarnedDayFraction += 1;
        break;
      case "half":
        stats.halfDays += 1;
        stats.totalEarnedDayFraction += 0.5;
        break;
      case "absent":
        stats.absentDays += 1;
        break;
      case "leave":
        stats.leaveDays += 1;
        if (att.leaveType === "admin_approved") {
          stats.adminApprovedLeaveDays += 1;
          stats.paidLeaveDays += 1;
          stats.totalEarnedDayFraction += 1;
        } else {
          regularLeaveCount += 1;
          if (regularLeaveCount <= PAYROLL.MONTHLY_LEAVE_ALLOWANCE) {
            stats.paidLeaveDays += 1;
            stats.totalEarnedDayFraction += 1;
          } else {
            stats.excessLeaveDays += 1;
          }
        }
        break;
      default:
        break;
    }
  }

  stats.totalEarnedDayFraction = roundMoney(stats.totalEarnedDayFraction);
  return stats;
};

const calcPerDayRate = (monthlySalary) => {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  return roundMoney(monthlySalary / PAYROLL.DAYS_DIVISOR);
};

const calcGrossEarnedSalary = (perDayRate, totalEarnedDayFraction) =>
  roundMoney(perDayRate * totalEarnedDayFraction);

const calcLoanDeduction = (activeLoan, loanAlreadyDeductedThisMonth = 0) => {
  if (!activeLoan || activeLoan.status !== "active") return 0;

  const alreadyDeducted = Number(loanAlreadyDeductedThisMonth);
  if (Number.isFinite(alreadyDeducted) && alreadyDeducted > 0) return 0;

  const installment = Number(activeLoan.monthlyInstallment);
  const balance = Number(activeLoan.remainingBalance);
  if (!Number.isFinite(installment) || !Number.isFinite(balance)) return 0;
  if (installment <= 0 || balance <= 0) return 0;

  return roundMoney(Math.min(installment, balance));
};

const calcAdvanceOutstanding = (advances) => {
  return roundMoney(
    advances
      .filter((a) => a.status === "approved")
      .reduce((sum, a) => {
        const amount = Number(a.amount);
        const recovered = Number(a.recoveredAmount || 0);
        if (!Number.isFinite(amount)) return sum;
        return sum + Math.max(0, amount - (Number.isFinite(recovered) ? recovered : 0));
      }, 0)
  );
};

const calcNetPayable = (grossEarned, loanDeduction, advanceOutstanding) =>
  roundMoney(Math.max(0, grossEarned - loanDeduction - advanceOutstanding));

const calcMaxApprovedAdvance = (grossEarned, loanDeduction, advanceOutstanding) =>
  roundMoney(Math.max(0, (grossEarned - loanDeduction) / 2 - advanceOutstanding));

const derivePaymentStatus = (netPayable, totalPaidApproved, totalPaidPending) => {
  const totalCommitted = totalPaidApproved + totalPaidPending;
  if (netPayable <= 0 && totalPaidApproved <= 0) return "pending";
  if (totalPaidApproved >= netPayable && netPayable > 0) return "paid";
  if (totalCommitted > 0) return "partial";
  return "pending";
};

const calcRemainingPayable = (netPayable, totalPaidApproved, totalPaidPending) =>
  roundMoney(Math.max(0, netPayable - totalPaidApproved - totalPaidPending));

const shouldShowSalaryReminder = (monthKey, paymentStatus) => {
  if (paymentStatus === "paid") return false;
  const today = new Date();
  const day = today.getUTCDate();
  if (day < PAYROLL.SALARY_REMINDER_DAY) return false;
  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthKey === currentMonth;
};

module.exports = {
  analyzeMonthAttendance,
  calcPerDayRate,
  calcGrossEarnedSalary,
  calcLoanDeduction,
  calcAdvanceOutstanding,
  calcNetPayable,
  calcMaxApprovedAdvance,
  derivePaymentStatus,
  calcRemainingPayable,
  shouldShowSalaryReminder,
};
