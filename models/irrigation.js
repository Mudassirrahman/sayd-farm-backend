const mongoose = require("mongoose");

const materialUsedSchema = new mongoose.Schema(
  {
    stockKey: { type: String, required: true },
    itemName: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, default: "" },
    brand: { type: String, default: "" },
    quantityUsed: { type: Number, required: true, min: 0.001 },
    contentUnit: { type: String, default: "kg" },
    applicationMethod: {
      type: String,
      enum: ["flood", "sprinkler"],
    },
  },
  { _id: false }
);

const irrigationSchema = new mongoose.Schema(
  {
    landBlock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LandBlock",
      required: true,
    },
    landSubAcre: {
      type: mongoose.Schema.Types.ObjectId,
    },
    activityDate: {
      type: Date,
      required: true,
    },
    waterSource: {
      type: String,
      enum: ["canal", "tubewell"],
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    performedBy: {
      type: String,
      required: true,
      trim: true,
    },
    temperature: {
      type: Number,
    },
    materialsUsed: [materialUsedSchema],
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Irrigation", irrigationSchema);
