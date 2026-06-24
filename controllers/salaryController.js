const Worker = require("../models/worker");
const WorkerLoan = require("../models/workerLoan");
const SalaryAdvance = require("../models/salaryAdvance");
const SalaryPayment = require("../models/salaryPayment");
const Expense = require("../models/expense");
const {
  getMonthKey,
  getMonthRangeFromKey,
  buildWorkerSalarySnapshot,
  canAutoApproveAdvance,
  SALARY_EXPENSE_CATEGORY,
  SALARY_EXPENSE_SUBCATEGORY,
} = require("../utils/salaryUtils");

const PAYROLL_REMINDER_DAY = 15;

const loadWorkerMonthData = async (workerIds, monthKey) => {
  const [loans, advances, payments] = await Promise.all([
    WorkerLoan.find({ worker: { $in: workerIds }, status: "active" }),
    SalaryAdvance.find({ worker: { $in: workerIds }, monthKey }).populate(
      "givenBy",
      "name email role"
    ),
    SalaryPayment.find({ worker: { $in: workerIds }, monthKey }),
  ]);

  const loanByWorker = new Map(loans.map((l) => [String(l.worker), l]));
  const advancesByWorker = new Map();
  for (const adv of advances) {
    const key = String(adv.worker);
    if (!advancesByWorker.has(key)) advancesByWorker.set(key, []);
    advancesByWorker.get(key).push(adv);
  }
  const paymentByWorker = new Map(payments.map((p) => [String(p.worker), p]));

  return { loanByWorker, advancesByWorker, paymentByWorker };
};

const createAdvanceExpense = async ({
  userId,
  createdBy,
  worker,
  amount,
  dateGiven,
  description,
  advanceStatus,
}) => {
  const dateObj = new Date(dateGiven || Date.now());
  const firstDayOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
  const lastDayOfMonth = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const lastExpense = await Expense.findOne({
    expenseDate: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
  }).sort({ serialNo: -1 });

  const expense = new Expense({
    user: userId,
    createdBy,
    itemName: `Salary Advance — ${worker.name}`,
    amount,
    category: SALARY_EXPENSE_CATEGORY,
    subcategory: SALARY_EXPENSE_SUBCATEGORY,
    expenseDate: dateObj,
    description:
      description ||
      `Worker: ${worker.name} (${worker.role}) — Salary advance`,
    serialNo: lastExpense?.serialNo ? lastExpense.serialNo + 1 : 1,
    status:
      advanceStatus === "approved" || advanceStatus === "auto_approved"
        ? "approved"
        : "pending",
  });

  await expense.save();
  return expense;
};

const getMonthlySalary = async (req, res) => {
  try {
    const monthKey = req.query.month || getMonthKey();
    const workers = await Worker.find({ isActive: true }).sort({ name: 1 });

    const workerIds = workers.map((w) => w._id);
    const { loanByWorker, advancesByWorker, paymentByWorker } =
      await loadWorkerMonthData(workerIds, monthKey);

    const data = workers.map((worker) => {
      const id = String(worker._id);
      const advances = advancesByWorker.get(id) || [];
      const snapshot = buildWorkerSalarySnapshot({
        worker,
        loan: loanByWorker.get(id) || null,
        advances,
        payment: paymentByWorker.get(id) || null,
        monthKey,
      });

      return {
        worker: {
          _id: worker._id,
          name: worker.name,
          role: worker.role,
          monthlySalary: worker.monthlySalary,
        },
        snapshot,
        advances,
      };
    });

    const today = new Date();
    const showPayrollReminder = today.getDate() >= PAYROLL_REMINDER_DAY;
    const pendingPayments = data.filter(
      (row) => row.snapshot.paymentStatus === "pending" && row.snapshot.grossSalary > 0
    ).length;
    const pendingAdvanceApprovals = data.reduce(
      (sum, row) => sum + row.snapshot.pendingAdvancesCount,
      0
    );

    res.status(200).json({
      message: "Mahana salary summary mili.",
      month: monthKey,
      showPayrollReminder,
      pendingPayments,
      pendingAdvanceApprovals,
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Salary summary fetch karne mein masla aaya.",
      error: error.message,
    });
  }
};

const getPendingIndicator = async (req, res) => {
  try {
    const monthKey = req.query.month || getMonthKey();
    const today = new Date();
    const showPayrollReminder = today.getDate() >= PAYROLL_REMINDER_DAY;

    if (!showPayrollReminder) {
      return res.status(200).json({
        showPayrollReminder: false,
        pendingPayments: 0,
        pendingAdvanceApprovals: 0,
      });
    }

    const workers = await Worker.find({ isActive: true, monthlySalary: { $gt: 0 } });
    const workerIds = workers.map((w) => w._id);
    const { advancesByWorker, paymentByWorker } = await loadWorkerMonthData(
      workerIds,
      monthKey
    );

    let pendingPayments = 0;
    let pendingAdvanceApprovals = 0;

    for (const worker of workers) {
      const id = String(worker._id);
      const payment = paymentByWorker.get(id);
      if (!payment || payment.status === "pending") pendingPayments += 1;

      const advances = advancesByWorker.get(id) || [];
      pendingAdvanceApprovals += advances.filter((a) => a.status === "pending").length;
    }

    res.status(200).json({
      showPayrollReminder: true,
      month: monthKey,
      pendingPayments,
      pendingAdvanceApprovals,
      totalPending: pendingPayments + pendingAdvanceApprovals,
    });
  } catch (error) {
    res.status(500).json({
      message: "Pending indicator fetch karne mein masla aaya.",
      error: error.message,
    });
  }
};

const createSalaryAdvance = async (req, res) => {
  try {
    const { workerId, amount, dateGiven, description, requestLumpSum } = req.body;
    const amountNumber = Number(amount);

    if (!workerId || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        message: "Worker aur valid amount zaroori hai.",
      });
    }

    const worker = await Worker.findOne({ _id: workerId, isActive: true });
    if (!worker) {
      return res.status(404).json({ message: "Active worker nahi mila." });
    }

    if (!worker.monthlySalary || worker.monthlySalary <= 0) {
      return res.status(400).json({
        message: "Pehle is worker ki monthly salary set karein (admin).",
      });
    }

    const monthKey = getMonthKey(dateGiven || new Date());
    const { loanByWorker, advancesByWorker, paymentByWorker } =
      await loadWorkerMonthData([worker._id], monthKey);

    const id = String(worker._id);
    const advances = advancesByWorker.get(id) || [];
    const payment = paymentByWorker.get(id);

    if (payment?.status === "paid") {
      return res.status(400).json({
        message: "Is mahine ki salary already paid mark ho chuki hai.",
      });
    }

    const snapshot = buildWorkerSalarySnapshot({
      worker,
      loan: loanByWorker.get(id) || null,
      advances,
      payment,
      monthKey,
    });

    if (amountNumber > snapshot.remainingAdvanceLimit) {
      return res.status(400).json({
        message: `Advance limit exceed ho gayi. Baqi limit: Rs ${snapshot.remainingAdvanceLimit}`,
        snapshot,
      });
    }

    const lastApproved = await SalaryAdvance.findOne({
      worker: workerId,
      status: { $in: ["approved", "auto_approved"] },
    }).sort({ dateGiven: -1 });

    let advanceStatus = "pending";
    let approvalReason = null;

    const autoCheck = canAutoApproveAdvance({
      amount: amountNumber,
      lastAdvanceDate: lastApproved?.dateGiven,
      today: new Date(dateGiven || Date.now()),
    });

    if (
      !requestLumpSum &&
      autoCheck.autoApprove &&
      amountNumber <= snapshot.remainingAdvanceLimit
    ) {
      advanceStatus = "auto_approved";
    } else {
      approvalReason =
        autoCheck.reason ||
        (requestLumpSum
          ? "Ekathha / zyada advance ke liye admin approval zaroori hai."
          : "Admin approval zaroori hai.");
    }

    const expense = await createAdvanceExpense({
      userId: req.user._id,
      createdBy: req.user._id,
      worker,
      amount: amountNumber,
      dateGiven,
      description,
      advanceStatus,
    });

    const advance = new SalaryAdvance({
      worker: workerId,
      amount: amountNumber,
      monthKey,
      dateGiven: new Date(dateGiven || Date.now()),
      givenBy: req.user._id,
      description: description || null,
      status: advanceStatus,
      approvalNote: approvalReason,
      linkedExpense: expense._id,
    });

    await advance.save();

    const populated = await SalaryAdvance.findById(advance._id)
      .populate("worker", "name role monthlySalary")
      .populate("givenBy", "name email role")
      .populate("linkedExpense");

    res.status(201).json({
      message:
        advanceStatus === "auto_approved"
          ? "Advance approve ho kar expense mein add ho gaya."
          : "Advance request admin approval ke liye bhej di gayi.",
      data: populated,
      needsApproval: advanceStatus === "pending",
    });
  } catch (error) {
    res.status(500).json({
      message: "Advance create karne mein masla aaya.",
      error: error.message,
    });
  }
};

const approveSalaryAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const advance = await SalaryAdvance.findById(id).populate("worker");

    if (!advance) {
      return res.status(404).json({ message: "Advance request nahi mili." });
    }

    if (advance.status !== "pending") {
      return res.status(400).json({ message: "Yeh advance pehle se process ho chuki hai." });
    }

    advance.status = "approved";
    advance.approvedBy = req.user._id;
    advance.approvalNote = req.body.note || "Admin ne approve kiya.";
    await advance.save();

    if (advance.linkedExpense) {
      await Expense.findByIdAndUpdate(advance.linkedExpense, { status: "approved" });
    }

    const populated = await SalaryAdvance.findById(id)
      .populate("worker", "name role monthlySalary")
      .populate("givenBy", "name email role")
      .populate("approvedBy", "name email role");

    res.status(200).json({ message: "Advance approve ho gaya.", data: populated });
  } catch (error) {
    res.status(500).json({
      message: "Advance approve karne mein masla aaya.",
      error: error.message,
    });
  }
};

const rejectSalaryAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const advance = await SalaryAdvance.findById(id);

    if (!advance) {
      return res.status(404).json({ message: "Advance request nahi mili." });
    }

    if (advance.status !== "pending") {
      return res.status(400).json({ message: "Yeh advance pehle se process ho chuki hai." });
    }

    advance.status = "rejected";
    advance.approvedBy = req.user._id;
    advance.approvalNote = req.body.note || "Admin ne reject kiya.";
    await advance.save();

    if (advance.linkedExpense) {
      await Expense.findByIdAndUpdate(advance.linkedExpense, { status: "rejected" });
    }

    res.status(200).json({ message: "Advance reject ho gaya." });
  } catch (error) {
    res.status(500).json({
      message: "Advance reject karne mein masla aaya.",
      error: error.message,
    });
  }
};

const createWorkerLoan = async (req, res) => {
  try {
    const { workerId, totalAmount, monthlyDeduction, note } = req.body;
    const total = Number(totalAmount);
    const monthly = Number(monthlyDeduction);

    if (!workerId || !Number.isFinite(total) || total <= 0 || !Number.isFinite(monthly) || monthly <= 0) {
      return res.status(400).json({
        message: "Worker, total loan amount aur monthly deduction zaroori hain.",
      });
    }

    const worker = await Worker.findOne({ _id: workerId, isActive: true });
    if (!worker) {
      return res.status(404).json({ message: "Active worker nahi mila." });
    }

    const existingLoan = await WorkerLoan.findOne({ worker: workerId, status: "active" });
    if (existingLoan) {
      return res.status(400).json({
        message: "Is worker ka pehle se active loan maujood hai.",
      });
    }

    const loan = new WorkerLoan({
      worker: workerId,
      totalAmount: total,
      monthlyDeduction: monthly,
      remainingBalance: total,
      note: note || null,
      createdBy: req.user._id,
    });

    await loan.save();

    const populated = await WorkerLoan.findById(loan._id)
      .populate("worker", "name role monthlySalary")
      .populate("createdBy", "name email role");

    res.status(201).json({ message: "Loan add ho gaya.", data: populated });
  } catch (error) {
    res.status(500).json({
      message: "Loan create karne mein masla aaya.",
      error: error.message,
    });
  }
};

const setWorkerSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlySalary } = req.body;
    const salary = Number(monthlySalary);

    if (!Number.isFinite(salary) || salary < 0) {
      return res.status(400).json({ message: "Valid monthly salary chahiye." });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    worker.monthlySalary = salary;
    await worker.save();

    res.status(200).json({
      message: "Monthly salary update ho gayi.",
      data: worker,
    });
  } catch (error) {
    res.status(500).json({
      message: "Salary update karne mein masla aaya.",
      error: error.message,
    });
  }
};

const markSalaryPaid = async (req, res) => {
  try {
    const { workerId } = req.params;
    const monthKey = req.body.month || getMonthKey();
    const { note } = req.body;

    const worker = await Worker.findOne({ _id: workerId, isActive: true });
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    const { loanByWorker, advancesByWorker, paymentByWorker } =
      await loadWorkerMonthData([worker._id], monthKey);

    const id = String(worker._id);
    const advances = advancesByWorker.get(id) || [];
    const loan = loanByWorker.get(id) || null;
    const existingPayment = paymentByWorker.get(id);

    if (existingPayment?.status === "paid") {
      return res.status(400).json({ message: "Is mahine ki salary pehle se paid hai." });
    }

    const snapshot = buildWorkerSalarySnapshot({
      worker,
      loan,
      advances,
      payment: existingPayment,
      monthKey,
    });

    const payment = await SalaryPayment.findOneAndUpdate(
      { worker: workerId, monthKey },
      {
        worker: workerId,
        monthKey,
        grossSalary: snapshot.grossSalary,
        loanDeduction: snapshot.loanDeduction,
        totalAdvances: snapshot.totalAdvances,
        netPayable: snapshot.remainingToPay,
        status: "paid",
        paidAt: new Date(),
        paidBy: req.user._id,
        note: note || null,
      },
      { upsert: true, new: true, runValidators: true }
    );

    if (loan && snapshot.loanDeduction > 0) {
      loan.remainingBalance = Math.max(0, loan.remainingBalance - snapshot.loanDeduction);
      if (loan.remainingBalance <= 0) {
        loan.remainingBalance = 0;
        loan.status = "completed";
      }
      await loan.save();
    }

    res.status(200).json({
      message: "Salary paid mark ho gayi.",
      data: payment,
    });
  } catch (error) {
    res.status(500).json({
      message: "Salary paid mark karne mein masla aaya.",
      error: error.message,
    });
  }
};

module.exports = {
  getMonthlySalary,
  getPendingIndicator,
  createSalaryAdvance,
  approveSalaryAdvance,
  rejectSalaryAdvance,
  createWorkerLoan,
  setWorkerSalary,
  markSalaryPaid,
};
