const mongoose = require("mongoose");

const workerLoanSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyDeduction: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

workerLoanSchema.index({ worker: 1, status: 1 });

module.exports = mongoose.model("WorkerLoan", workerLoanSchema);
