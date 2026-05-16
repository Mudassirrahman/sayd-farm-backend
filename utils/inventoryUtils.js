const buildStockKey = ({ itemName, category, subcategory = "", brand = "" }) => {
  const parts = [
    String(itemName || "").trim().toLowerCase(),
    String(category || "").trim().toLowerCase(),
    String(subcategory || "").trim().toLowerCase(),
    String(brand || "").trim().toLowerCase(),
  ];
  return parts.join("||");
};

const computeTotalQuantity = (containerCount, contentPerContainer) => {
  const count = Number(containerCount) || 0;
  const per = Number(contentPerContainer) || 0;
  if (count > 0 && per > 0) return count * per;
  return count > 0 ? count : per;
};

const InventoryTransaction = require("../models/inventoryTransaction");

const getRemainingForKey = async (stockKey) => {
  const result = await InventoryTransaction.aggregate([
    { $match: { stockKey } },
    {
      $group: {
        _id: "$stockKey",
        totalIn: {
          $sum: { $cond: [{ $eq: ["$type", "in"] }, "$totalQuantity", 0] },
        },
        totalOut: {
          $sum: { $cond: [{ $eq: ["$type", "out"] }, "$totalQuantity", 0] },
        },
      },
    },
  ]);
  if (!result.length) return 0;
  return result[0].totalIn - result[0].totalOut;
};

module.exports = { buildStockKey, computeTotalQuantity, getRemainingForKey };
