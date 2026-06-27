const Worker = require("../models/worker");
const WorkerAdvance = require("../models/workerAdvance");
const WorkerLoan = require("../models/workerLoan");
const { parseMonth } = require("../utils/dateUtils");
const {
  computePayrollBreakdown,
  recomputePayPeriod,
  recomputeAllWorkersForMonth,
} = require("../utils/payrollService");
const { PAYROLL } = require("../utils/payrollConstants");

const stripSalaryFromWorker = (worker, isAdmin) => {
  const obj = worker.toObject ? worker.toObject() : { ...worker };
  if (!isAdmin) {
    delete obj.monthlySalary;
    delete obj.salaryEffectiveFrom;
  }
  return obj;
};

const getPayrollDashboard = async (req, res) => {
  try {
    const { month } = req.query;
    const { year, month: monthNum } = parseMonth(month);
    const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;

    const workers = await Worker.find({ isActive: true }).sort({ name: 1 });
    const rows = [];

    for (const worker of workers) {
      await recomputePayPeriod(worker._id, monthKey);
      const breakdown = await computePayrollBreakdown(worker._id, monthKey);
      rows.push({
        worker: stripSalaryFromWorker(worker, true),
        ...breakdown,
        remainingPayable: breakdown.remainingPayable,
      });
    }

    res.status(200).json({
      message: "Payroll dashboard mili.",
      month: monthKey,
      reminderDay: PAYROLL.SALARY_REMINDER_DAY,
      data: rows,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Payroll dashboard fetch karne mein masla aaya.",
      error: error.message,
    });
  }
};

const getPayrollCalculate = async (req, res) => {
  try {
    const { workerId, month } = req.query;

    if (!workerId || !month) {
      return res.status(400).json({
        message: "workerId aur month (YYYY-MM) zaroori hain.",
      });
    }

    const breakdown = await computePayrollBreakdown(workerId, month);
    const isAdmin = req.user.role === "admin";

    if (!isAdmin) {
      breakdown.worker = {
        _id: breakdown.worker._id,
        name: breakdown.worker.name,
        role: breakdown.worker.role,
      };
    }

    res.status(200).json({
      message: "Payroll calculation mili.",
      data: breakdown,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Payroll calculate karne mein masla aaya.",
      error: error.message,
    });
  }
};

const setWorkerSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlySalary, salaryEffectiveFrom } = req.body;

    const salary = Number(monthlySalary);
    if (!Number.isFinite(salary) || salary < 0) {
      return res.status(400).json({ message: "Valid monthly salary zaroori hai." });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    worker.monthlySalary = salary;
    worker.salaryEffectiveFrom = salaryEffectiveFrom
      ? new Date(salaryEffectiveFrom)
      : new Date();
    await worker.save();

    const monthKey = `${worker.salaryEffectiveFrom.getUTCFullYear()}-${String(
      worker.salaryEffectiveFrom.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    await recomputePayPeriod(worker._id, monthKey);

    res.status(200).json({
      message: "Worker salary update ho gayi.",
      data: worker,
    });
  } catch (error) {
    res.status(500).json({
      message: "Salary update karne mein masla aaya.",
      error: error.message,
    });
  }
};

const approveWorkerAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status approved ya rejected hona chahiye." });
    }

    const advance = await WorkerAdvance.findById(id);
    if (!advance) {
      return res.status(404).json({ message: "Advance record nahi mila." });
    }

    advance.status = status;
    advance.approvedBy = req.user._id;
    await advance.save();

    await recomputePayPeriod(advance.worker, advance.payPeriodMonth);

    res.status(200).json({
      message: `Advance ${status} ho gaya.`,
      data: advance,
    });
  } catch (error) {
    res.status(500).json({
      message: "Advance update karne mein masla aaya.",
      error: error.message,
    });
  }
};

const getWorkerAdvances = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { month, status } = req.query;

    const query = { worker: workerId };
    if (month) query.payPeriodMonth = month;
    if (status) query.status = status;

    const advances = await WorkerAdvance.find(query)
      .populate("recordedBy", "name email role")
      .populate("approvedBy", "name email role")
      .sort({ requestDate: -1 });

    res.status(200).json({ message: "Advances mili.", data: advances });
  } catch (error) {
    res.status(500).json({
      message: "Advances fetch karne mein masla aaya.",
      error: error.message,
    });
  }
};

const updateWorkerLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlyInstallment, remainingBalance, status, note } = req.body;

    const loan = await WorkerLoan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: "Loan nahi mila." });
    }

    if (monthlyInstallment !== undefined) {
      const inst = Number(monthlyInstallment);
      if (!Number.isFinite(inst) || inst < 0) {
        return res.status(400).json({ message: "Valid installment zaroori hai." });
      }
      loan.monthlyInstallment = inst;
    }

    if (remainingBalance !== undefined) {
      const bal = Number(remainingBalance);
      if (!Number.isFinite(bal) || bal < 0) {
        return res.status(400).json({ message: "Valid remaining balance zaroori hai." });
      }
      loan.remainingBalance = bal;
    }

    if (status !== undefined) {
      if (!["active", "closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid loan status." });
      }
      loan.status = status;
    }

    if (note !== undefined) loan.note = note || null;

    if (loan.remainingBalance <= 0) loan.status = "closed";

    await loan.save();
    await recomputePayPeriod(loan.worker, loan.startMonth);

    res.status(200).json({ message: "Loan update ho gaya.", data: loan });
  } catch (error) {
    res.status(500).json({
      message: "Loan update karne mein masla aaya.",
      error: error.message,
    });
  }
};

const getWorkerLoans = async (req, res) => {
  try {
    const { workerId } = req.params;
    const query = { worker: workerId };
    if (req.query.status) query.status = req.query.status;

    const loans = await WorkerLoan.find(query)
      .populate("approvedBy", "name email role")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ message: "Loans mili.", data: loans });
  } catch (error) {
    res.status(500).json({
      message: "Loans fetch karne mein masla aaya.",
      error: error.message,
    });
  }
};

const recomputePayroll = async (req, res) => {
  try {
    const { month } = req.query;
    const { year, month: monthNum } = parseMonth(month);
    const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;

    await recomputeAllWorkersForMonth(monthKey);

    res.status(200).json({
      message: "Payroll sab workers ke liye recompute ho gaya.",
      month: monthKey,
    });
  } catch (error) {
    res.status(500).json({
      message: "Payroll recompute karne mein masla aaya.",
      error: error.message,
    });
  }
};

module.exports = {
  getPayrollDashboard,
  getPayrollCalculate,
  setWorkerSalary,
  approveWorkerAdvance,
  getWorkerAdvances,
  updateWorkerLoan,
  getWorkerLoans,
  recomputePayroll,
};
