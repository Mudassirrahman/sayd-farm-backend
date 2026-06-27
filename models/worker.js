const mongoose = require("mongoose");

const workerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    monthlySalary: {
      type: Number,
      default: null,
      min: 0,
    },
    salaryEffectiveFrom: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

workerSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model("Worker", workerSchema);
