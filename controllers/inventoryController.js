const InventoryTransaction = require("../models/inventoryTransaction");
const { buildStockKey, computeTotalQuantity } = require("../utils/inventoryUtils");

const getStockSummary = async (req, res) => {
  try {
    const summary = await InventoryTransaction.aggregate([
      {
        $group: {
          _id: "$stockKey",
          itemName: { $first: "$itemName" },
          category: { $first: "$category" },
          subcategory: { $first: "$subcategory" },
          brand: { $first: "$brand" },
          contentUnit: { $first: "$contentUnit" },
          totalIn: {
            $sum: { $cond: [{ $eq: ["$type", "in"] }, "$totalQuantity", 0] },
          },
          totalOut: {
            $sum: { $cond: [{ $eq: ["$type", "out"] }, "$totalQuantity", 0] },
          },
        },
      },
      {
        $project: {
          stockKey: "$_id",
          itemName: 1,
          category: 1,
          subcategory: 1,
          brand: 1,
          contentUnit: 1,
          totalIn: 1,
          totalOut: 1,
          remaining: { $subtract: ["$totalIn", "$totalOut"] },
        },
      },
      { $match: { totalIn: { $gt: 0 } } },
      { $sort: { itemName: 1 } },
    ]);

    res.status(200).json({ stockSummary: summary });
  } catch (error) {
    res.status(500).json({ message: "Stock summary fetch karne mein masla aaya", error: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = {};
    if (type === "in" || type === "out") filter.type = type;

    const transactions = await InventoryTransaction.find(filter)
      .populate("createdBy", "name email")
      .populate("irrigation", "activityDate")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ transactions });
  } catch (error) {
    res.status(500).json({ message: "Transactions fetch karne mein masla aaya", error: error.message });
  }
};

const createStockIn = async (req, res) => {
  try {
    const {
      receivedDate,
      itemName,
      category,
      subcategory,
      brand,
      containerType,
      containerCount,
      contentPerContainer,
      contentUnit,
      notes,
    } = req.body;

    if (!itemName?.trim() || !category?.trim()) {
      return res.status(400).json({ message: "Item naam aur category zaroori hain" });
    }
    if (!receivedDate) {
      return res.status(400).json({ message: "Aane ki date zaroori hai" });
    }

    const totalQuantity = computeTotalQuantity(containerCount, contentPerContainer);
    if (totalQuantity <= 0) {
      return res.status(400).json({ message: "Miqdar sahi likhein (bags/bottles ya kg)" });
    }

    const stockKey = buildStockKey({ itemName, category, subcategory, brand });

    const txn = new InventoryTransaction({
      type: "in",
      receivedDate: new Date(receivedDate),
      itemName: itemName.trim(),
      category: category.trim(),
      subcategory: subcategory?.trim() || "",
      brand: brand?.trim() || "",
      containerType: containerType || "bag",
      containerCount: Number(containerCount) || 0,
      contentPerContainer: Number(contentPerContainer) || 0,
      contentUnit: contentUnit || "kg",
      totalQuantity,
      stockKey,
      createdBy: req.user._id,
      notes: notes?.trim() || "",
    });

    await txn.save();
    const populated = await txn.populate("createdBy", "name email");
    res.status(201).json({ message: "Stock add ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Stock add karne mein masla aaya", error: error.message });
  }
};

module.exports = {
  getStockSummary,
  getTransactions,
  createStockIn,
};
