const Expense = require("../models/expense");

const addExpense = async (req, res) => {
  try {
    const { itemName, amount, category, expenseDate, description } = req.body;

    if (!itemName || !amount || !category) {
      return res
        .status(400)
        .json({ message: "Item name, amount, and category are required" });
    }

    const newExpense = new Expense({
      user: req.user._id, 
      itemName,
      amount,
      category,
      expenseDate: expenseDate || Date.now(),
      description,
    });

    await newExpense.save();

    res.status(201).json({
      message: "Expense added successfully",
      data: newExpense,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add expense", error: error.message });
  }
};

const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;

    let query = {};

    if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = new Date(startDate); 
      if (endDate) query.expenseDate.$lte = new Date(endDate); 
    }

    if (category) {
      query.category = category;
    }

    const expensesList = await Expense.find(query)
      .populate("user", "name role") 
      .sort({ expenseDate: -1 });

    const totalAmountAgg = await Expense.aggregate([
      { $match: query },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const grandTotal =
      totalAmountAgg.length > 0 ? totalAmountAgg[0].totalAmount : 0;

    // 3. Get Category-wise Totals (Har category par kitna laga)
    const categoryTotals = await Expense.aggregate([
      { $match: query },
      { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
      { $sort: { totalAmount: -1 } }, // Ziada kharchay wali category upar
    ]);

    res.status(200).json({
      message: "Expenses fetched successfully",
      summary: {
        totalRecords: expensesList.length,
        grandTotal: grandTotal,
        categoryBreakdown: categoryTotals,
      },
      data: expensesList,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch expenses", error: error.message });
  }
};

// 3. UPDATE EXPENSE (Admin Only)
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { $set: req.body }, // req.body mein jo fields aayengi wo update ho jayengi
      { new: true, runValidators: true }, // naya data return karega aur validations check karega
    );

    if (!updatedExpense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json({
      message: "Expense updated successfully",
      data: updatedExpense,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update expense", error: error.message });
  }
};

// 4. DELETE EXPENSE (Admin Only)
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedExpense = await Expense.findByIdAndDelete(id);

    if (!deletedExpense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete expense", error: error.message });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
};
