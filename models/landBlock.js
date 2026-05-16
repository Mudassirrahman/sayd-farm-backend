const mongoose = require("mongoose");

const landBlockSchema = new mongoose.Schema(
  {
    adminName: {
      type: String,
      required: true,
      trim: true,
    },
    managerName: {
      type: String,
      required: true,
      trim: true,
    },
    areaInAcres: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LandBlock", landBlockSchema);
