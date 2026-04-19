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
  },
  { timestamps: true },
);

module.exports = mongoose.model("Advance", advanceSchema);
