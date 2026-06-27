const Worker = require("../models/worker");
const Attendance = require("../models/attendance");
const WorkerAdvance = require("../models/workerAdvance");
const WorkerLoan = require("../models/workerLoan");
const WorkerPayPeriod = require("../models/workerPayPeriod");
const Expense = require("../models/expense");
const { formatDateKey, parseMonth, getMonthRange } = require("./dateUtils");
const { isLabourSubcategory, roundMoney, toMoney } = require("./payrollConstants");
const {
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
} = require("./payrollCalculator");

const buildAttendanceMap = (records) => {
  const map = {};
  for (const record of records) {
    map[formatDateKey(record.date)] = {
      status: record.status,
      dayFraction: record.dayFraction,
      leaveType: record.leaveType || "regular",
    };
  }
  return map;
};

const sumSalaryExpenses = async (workerId, month) => {
  const expenses = await Expense.find({
    linkedWorkerId: workerId,
    payrollMonth: month,
    payrollPaymentType: "salary",
    subcategory: { $exists: true },
  }).lean();

  const labourExpenses = expenses.filter((e) => isLabourSubcategory(e.subcategory));

  let totalPaidApproved = 0;
  let totalPaidPending = 0;

  for (const exp of labourExpenses) {
    const amt = toMoney(exp.amount, 0);
    if (exp.status === "approved") totalPaidApproved += amt;
    else if (exp.status === "pending") totalPaidPending += amt;
  }

  return { totalPaidApproved, totalPaidPending };
};

const getActiveLoan = async (workerId) =>
  WorkerLoan.findOne({ worker: workerId, status: "active" }).sort({ createdAt: -1 });

const getApprovedAdvances = async (workerId) =>
  WorkerAdvance.find({ worker: workerId, status: "approved" }).sort({ requestDate: 1 });

const computePayrollBreakdown = async (workerId, monthKey) => {
  const worker = await Worker.findById(workerId);
  if (!worker) {
    const err = new Error("Worker nahi mila.");
    err.statusCode = 404;
    throw err;
  }

  const { year, month } = parseMonth(monthKey);
  const { startDate, endDate, dates, monthKey: resolvedMonth } = getMonthRange(year, month);

  const attendanceRecords = await Attendance.find({
    worker: workerId,
    date: { $gte: startDate, $lt: endDate },
  }).lean();

  const attendanceByDate = buildAttendanceMap(attendanceRecords);
  const todayKey = formatDateKey(new Date());
  const isCurrentMonth = resolvedMonth === todayKey.slice(0, 7);

  const attendanceStats = analyzeMonthAttendance(
    attendanceByDate,
    dates,
    todayKey,
    isCurrentMonth
  );

  const baseSalary = worker.monthlySalary || 0;
  const perDayRate = calcPerDayRate(baseSalary);
  const grossEarnedSalary = calcGrossEarnedSalary(
    perDayRate,
    attendanceStats.totalEarnedDayFraction
  );

  const existingPeriod = await WorkerPayPeriod.findOne({
    worker: workerId,
    month: resolvedMonth,
  }).lean();

  const activeLoan = await getActiveLoan(workerId);
  const loanDeduction = calcLoanDeduction(
    activeLoan,
    existingPeriod?.loanDeductedThisMonth || 0
  );

  const advances = await getApprovedAdvances(workerId);
  const advanceOutstanding = calcAdvanceOutstanding(advances);

  const netPayable = calcNetPayable(grossEarnedSalary, loanDeduction, advanceOutstanding);
  const maxApprovedAdvance = calcMaxApprovedAdvance(
    grossEarnedSalary,
    loanDeduction,
    advanceOutstanding
  );

  const { totalPaidApproved, totalPaidPending } = await sumSalaryExpenses(
    workerId,
    resolvedMonth
  );

  const remainingPayable = calcRemainingPayable(
    netPayable,
    totalPaidApproved,
    totalPaidPending
  );

  const paymentStatus = derivePaymentStatus(
    netPayable,
    totalPaidApproved,
    totalPaidPending
  );

  return {
    worker: {
      _id: worker._id,
      name: worker.name,
      role: worker.role,
      monthlySalary: baseSalary,
    },
    month: resolvedMonth,
    baseMonthlySalary: baseSalary,
    perDayRate,
    ...attendanceStats,
    grossEarnedSalary,
    loanDeduction,
    loanDeductedThisMonth: existingPeriod?.loanDeductedThisMonth || 0,
    advanceOutstanding,
    netPayable,
    maxApprovedAdvance,
    totalPaidApproved,
    totalPaidPending,
    remainingPayable,
    paymentStatus,
    showSalaryReminder: shouldShowSalaryReminder(resolvedMonth, paymentStatus),
    activeLoan: activeLoan
      ? {
          _id: activeLoan._id,
          remainingBalance: activeLoan.remainingBalance,
          monthlyInstallment: activeLoan.monthlyInstallment,
          status: activeLoan.status,
        }
      : null,
  };
};

const recomputePayPeriod = async (workerId, monthKey) => {
  const breakdown = await computePayrollBreakdown(workerId, monthKey);

  const payPeriod = await WorkerPayPeriod.findOneAndUpdate(
    { worker: workerId, month: breakdown.month },
    {
      worker: workerId,
      month: breakdown.month,
      baseMonthlySalary: roundMoney(breakdown.baseMonthlySalary),
      perDayRate: roundMoney(breakdown.perDayRate),
      fullDays: breakdown.fullDays || 0,
      halfDays: breakdown.halfDays || 0,
      absentDays: breakdown.absentDays || 0,
      leaveDays: breakdown.leaveDays || 0,
      adminApprovedLeaveDays: breakdown.adminApprovedLeaveDays || 0,
      excessLeaveDays: breakdown.excessLeaveDays || 0,
      unmarkedPastDays: breakdown.unmarkedPastDays || 0,
      paidLeaveDays: breakdown.paidLeaveDays || 0,
      totalEarnedDayFraction: roundMoney(breakdown.totalEarnedDayFraction),
      grossEarnedSalary: roundMoney(breakdown.grossEarnedSalary),
      loanDeduction: roundMoney(breakdown.loanDeduction),
      advanceOutstanding: roundMoney(breakdown.advanceOutstanding),
      netPayable: roundMoney(breakdown.netPayable),
      totalPaidApproved: roundMoney(breakdown.totalPaidApproved),
      totalPaidPending: roundMoney(breakdown.totalPaidPending),
      paymentStatus: breakdown.paymentStatus,
      lastCalculatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { breakdown, payPeriod };
};

const recomputeAllWorkersForMonth = async (monthKey) => {
  const workers = await Worker.find({ isActive: true }).select("_id");
  const results = [];
  for (const worker of workers) {
    results.push(await recomputePayPeriod(worker._id, monthKey));
  }
  return results;
};

const recoverAdvancesFIFO = async (workerId, amountToRecover) => {
  let remaining = amountToRecover;
  const advances = await WorkerAdvance.find({
    worker: workerId,
    status: "approved",
  }).sort({ requestDate: 1 });

  for (const advance of advances) {
    if (remaining <= 0) break;
    const outstanding = advance.amount - (advance.recoveredAmount || 0);
    if (outstanding <= 0) continue;

    const recover = Math.min(outstanding, remaining);
    advance.recoveredAmount = (advance.recoveredAmount || 0) + recover;
    await advance.save();
    remaining -= recover;
  }

  return amountToRecover - remaining;
};

const applySalaryPaymentSideEffects = async (expense) => {
  if (expense.status !== "approved") return;

  const workerId = expense.linkedWorkerId;
  const month = expense.payrollMonth;
  if (!workerId || !month) return;

  const payPeriod = await WorkerPayPeriod.findOne({ worker: workerId, month });
  const breakdown = await computePayrollBreakdown(workerId, month);

  const advanceToRecover = breakdown.advanceOutstanding;
  if (advanceToRecover > 0) {
    await recoverAdvancesFIFO(workerId, Math.min(advanceToRecover, expense.amount));
  }

  const activeLoan = await getActiveLoan(workerId);
  if (activeLoan && (payPeriod?.loanDeductedThisMonth || 0) === 0) {
    const deduction = calcLoanDeduction(activeLoan, 0);
    if (deduction > 0) {
      activeLoan.remainingBalance = Math.max(0, activeLoan.remainingBalance - deduction);
      if (activeLoan.remainingBalance <= 0) {
        activeLoan.status = "closed";
      }
      await activeLoan.save();

      if (payPeriod) {
        payPeriod.loanDeductedThisMonth = deduction;
        await payPeriod.save();
      }
    }
  }

  await recomputePayPeriod(workerId, month);
};

const reverseSalaryPaymentSideEffects = async (expense) => {
  const workerId = expense.linkedWorkerId;
  const month = expense.payrollMonth;
  if (!workerId || !month) return;

  const linkedAdvance = await WorkerAdvance.findOne({ linkedExpenseId: expense._id });
  if (linkedAdvance) {
    linkedAdvance.status = "rejected";
    await linkedAdvance.save();
  }

  await recomputePayPeriod(workerId, month);
};

module.exports = {
  computePayrollBreakdown,
  recomputePayPeriod,
  recomputeAllWorkersForMonth,
  recoverAdvancesFIFO,
  applySalaryPaymentSideEffects,
  reverseSalaryPaymentSideEffects,
  sumSalaryExpenses,
  getActiveLoan,
  getApprovedAdvances,
};
