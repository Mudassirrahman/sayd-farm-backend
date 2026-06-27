const mongoose = require("mongoose");

const workerLoanSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    principalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyInstallment: {
      type: Number,
      required: true,
      min: 0,
    },
    startMonth: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    linkedExpenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

workerLoanSchema.index({ worker: 1, status: 1 });

module.exports = mongoose.model("WorkerLoan", workerLoanSchema);
