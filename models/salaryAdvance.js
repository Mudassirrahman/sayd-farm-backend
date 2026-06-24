const mongoose = require("mongoose");

const salaryAdvanceSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    monthKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
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
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["auto_approved", "approved", "pending", "rejected"],
      default: "pending",
    },
    approvalNote: {
      type: String,
      trim: true,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    linkedExpense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
      default: null,
    },
  },
  { timestamps: true }
);

salaryAdvanceSchema.index({ worker: 1, monthKey: 1 });
salaryAdvanceSchema.index({ status: 1, monthKey: 1 });

module.exports = mongoose.model("SalaryAdvance", salaryAdvanceSchema);
