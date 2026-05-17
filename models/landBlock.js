const mongoose = require("mongoose");
const { CROP_VALUES } = require("../utils/cropConstants");

const subAcreSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    crop: {
      type: String,
      enum: CROP_VALUES,
      required: true,
    },
  },
  { _id: true }
);

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
    subAcres: {
      type: [subAcreSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LandBlock", landBlockSchema);
