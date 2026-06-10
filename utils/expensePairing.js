const Advance = require("../models/advance");
const Expense = require("../models/expense");

/** Remove expense and any admin-deduct auto-adjustment paired to it */
const deleteExpenseWithLinkedAdjustment = async (expenseId) => {
  await Advance.deleteMany({
    linkedExpense: expenseId,
    isAutoAdjustment: true,
  });
  return Expense.findByIdAndDelete(expenseId);
};

module.exports = { deleteExpenseWithLinkedAdjustment };
