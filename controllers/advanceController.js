const mongoose = require("mongoose");
const Advance = require("../models/advance");
const Expense = require("../models/expense");
const User = require("../models/user");

// 1. Admin kisi user ko, ya manager khud ko funds add kar sakta hai
const addAdvance = async (req, res) => {
  try {
    const { user, amount, dateGiven, description } = req.body;
    const amountNumber = Number(amount);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be a valid number greater than 0" });
    }

    // Manager sirf apne account mein credit add kar sakta hai
    // Admin kisi bhi manager ko add kar sakta hai
    let targetUserId = req.user._id;
    if (req.user.role === "admin" && user) {
      targetUserId = user;
    } else if (req.user.role !== "admin" && user && user !== String(req.user._id)) {
      return res.status(403).json({
        message: "You can only add funds to your own account.",
      });
    }

    const advance = new Advance({
      user: targetUserId,
      amount: amountNumber,
      dateGiven: dateGiven || new Date(),
      description,
      givenBy: req.user._id, // Token se Admin ki ID aayegi
    });

    await advance.save();
    res.status(201).json({ message: "Funds added successfully", advance });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add funds", error: error.message });
  }
};

// 1.5 Admin can update fund/advance entry
const updateAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, dateGiven, description } = req.body;

    const payload = {};
    if (amount !== undefined) payload.amount = Number(amount);
    if (dateGiven !== undefined) payload.dateGiven = dateGiven;
    if (description !== undefined) payload.description = description;

    if (
      payload.amount !== undefined &&
      (!Number.isFinite(payload.amount) || payload.amount <= 0)
    ) {
      return res
        .status(400)
        .json({ message: "Amount must be a valid number greater than 0" });
    }

    const updated = await Advance.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true, runValidators: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Fund entry not found" });
    }

    res.status(200).json({ message: "Fund entry updated successfully", advance: updated });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update fund entry", error: error.message });
  }
};

// 1.6 Admin can delete fund/advance entry
const deleteAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Advance.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Fund entry not found" });
    }

    res.status(200).json({ message: "Fund entry deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete fund entry", error: error.message });
  }
};

// 2. Sirf ek User ka Balance nikalna (Manager ke dashboard ke liye)
const getUserBalance = async (req, res) => {
  try {
    // Agar admin kisi aur ka dekh raha hai to params se ID laye, warna token se apni ID le
    const targetUserId = req.params.userId || req.user._id;

    // A. Total Advance received
    const advances = await Advance.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(targetUserId) } },
      { $group: { _id: null, totalAdvance: { $sum: "$amount" } } },
    ]);
    const totalAdvance = advances.length > 0 ? advances[0].totalAdvance : 0;

    // B. Total Expenses made by this user
    const expenses = await Expense.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(targetUserId) } },
      { $group: { _id: null, totalExpense: { $sum: "$amount" } } },
    ]);
    const totalExpense = expenses.length > 0 ? expenses[0].totalExpense : 0;

    // C. Remaining Balance
    const balance = totalAdvance - totalExpense;

    res.status(200).json({ totalAdvance, totalExpense, balance });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to calculate balance", error: error.message });
  }
};

// 3. Admin ke liye sab users ka mukammal hisaab lana
const getAllBalances = async (req, res) => {
  try {
    const [users, advTotals, expTotals] = await Promise.all([
      User.find({ role: "user" }).select("name email").lean(),
      Advance.aggregate([{ $group: { _id: "$user", total: { $sum: "$amount" } } }]),
      Expense.aggregate([{ $group: { _id: "$user", total: { $sum: "$amount" } } }]),
    ]);

    const advMap = new Map(advTotals.map((r) => [r._id.toString(), r.total]));
    const expMap = new Map(expTotals.map((r) => [r._id.toString(), r.total]));

    const balances = users.map((u) => {
      const totalAdv = advMap.get(u._id.toString()) || 0;
      const totalExp = expMap.get(u._id.toString()) || 0;
      return {
        userId: u._id,
        name: u.name,
        email: u.email,
        totalAdvance: totalAdv,
        totalExpense: totalExp,
        remainingBalance: totalAdv - totalExp,
      };
    });

    res.status(200).json({ balances });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch all balances", error: error.message });
  }
};

// 4. Admin ke liye funds breakdown:
//    (a) admin-added funds, (b) manager/user-added funds
const getFundsBreakdown = async (req, res) => {
  try {
    const allFunds = await Advance.find()
      .populate("user", "name role")
      .populate("givenBy", "name role")
      .sort({ dateGiven: -1, createdAt: -1 })
      .lean();

    const adminAddedFunds = allFunds.filter((entry) => entry?.givenBy?.role === "admin");
    const managerAddedFunds = allFunds.filter((entry) => entry?.givenBy?.role !== "admin");

    const totalAdminAdded = adminAddedFunds.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    );
    const totalManagerAdded = managerAddedFunds.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    );

    res.status(200).json({
      totals: {
        totalAdminAdded,
        totalManagerAdded,
      },
      adminAddedFunds,
      managerAddedFunds,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch funds breakdown",
      error: error.message,
    });
  }
};

module.exports = {
  addAdvance,
  updateAdvance,
  deleteAdvance,
  getUserBalance,
  getAllBalances,
  getFundsBreakdown,
};
