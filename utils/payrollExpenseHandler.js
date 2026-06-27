const { PAYROLL, roundMoney, isLabourSubcategory } = require("./payrollConstants");
const WorkerAdvance = require("../models/workerAdvance");
const WorkerLoan = require("../models/workerLoan");
const Worker = require("../models/worker");
const {
  computePayrollBreakdown,
  recomputePayPeriod,
  applySalaryPaymentSideEffects,
} = require("./payrollService");

const buildValidationError = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

const validateUnauthorizedAdvanceWindow = async (workerId, amount) => {
  const windowStart = new Date();
  windowStart.setUTCDate(
    windowStart.getUTCDate() - PAYROLL.UNAUTHORIZED_ADVANCE_WINDOW_DAYS
  );

  const recentSmallAdvances = await WorkerAdvance.find({
    worker: workerId,
    approvalType: "auto_small",
    status: { $in: ["approved", "pending"] },
    requestDate: { $gte: windowStart },
  });

  const recentTotal = recentSmallAdvances.reduce((sum, a) => sum + a.amount, 0);
  const newTotal = recentTotal + amount;

  if (amount > PAYROLL.UNAUTHORIZED_ADVANCE_LIMIT) {
    return {
      allowed: false,
      requiresApproval: true,
      message: `Bina approval ke maximum ${PAYROLL.UNAUTHORIZED_ADVANCE_LIMIT} PKR advance di ja sakti hai. Zyada ke liye admin approval zaroori hai.`,
    };
  }

  if (newTotal > PAYROLL.UNAUTHORIZED_ADVANCE_LIMIT) {
    return {
      allowed: false,
      requiresApproval: true,
      message: `Har ${PAYROLL.UNAUTHORIZED_ADVANCE_WINDOW_DAYS} din mein bina approval ke sirf ${PAYROLL.UNAUTHORIZED_ADVANCE_LIMIT} PKR advance di ja sakti hai.`,
    };
  }

  return { allowed: true, requiresApproval: false };
};

const validateLabourExpense = async (body, user) => {
  const {
    subcategory,
    linkedWorkerId,
    payrollPaymentType,
    payrollMonth,
    amount,
    monthlyInstallment,
  } = body;

  if (!isLabourSubcategory(subcategory)) {
    return { isLabour: false };
  }

  if (!linkedWorkerId) {
    throw buildValidationError("Labour expense ke liye worker select karna zaroori hai.");
  }

  if (!payrollPaymentType || !PAYROLL.PAYMENT_TYPES.includes(payrollPaymentType)) {
    throw buildValidationError(
      "Labour expense ke liye payment type select karein: salary, advance, ya loan."
    );
  }

  const worker = await Worker.findOne({ _id: linkedWorkerId, isActive: true });
  if (!worker) {
    throw buildValidationError("Active worker nahi mila.");
  }

  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw buildValidationError("Amount valid number honi chahiye.");
  }

  if (payrollPaymentType === "salary" || payrollPaymentType === "advance") {
    if (!payrollMonth || !/^\d{4}-\d{2}$/.test(payrollMonth)) {
      throw buildValidationError("Salary/advance ke liye month (YYYY-MM) zaroori hai.");
    }
  }

  if (payrollPaymentType === "salary") {
    if (!worker.monthlySalary || worker.monthlySalary <= 0) {
      throw buildValidationError(
        `${worker.name} ki monthly salary set nahi hai. Pehle Salary module se salary add karein.`
      );
    }

    const breakdown = await computePayrollBreakdown(linkedWorkerId, payrollMonth);

    if (amountNumber > breakdown.remainingPayable) {
      throw buildValidationError(
        `${worker.name} ki remaining salary ${breakdown.remainingPayable} PKR hai ` +
          `(Net: ${breakdown.netPayable}, Pehle se paid/pending: ` +
          `${breakdown.totalPaidApproved + breakdown.totalPaidPending}). ` +
          `Aap ${amountNumber} PKR add kar rahe hain jo zyada hai.`
      );
    }
  }

  if (payrollPaymentType === "advance") {
    const breakdown = await computePayrollBreakdown(linkedWorkerId, payrollMonth);
    const unauthorizedCheck = await validateUnauthorizedAdvanceWindow(
      linkedWorkerId,
      amountNumber
    );

    if (unauthorizedCheck.requiresApproval && user.role !== "admin") {
      if (!unauthorizedCheck.allowed) {
        throw buildValidationError(unauthorizedCheck.message);
      }
    }

    if (amountNumber > breakdown.maxApprovedAdvance) {
      throw buildValidationError(
        `${worker.name} ke liye maximum advance ${breakdown.maxApprovedAdvance} PKR hai ` +
          `(aadhi salary loan ke baad). Aap ${amountNumber} PKR add kar rahe hain.`
      );
    }
  }

  if (payrollPaymentType === "loan") {
    const installment = Number(monthlyInstallment);
    if (!Number.isFinite(installment) || installment <= 0) {
      throw buildValidationError("Loan ke liye monthly installment zaroori hai.");
    }
  }

  return { isLabour: true, worker };
};

const processLabourExpenseAfterSave = async (expense, user) => {
  if (!isLabourSubcategory(expense.subcategory) || !expense.linkedWorkerId) {
    return;
  }

  const { payrollPaymentType, payrollMonth, amount, linkedWorkerId } = expense;

  if (payrollPaymentType === "advance") {
    const unauthorizedCheck = await validateUnauthorizedAdvanceWindow(
      linkedWorkerId,
      amount
    );

    const advance = new WorkerAdvance({
      worker: linkedWorkerId,
      amount,
      requestDate: expense.expenseDate || new Date(),
      payPeriodMonth: payrollMonth,
      status:
        user.role === "admin" || !unauthorizedCheck.requiresApproval
          ? "approved"
          : "pending",
      approvalType: unauthorizedCheck.requiresApproval ? "admin" : "auto_small",
      approvedBy:
        user.role === "admin" || !unauthorizedCheck.requiresApproval
          ? user._id
          : null,
      recordedBy: user._id,
      linkedExpenseId: expense._id,
      note: expense.description || null,
    });
    await advance.save();
  }

  if (payrollPaymentType === "loan") {
    const installment = roundMoney(expense.payrollLoanInstallment);
    const loanAmount = roundMoney(amount);
    const activeLoan = await WorkerLoan.findOne({
      worker: linkedWorkerId,
      status: "active",
    });

    if (activeLoan) {
      activeLoan.principalAmount = roundMoney(activeLoan.principalAmount + loanAmount);
      activeLoan.remainingBalance = roundMoney(activeLoan.remainingBalance + loanAmount);
      if (installment > 0) {
        activeLoan.monthlyInstallment = installment;
      }
      await activeLoan.save();
    } else {
      const month =
        payrollMonth ||
        `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

      await WorkerLoan.create({
        worker: linkedWorkerId,
        principalAmount: loanAmount,
        remainingBalance: loanAmount,
        monthlyInstallment: installment,
        startMonth: month,
        status: "active",
        approvedBy: user._id,
        createdBy: user._id,
        linkedExpenseId: expense._id,
        note: expense.description || null,
      });
    }

    const recomputeMonth =
      payrollMonth ||
      `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    await recomputePayPeriod(linkedWorkerId, recomputeMonth);
    return;
  }

  if (payrollPaymentType === "salary" && payrollMonth) {
    if (expense.status === "approved") {
      await applySalaryPaymentSideEffects(expense);
    } else {
      await recomputePayPeriod(linkedWorkerId, payrollMonth);
    }
  } else if (payrollMonth) {
    await recomputePayPeriod(linkedWorkerId, payrollMonth);
  }
};

module.exports = {
  validateLabourExpense,
  processLabourExpenseAfterSave,
  isLabourSubcategory,
};
