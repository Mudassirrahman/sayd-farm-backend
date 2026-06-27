const mongoose = require("mongoose");

const workerPayPeriodSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
    },
    baseMonthlySalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    perDayRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    adminApprovedLeaveDays: { type: Number, default: 0 },
    excessLeaveDays: { type: Number, default: 0 },
    unmarkedPastDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    totalEarnedDayFraction: { type: Number, default: 0 },
    grossEarnedSalary: { type: Number, default: 0, min: 0 },
    loanDeduction: { type: Number, default: 0, min: 0 },
    loanDeductedThisMonth: { type: Number, default: 0, min: 0 },
    advanceOutstanding: { type: Number, default: 0, min: 0 },
    netPayable: { type: Number, default: 0, min: 0 },
    totalPaidApproved: { type: Number, default: 0, min: 0 },
    totalPaidPending: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid"],
      default: "pending",
    },
    lastCalculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

workerPayPeriodSchema.index({ worker: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("WorkerPayPeriod", workerPayPeriodSchema);
