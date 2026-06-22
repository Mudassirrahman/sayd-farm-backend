/**
 * Normalize a date input to UTC midnight for consistent daily attendance keys.
 * Accepts ISO string (YYYY-MM-DD) or Date object.
 */
const normalizeToDay = (dateInput) => {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const formatDateKey = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseMonth = (monthInput) => {
  if (monthInput && /^\d{4}-\d{2}$/.test(monthInput)) {
    const [year, month] = monthInput.split("-").map(Number);
    return { year, month };
  }

  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
};

const getMonthRange = (year, month) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) =>
    formatDateKey(new Date(Date.UTC(year, month - 1, i + 1)))
  );
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  return { startDate, endDate, daysInMonth, dates, monthKey };
};

module.exports = { normalizeToDay, formatDateKey, parseMonth, getMonthRange };
