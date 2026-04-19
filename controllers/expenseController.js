const Expense = require("../models/expense");
const mongoose = require("mongoose");

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
    const { startDate, endDate, category, userId } = req.query;

    let query = {};

    if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.expenseDate.$lte = end;
      }
    }

    if (category) {
      query.category = category;
    }

    const currentUserId = req.user._id || req.user.userId || req.user.id;

    // ✅ FIX: User filter ki logic (Admin_self aur Manager ke hisaab se)
    if (userId === "admin_self") {
      query.user = new mongoose.Types.ObjectId(currentUserId);
    } else if (userId) {
      query.user = new mongoose.Types.ObjectId(userId);
    }

    const expensesList = await Expense.find(query)
      .populate("user", "name role")
      .sort({ expenseDate: -1 });

    // 1. Sab ka Total (Grand Total based on filter)
    const totalAmountAgg = await Expense.aggregate([
      { $match: query },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const grandTotal =
      totalAmountAgg.length > 0 ? totalAmountAgg[0].totalAmount : 0;

    let adminTotal = 0;
    let managerTotal = 0;

    // ✅ FIX: Calculation ko filter ke hisaab se theek kiya
    if (userId === "admin_self") {
      adminTotal = grandTotal;
      managerTotal = 0;
    } else if (userId) {
      // Agar Manager select kiya hai
      adminTotal = 0;
      managerTotal = grandTotal;
    } else {
      // Agar koi filter nahi laga to alag alag calculate karo
      const myExpensesAgg = await Expense.aggregate([
        {
          $match: {
            ...query,
            user: new mongoose.Types.ObjectId(currentUserId),
          },
        },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]);
      adminTotal = myExpensesAgg.length > 0 ? myExpensesAgg[0].totalAmount : 0;
      managerTotal = grandTotal - adminTotal;
    }

    // Category-wise Totals
    const categoryTotals = await Expense.aggregate([
      { $match: query },
      { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
      { $sort: { totalAmount: -1 } },
    ]);

    res.status(200).json({
      message: "Expenses fetched successfully",
      summary: {
        totalRecords: expensesList.length,
        grandTotal: grandTotal,
        adminTotal: adminTotal,
        managerTotal: managerTotal,
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
