const AUTO_APPROVE_MAX_AMOUNT = 500;
const MIN_DAYS_BETWEEN_AUTO_ADVANCE = 2;
const ADVANCE_SALARY_RATIO = 0.5;

const SALARY_EXPENSE_CATEGORY = "Labour";
const SALARY_EXPENSE_SUBCATEGORY = "Salary Advance";

const getMonthKey = (dateInput = new Date()) => {
  const d = new Date(dateInput);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const parseMonthKey = (monthKey) => {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
};

const getMonthRangeFromKey = (monthKey) => {
  const { year, month } = parseMonthKey(monthKey);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate, year, month };
};

const daysBetween = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
};

const getLoanDeduction = (loan) => {
  if (!loan || loan.status !== "active" || loan.remainingBalance <= 0) return 0;
  return Math.min(loan.monthlyDeduction, loan.remainingBalance);
};

const sumApprovedAdvances = (advances) =>
  advances
    .filter((a) => a.status === "approved" || a.status === "auto_approved")
    .reduce((sum, a) => sum + a.amount, 0);

const buildWorkerSalarySnapshot = ({
  worker,
  loan,
  advances = [],
  payment = null,
  monthKey,
}) => {
  const grossSalary = Number(worker.monthlySalary) || 0;
  const loanDeduction = getLoanDeduction(loan);
  const netBeforeAdvance = Math.max(0, grossSalary - loanDeduction);
  const maxAdvance = netBeforeAdvance * ADVANCE_SALARY_RATIO;
  const totalAdvances = sumApprovedAdvances(advances);
  const pendingAdvances = advances.filter((a) => a.status === "pending");
  const pendingAdvanceAmount = pendingAdvances.reduce((sum, a) => sum + a.amount, 0);
  const remainingAdvanceLimit = Math.max(0, maxAdvance - totalAdvances - pendingAdvanceAmount);
  const remainingToPay = Math.max(0, netBeforeAdvance - totalAdvances);
  const paymentStatus = payment?.status || "pending";

  return {
    monthKey,
    grossSalary,
    loanDeduction,
    netBeforeAdvance,
    maxAdvance,
    totalAdvances,
    pendingAdvanceAmount,
    pendingAdvancesCount: pendingAdvances.length,
    remainingAdvanceLimit,
    remainingToPay,
    paymentStatus,
    paymentId: payment?._id || null,
    paidAt: payment?.paidAt || null,
    loan: loan
      ? {
          _id: loan._id,
          totalAmount: loan.totalAmount,
          monthlyDeduction: loan.monthlyDeduction,
          remainingBalance: loan.remainingBalance,
          status: loan.status,
        }
      : null,
  };
};

const canAutoApproveAdvance = ({ amount, lastAdvanceDate, today = new Date() }) => {
  if (amount > AUTO_APPROVE_MAX_AMOUNT) {
    return {
      autoApprove: false,
      reason: `Rs ${AUTO_APPROVE_MAX_AMOUNT} se zyada amount ke liye admin approval zaroori hai.`,
    };
  }

  if (lastAdvanceDate) {
    const gap = daysBetween(lastAdvanceDate, today);
    if (gap < MIN_DAYS_BETWEEN_AUTO_ADVANCE) {
      return {
        autoApprove: false,
        reason: `Har dusry din advance ke liye kam az kam ${MIN_DAYS_BETWEEN_AUTO_ADVANCE} din gap chahiye.`,
      };
    }
  }

  return { autoApprove: true, reason: null };
};

module.exports = {
  AUTO_APPROVE_MAX_AMOUNT,
  MIN_DAYS_BETWEEN_AUTO_ADVANCE,
  ADVANCE_SALARY_RATIO,
  SALARY_EXPENSE_CATEGORY,
  SALARY_EXPENSE_SUBCATEGORY,
  getMonthKey,
  parseMonthKey,
  getMonthRangeFromKey,
  daysBetween,
  getLoanDeduction,
  sumApprovedAdvances,
  buildWorkerSalarySnapshot,
  canAutoApproveAdvance,
};
