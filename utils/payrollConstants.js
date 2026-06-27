const PAYROLL = {
  DAYS_DIVISOR: 365 / 12,
  MONTHLY_LEAVE_ALLOWANCE: 4,
  UNAUTHORIZED_ADVANCE_LIMIT: 500,
  UNAUTHORIZED_ADVANCE_WINDOW_DAYS: 2,
  LABOUR_SUBCATEGORY_NAMES: ["labour"],
  SALARY_REMINDER_DAY: 15,
  PAYMENT_TYPES: ["salary", "advance", "loan"],
};

const toMoney = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const roundMoney = (value) => {
  const n = toMoney(value, 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const isLabourSubcategory = (subcategory) => {
  if (!subcategory) return false;
  const normalized = String(subcategory).trim().toLowerCase();
  return PAYROLL.LABOUR_SUBCATEGORY_NAMES.includes(normalized);
};

module.exports = {
  PAYROLL,
  toMoney,
  roundMoney,
  isLabourSubcategory,
};
