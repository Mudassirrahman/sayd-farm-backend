const mongoose = require("mongoose");

const advanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    dateGiven: {
      type: Date,
      required: true,
    },
    givenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: {
      type: String,
    },

    // 🟢 NAYA: Taake pata chale yeh normal advance hai ya "Auto-Adjust" hua tha
    isAutoAdjustment: {
      type: Boolean,
      default: false,
    },
    // 🟢 NAYA: Agar Auto-Adjust hai to kis Expense entry ke badle mein hua tha?
    linkedExpense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Advance", advanceSchema);
