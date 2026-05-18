const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },
    inReason: {
      type: String,
      enum: ["purchase", "godam_return"],
    },
    outReason: {
      type: String,
      enum: ["godam_exit", "field_use"],
    },
    receivedDate: {
      type: Date,
    },
    issuedDate: {
      type: Date,
    },
    returnDate: {
      type: Date,
    },
    issuedTo: {
      type: String,
      trim: true,
      default: "",
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: "",
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    containerType: {
      type: String,
      enum: ["bag", "bottle", "drum", "packet", "kg", "liter", "other"],
      default: "bag",
    },
    containerCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    contentPerContainer: {
      type: Number,
      min: 0,
      default: 0,
    },
    contentUnit: {
      type: String,
      enum: ["kg", "g", "ml", "liter", "unit"],
      default: "kg",
    },
    totalQuantity: {
      type: Number,
      required: true,
      min: 0.001,
    },
    quantityUsed: {
      type: Number,
      min: 0,
    },
    irrigation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Irrigation",
    },
    stockKey: {
      type: String,
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryTransaction", inventoryTransactionSchema);
