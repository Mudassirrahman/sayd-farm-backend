const mongoose = require("mongoose");
const { CROP_VALUES } = require("../utils/cropConstants");

const lotAllocationSchema = new mongoose.Schema(
  {
    purchaseTxnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryTransaction",
      required: true,
    },
    qty: { type: Number, required: true, min: 0.001 },
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const godamOutAllocationSchema = new mongoose.Schema(
  {
    godamOutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryTransaction",
      required: true,
    },
    qty: { type: Number, required: true, min: 0.001 },
    unitCost: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

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
    /** Purchase lot — qty abhi godam mein (FIFO) */
    qtyRemainingAtGodam: {
      type: Number,
      min: 0,
    },
    linkedExpenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
    },
    totalPurchaseCost: {
      type: Number,
      min: 0,
    },
    unitCost: {
      type: Number,
      min: 0,
    },
    /** Godam out relay baton — field use ke liye baqi */
    qtyPendingFieldUse: {
      type: Number,
      min: 0,
    },
    lotAllocations: [lotAllocationSchema],
    godamOutAllocations: [godamOutAllocationSchema],
    crop: {
      type: String,
      enum: CROP_VALUES,
    },
    cropYear: {
      type: String,
      trim: true,
    },
    landBlock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LandBlock",
    },
    landSubAcre: {
      type: mongoose.Schema.Types.ObjectId,
    },
    totalCostSnapshot: {
      type: Number,
      min: 0,
    },
    unitCostSnapshot: {
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
  { timestamps: true },
);

module.exports = mongoose.model("InventoryTransaction", inventoryTransactionSchema);
