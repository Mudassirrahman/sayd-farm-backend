const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: null,
    },
    subSubcategory: {
      type: String,
      trim: true,
      default: null,
    },
    expenseDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
      default: null,
    },
    serialNo: { type: Number },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    linkedWorkerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      default: null,
    },
    payrollMonth: {
      type: String,
      match: /^\d{4}-\d{2}$/,
      default: null,
    },
    payrollPaymentType: {
      type: String,
      enum: ["salary", "advance", "loan"],
      default: null,
    },
    payrollLoanInstallment: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Expense", expenseSchema);
