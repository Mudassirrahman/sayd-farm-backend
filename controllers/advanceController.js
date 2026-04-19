const mongoose = require("mongoose");
const Advance = require("../models/advance");
const Expense = require("../models/expense");
const User = require("../models/user");

// 1. Admin kisi User ko Funds/Advance de
const addAdvance = async (req, res) => {
  try {
    const { user, amount, dateGiven, description } = req.body;

    const advance = new Advance({
      user,
      amount,
      dateGiven,
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
    // Sirf 'user' role walo ko fetch karein (Admin ko nahi)
    const users = await User.find({ role: "user" }).select("name email");

    const balances = await Promise.all(
      users.map(async (u) => {
        // Har user ka advance
        const adv = await Advance.aggregate([
          { $match: { user: u._id } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const totalAdv = adv.length > 0 ? adv[0].total : 0;

        // Har user ka kharcha
        const exp = await Expense.aggregate([
          { $match: { user: u._id } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const totalExp = exp.length > 0 ? exp[0].total : 0;

        return {
          userId: u._id,
          name: u.name,
          email: u.email,
          totalAdvance: totalAdv,
          totalExpense: totalExp,
          remainingBalance: totalAdv - totalExp,
        };
      }),
    );

    res.status(200).json({ balances });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch all balances", error: error.message });
  }
};

module.exports = {
  addAdvance,
  getUserBalance,
  getAllBalances,
};
