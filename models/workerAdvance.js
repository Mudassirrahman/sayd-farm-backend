const mongoose = require("mongoose");

const workerAdvanceSchema = new mongoose.Schema(
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
    requestDate: {
      type: Date,
      required: true,
    },
    payPeriodMonth: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvalType: {
      type: String,
      enum: ["admin", "auto_small"],
      default: "admin",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recoveredAmount: {
      type: Number,
      default: 0,
      min: 0,
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

workerAdvanceSchema.index({ worker: 1, payPeriodMonth: 1 });
workerAdvanceSchema.index({ worker: 1, status: 1 });

module.exports = mongoose.model("WorkerAdvance", workerAdvanceSchema);
