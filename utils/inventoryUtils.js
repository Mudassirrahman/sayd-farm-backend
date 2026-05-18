const buildStockKey = ({ itemName, category, subcategory = "", brand = "" }) => {
  const parts = [
    String(itemName || "").trim().toLowerCase(),
    String(category || "").trim().toLowerCase(),
    String(subcategory || "").trim().toLowerCase(),
    String(brand || "").trim().toLowerCase(),
  ];
  return parts.join("||");
};

const { computeTotalQuantity: computeQty } = require("./inventoryUnits");

const computeTotalQuantity = (containerCount, contentPerContainer, contentUnit = "kg") =>
  computeQty(containerCount, contentPerContainer, contentUnit).total;

const InventoryTransaction = require("../models/inventoryTransaction");

const isPurchaseIn = (inReason) => !inReason || inReason === "purchase";
const isGodamReturn = (inReason) => inReason === "godam_return";
const isGodamExit = (outReason) => outReason === "godam_exit";
const isFieldUse = (outReason, irrigation) =>
  outReason === "field_use" || (!outReason && irrigation);

const stockMetricsGroup = {
  purchaseIn: {
    $sum: {
      $cond: [
        {
          $and: [
            { $eq: ["$type", "in"] },
            {
              $or: [
                { $eq: ["$inReason", null] },
                { $eq: ["$inReason", "purchase"] },
                { $not: "$inReason" },
              ],
            },
          ],
        },
        "$totalQuantity",
        0,
      ],
    },
  },
  godamReturn: {
    $sum: {
      $cond: [{ $eq: ["$inReason", "godam_return"] }, "$totalQuantity", 0],
    },
  },
  godamOut: {
    $sum: {
      $cond: [{ $eq: ["$outReason", "godam_exit"] }, "$totalQuantity", 0],
    },
  },
  fieldUse: {
    $sum: {
      $cond: [
        {
          $or: [
            { $eq: ["$outReason", "field_use"] },
            {
              $and: [
                { $eq: ["$type", "out"] },
                { $or: [{ $eq: ["$outReason", null] }, { $not: "$outReason" }] },
                { $ifNull: ["$irrigation", false] },
              ],
            },
          ],
        },
        "$totalQuantity",
        0,
      ],
    },
  },
};

const metricsFromAgg = (row) => {
  const purchaseIn = row?.purchaseIn || 0;
  const godamReturn = row?.godamReturn || 0;
  const godamOut = row?.godamOut || 0;
  const fieldUse = row?.fieldUse || 0;
  const atGodam = purchaseIn - godamOut + godamReturn;
  const pendingIssue = Math.max(0, godamOut - fieldUse - godamReturn);
  const unissuedUse = Math.max(0, fieldUse - godamOut);

  return {
    purchaseIn,
    godamReturn,
    godamOut,
    fieldUse,
    atGodam,
    pendingIssue,
    unissuedUse,
    totalIn: purchaseIn + godamReturn,
    totalOut: godamOut + fieldUse,
    remaining: atGodam,
  };
};

const getMetricsForKey = async (stockKey) => {
  const result = await InventoryTransaction.aggregate([
    { $match: { stockKey } },
    { $group: { _id: "$stockKey", ...stockMetricsGroup } },
  ]);
  return metricsFromAgg(result[0]);
};

const getRemainingForKey = async (stockKey) => {
  const m = await getMetricsForKey(stockKey);
  return m.atGodam;
};

const getPendingReturnForKey = async (stockKey) => {
  const m = await getMetricsForKey(stockKey);
  return m.pendingIssue;
};

module.exports = {
  buildStockKey,
  computeTotalQuantity,
  getRemainingForKey,
  getMetricsForKey,
  getPendingReturnForKey,
  metricsFromAgg,
  stockMetricsGroup,
  isPurchaseIn,
  isGodamReturn,
  isGodamExit,
  isFieldUse,
};
