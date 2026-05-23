const mongoose = require("mongoose");
const InventoryTransaction = require("../models/inventoryTransaction");
const {
  buildStockKey,
  getMetricsForKey,
  getPendingReturnForKey,
  metricsFromAgg,
  stockMetricsGroup,
  isPurchaseIn,
  isGodamReturn,
  isGodamExit,
  isFieldUse,
} = require("../utils/inventoryUtils");
const {
  computeTotalQuantity,
  formatPackagingLine,
} = require("../utils/inventoryUnits");

const MIN_RETURN_DESCRIPTION_LENGTH = 20;
const MIN_OUT_PURPOSE_LENGTH = 15;

const purchaseInFilter = {
  type: "in",
  $or: [{ inReason: { $exists: false } }, { inReason: null }, { inReason: "purchase" }],
};

const buildTxnPayload = (body) => {
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
  } = body;

  const { total, contentUnit: unit } = computeTotalQuantity(
    containerCount,
    contentPerContainer,
    contentUnit
  );

  const stockKey = buildStockKey({
    itemName: itemName?.trim(),
    category: category?.trim(),
    subcategory: subcategory?.trim(),
    brand: brand?.trim(),
  });

  return {
    receivedDate: receivedDate ? new Date(receivedDate) : undefined,
    itemName: itemName.trim(),
    category: category.trim(),
    subcategory: subcategory?.trim() || "",
    brand: brand?.trim() || "",
    containerType: containerType || "bag",
    containerCount: Number(containerCount) || 0,
    contentPerContainer: Number(contentPerContainer) || 0,
    contentUnit: unit,
    totalQuantity: total,
    stockKey,
    notes: notes?.trim() || "",
  };
};

const buildGodamOutPayload = (body) => {
  const {
    issuedDate,
    issuedTo,
    itemName,
    category,
    subcategory,
    brand,
    containerType,
    containerCount,
    contentPerContainer,
    contentUnit,
    totalQuantity,
    notes,
  } = body;

  let total = Number(totalQuantity);
  let unit = contentUnit || "kg";

  if (!total || total <= 0) {
    const computed = computeTotalQuantity(containerCount, contentPerContainer, contentUnit);
    total = computed.total;
    unit = computed.contentUnit;
  }

  if (total <= 0) {
    return { error: "Miqdar sahi likhein" };
  }

  if (!issuedDate) return { error: "Nikalne ki date zaroori hai" };
  if (!issuedTo?.trim()) return { error: "Kis ne liya — yeh likhna zaroori hai" };

  const purpose = notes?.trim() || "";
  if (purpose.length < MIN_OUT_PURPOSE_LENGTH) {
    return {
      error: `Purpose / description zaroori hai (kam az kam ${MIN_OUT_PURPOSE_LENGTH} characters) — kis liye out ho raha hai`,
    };
  }

  const stockKey = buildStockKey({
    itemName,
    category,
    subcategory,
    brand,
  });

  return {
    payload: {
      type: "out",
      outReason: "godam_exit",
      issuedDate: new Date(issuedDate),
      issuedTo: issuedTo.trim(),
      itemName: itemName.trim(),
      category: category.trim(),
      subcategory: subcategory?.trim() || "",
      brand: brand?.trim() || "",
      containerType: containerType || "other",
      containerCount: Number(containerCount) || 0,
      contentPerContainer: Number(contentPerContainer) || 0,
      contentUnit: unit,
      totalQuantity: total,
      stockKey,
      notes: notes?.trim() || "",
    },
  };
};

const validateStockInBody = (body) => {
  if (!body.itemName?.trim() || !body.category?.trim()) {
    return "Item naam aur category zaroori hain";
  }
  if (!body.receivedDate) {
    return "Godam aane ki date zaroori hai";
  }
  const { total } = computeTotalQuantity(
    body.containerCount,
    body.contentPerContainer,
    body.contentUnit
  );
  if (total <= 0) {
    return "Miqdar sahi likhein (count × per packet/bag, ya direct qty)";
  }
  return null;
};

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
          ...stockMetricsGroup,
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
          purchaseIn: 1,
          godamReturn: 1,
          godamOut: 1,
          fieldUse: 1,
        },
      },
      { $match: { purchaseIn: { $gt: 0 } } },
      { $sort: { itemName: 1 } },
    ]);

    const enriched = summary.map((row) => {
      const m = metricsFromAgg(row);
      return {
        stockKey: row.stockKey,
        itemName: row.itemName,
        category: row.category,
        subcategory: row.subcategory,
        brand: row.brand,
        contentUnit: row.contentUnit,
        ...m,
        totalIn: m.purchaseIn,
        totalOut: m.fieldUse,
      };
    });

    res.status(200).json({ stockSummary: enriched });
  } catch (error) {
    res.status(500).json({ message: "Stock summary fetch karne mein masla aaya", error: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const { type, inReason, outReason } = req.query;
    const filter = {};
    if (type === "in" || type === "out") filter.type = type;
    if (inReason === "purchase") {
      filter.type = "in";
      filter.$or = [{ inReason: { $exists: false } }, { inReason: null }, { inReason: "purchase" }];
    } else if (inReason === "godam_return") {
      filter.type = "in";
      filter.inReason = "godam_return";
    }
    if (outReason === "godam_exit" || outReason === "field_use") {
      filter.type = "out";
      filter.outReason = outReason;
    }

    const transactions = await InventoryTransaction.find(filter)
      .populate("createdBy", "name email role")
      .populate("irrigation", "activityDate")
      .sort({ createdAt: -1 })
      .lean();

    const enriched = transactions.map((t) => ({
      ...t,
      packagingDisplay: formatPackagingLine(t),
    }));

    res.status(200).json({ transactions: enriched });
  } catch (error) {
    res.status(500).json({ message: "Transactions fetch karne mein masla aaya", error: error.message });
  }
};

const createStockIn = async (req, res) => {
  try {
    const err = validateStockInBody(req.body);
    if (err) return res.status(400).json({ message: err });

    const payload = buildTxnPayload(req.body);

    const txn = new InventoryTransaction({
      type: "in",
      inReason: "purchase",
      ...payload,
      createdBy: req.user._id,
    });

    await txn.save();
    const populated = await txn.populate("createdBy", "name email");
    res.status(201).json({ message: "Stock add ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Stock add karne mein masla aaya", error: error.message });
  }
};

const updateStockIn = async (req, res) => {
  try {
    const { id } = req.params;
    const err = validateStockInBody(req.body);
    if (err) return res.status(400).json({ message: err });

    const existing = await InventoryTransaction.findById(id);
    if (!existing || existing.type !== "in" || existing.inReason === "godam_return") {
      return res.status(404).json({ message: "Stock record nahi mila" });
    }

    const payload = buildTxnPayload(req.body);
    const oldKey = existing.stockKey;

    const otherInOld = await sumPurchaseInExcept(oldKey, id);
    const outOld = await sumGodamOut(oldKey);

    if (payload.stockKey !== oldKey) {
      if (outOld > 0.0001) {
        return res.status(400).json({
          message: "Item/category/brand change nahi ho sakta — stock godam se nikal chuka hai",
        });
      }
    } else if (otherInOld + payload.totalQuantity < outOld - 0.0001) {
      return res.status(400).json({
        message: `Stock kam hai — ${outOld} ${payload.contentUnit} pehle se godam se nikal chuka hai`,
      });
    }

    if (payload.stockKey !== oldKey) {
      const inNew = await sumPurchaseInForKey(payload.stockKey);
      const outNew = await sumGodamOut(payload.stockKey);
      if (inNew + payload.totalQuantity < outNew - 0.0001) {
        return res.status(400).json({ message: "Nayi item line par stock balance theek nahi" });
      }
    }

    Object.assign(existing, payload);
    existing.inReason = "purchase";
    await existing.save();

    const populated = await existing.populate("createdBy", "name email");
    res.status(200).json({ message: "Stock update ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Stock update karne mein masla aaya", error: error.message });
  }
};

const sumPurchaseInForKey = async (stockKey) => {
  const r = await InventoryTransaction.aggregate([
    { $match: { stockKey, ...purchaseInFilter } },
    { $group: { _id: null, total: { $sum: "$totalQuantity" } } },
  ]);
  return r[0]?.total || 0;
};

const sumPurchaseInExcept = async (stockKey, excludeId) => {
  const r = await InventoryTransaction.aggregate([
    {
      $match: {
        stockKey,
        ...purchaseInFilter,
        _id: { $ne: new mongoose.Types.ObjectId(excludeId) },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalQuantity" } } },
  ]);
  return r[0]?.total || 0;
};

const sumGodamOut = async (stockKey) => {
  const r = await InventoryTransaction.aggregate([
    { $match: { stockKey, type: "out", outReason: "godam_exit" } },
    { $group: { _id: null, total: { $sum: "$totalQuantity" } } },
  ]);
  return r[0]?.total || 0;
};

const deleteStockIn = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await InventoryTransaction.findById(id);
    if (!existing || existing.type !== "in" || existing.inReason === "godam_return") {
      return res.status(404).json({ message: "Stock record nahi mila" });
    }

    const otherInSum = await sumPurchaseInExcept(existing.stockKey, existing._id);
    const outSum = await sumGodamOut(existing.stockKey);

    if (otherInSum < outSum - 0.0001) {
      return res.status(400).json({
        message: "Delete nahi ho sakta — yeh stock godam se nikal chuka hai",
      });
    }

    await existing.deleteOne();
    res.status(200).json({ message: "Stock record delete ho gaya" });
  } catch (error) {
    res.status(500).json({ message: "Stock delete karne mein masla aaya", error: error.message });
  }
};

const createGodamOut = async (req, res) => {
  try {
    if (!req.body.itemName?.trim() || !req.body.category?.trim()) {
      return res.status(400).json({ message: "Item naam aur category zaroori hain" });
    }

    const built = buildGodamOutPayload(req.body);
    if (built.error) return res.status(400).json({ message: built.error });

    const metrics = await getMetricsForKey(built.payload.stockKey);
    if (built.payload.totalQuantity > metrics.atGodam + 0.0001) {
      return res.status(400).json({
        message: `Godam mein itna stock nahi. Baqi: ${metrics.atGodam} ${built.payload.contentUnit}`,
      });
    }

    const txn = new InventoryTransaction({
      ...built.payload,
      createdBy: req.user._id,
    });
    await txn.save();
    const populated = await txn.populate("createdBy", "name email");
    res.status(201).json({ message: "Godam se nikalne ka record save ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Godam Out save karne mein masla aaya", error: error.message });
  }
};

const updateGodamOut = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await InventoryTransaction.findById(id);
    if (!existing || existing.type !== "out" || existing.outReason !== "godam_exit") {
      return res.status(404).json({ message: "Godam Out record nahi mila" });
    }

    const built = buildGodamOutPayload(req.body);
    if (built.error) return res.status(400).json({ message: built.error });

    const metrics = await getMetricsForKey(built.payload.stockKey);
    const otherGodamOut =
      metrics.godamOut - (existing.stockKey === built.payload.stockKey ? existing.totalQuantity : 0);
    const atGodamIfChanged =
      built.payload.stockKey === existing.stockKey
        ? metrics.purchaseIn - otherGodamOut + metrics.godamReturn
        : metrics.atGodam + existing.totalQuantity;

    if (built.payload.totalQuantity > atGodamIfChanged + 0.0001) {
      return res.status(400).json({ message: "Godam mein itni miqdar baqi nahi" });
    }

    Object.assign(existing, built.payload);
    await existing.save();
    const populated = await existing.populate("createdBy", "name email");
    res.status(200).json({ message: "Godam Out update ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Godam Out update karne mein masla aaya", error: error.message });
  }
};

const deleteGodamOut = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await InventoryTransaction.findById(id);
    if (!existing || existing.type !== "out" || existing.outReason !== "godam_exit") {
      return res.status(404).json({ message: "Godam Out record nahi mila" });
    }

    const metrics = await getMetricsForKey(existing.stockKey);
    const godamOutAfter = metrics.godamOut - existing.totalQuantity;
    const usedAfterDelete = metrics.fieldUse + metrics.godamReturn;
    if (godamOutAfter < usedAfterDelete - 0.0001) {
      return res.status(400).json({
        message: "Delete nahi ho sakta — is issue ke baad field use ya wapis jama ho chuka hai",
      });
    }

    await existing.deleteOne();
    res.status(200).json({ message: "Godam Out record delete ho gaya" });
  } catch (error) {
    res.status(500).json({ message: "Godam Out delete karne mein masla aaya", error: error.message });
  }
};

const createGodamReturn = async (req, res) => {
  try {
    const {
      returnDate,
      itemName,
      category,
      subcategory,
      brand,
      containerType,
      contentUnit,
      totalQuantity,
      containerCount,
      contentPerContainer,
      notes,
    } = req.body;

    if (!itemName?.trim() || !category?.trim()) {
      return res.status(400).json({ message: "Item naam aur category zaroori hain" });
    }
    if (!returnDate) return res.status(400).json({ message: "Wapis jama ki date zaroori hai" });

    const description = notes?.trim() || "";
    if (description.length < MIN_RETURN_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description zaroori hai (kam az kam ${MIN_RETURN_DESCRIPTION_LENGTH} characters) — batayein kya, kahan se, kyun wapis jama kar rahe hain`,
      });
    }

    let total = Number(totalQuantity);
    let unit = contentUnit || "kg";
    if (!total || total <= 0) {
      const computed = computeTotalQuantity(containerCount, contentPerContainer, contentUnit);
      total = computed.total;
      unit = computed.contentUnit;
    }
    if (total <= 0) return res.status(400).json({ message: "Miqdar sahi likhein" });

    const stockKey = buildStockKey({ itemName, category, subcategory, brand });
    const pending = await getPendingReturnForKey(stockKey);

    if (pending <= 0.0001) {
      return res.status(400).json({
        message:
          "Is item par ab koi pending issue nahi — pehle godam se nikalna zaroori hai, phir use ya wapis jama",
      });
    }
    if (total > pending + 0.0001) {
      return res.status(400).json({
        message: `Zyada miqdar nahi jama ho sakti. Pending (nikla − use): ${pending} ${unit}`,
      });
    }

    const txn = new InventoryTransaction({
      type: "in",
      inReason: "godam_return",
      returnDate: new Date(returnDate),
      itemName: itemName.trim(),
      category: category.trim(),
      subcategory: subcategory?.trim() || "",
      brand: brand?.trim() || "",
      containerType: containerType || "other",
      containerCount: Number(containerCount) || 0,
      contentPerContainer: Number(contentPerContainer) || 0,
      contentUnit: unit,
      totalQuantity: total,
      stockKey,
      notes: description,
      createdBy: req.user._id,
    });

    await txn.save();
    const populated = await txn.populate("createdBy", "name email role");
    res.status(201).json({ message: "Godam mein wapis jama ho gaya", transaction: populated });
  } catch (error) {
    res.status(500).json({ message: "Wapis jama karne mein masla aaya", error: error.message });
  }
};

const getTime = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

const mapTransactionToLedgerRow = (txn) => {
  const isIn = txn.type === "in";
  const isReturn = isIn && isGodamReturn(txn.inReason);
  const isPurchase = isIn && isPurchaseIn(txn.inReason);
  const isExit = txn.type === "out" && isGodamExit(txn.outReason);
  const isUse = txn.type === "out" && isFieldUse(txn.outReason, txn.irrigation);

  let typeName = "Out";
  if (isPurchase) typeName = "Stock In";
  else if (isReturn) typeName = "Wapis Jama";
  else if (isExit) typeName = "Godam Out";
  else if (isUse) typeName = "Field Use";

  let transactionDate = txn.createdAt;
  if (isPurchase) transactionDate = txn.receivedDate || txn.createdAt;
  else if (isReturn) transactionDate = txn.returnDate || txn.createdAt;
  else transactionDate = txn.issuedDate || txn.createdAt;

  const qty = Number(txn.totalQuantity) || 0;
  const creditIn = isIn ? qty : 0;
  const debitOut = !isIn ? qty : 0;

  const descParts = [];
  if (txn.notes?.trim()) descParts.push(txn.notes.trim());
  if (txn.issuedTo?.trim()) descParts.push(`Issued to: ${txn.issuedTo.trim()}`);

  return {
    _id: txn._id,
    rowType: typeName,
    typeName,
    transactionDate,
    entryDate: txn.createdAt,
    addedBy: txn.createdBy?.name || "Unknown",
    itemName: txn.itemName,
    itemDescription: descParts.length ? descParts.join(" — ") : null,
    category: txn.category,
    subCategory: txn.subcategory || null,
    brand: txn.brand || null,
    contentUnit: txn.contentUnit,
    stockKey: txn.stockKey,
    debitOut,
    creditIn,
    packagingDisplay: formatPackagingLine(txn),
    primaryDate: transactionDate,
    createdAt: txn.createdAt,
    affectsGodamBalance: isPurchase || isReturn || isExit,
  };
};

const getInventoryLedger = async (req, res) => {
  try {
    const { stockKey } = req.query;
    const filter = stockKey ? { stockKey } : {};

    const transactions = await InventoryTransaction.find(filter)
      .populate("createdBy", "name email role")
      .populate("irrigation", "activityDate")
      .lean();

    let mergedList = transactions.map(mapTransactionToLedgerRow);

    mergedList.sort((a, b) => {
      const dateDiff = getTime(a.primaryDate) - getTime(b.primaryDate);
      if (dateDiff !== 0) return dateDiff;
      const createdDiff = getTime(a.createdAt) - getTime(b.createdAt);
      if (createdDiff !== 0) return createdDiff;
      if (a.creditIn > 0 && b.debitOut > 0) return -1;
      if (a.debitOut > 0 && b.creditIn > 0) return 1;
      return 0;
    });

    const sortedByCreatedAt = [...mergedList].sort(
      (a, b) => getTime(a.createdAt) - getTime(b.createdAt)
    );
    let globalSr = 0;
    const srMap = new Map();
    sortedByCreatedAt.forEach((item) => {
      globalSr += 1;
      srMap.set(item._id.toString(), globalSr);
    });
    mergedList = mergedList.map((item) => ({
      ...item,
      srNumber: srMap.get(item._id.toString()),
    }));

    const balanceByKey = new Map();
    mergedList = mergedList.map((item) => {
      const prev = balanceByKey.get(item.stockKey) || 0;
      let next = prev;
      if (item.affectsGodamBalance) {
        next = prev + item.creditIn - item.debitOut;
      }
      balanceByKey.set(item.stockKey, next);
      return { ...item, balance: next };
    });

    mergedList.sort((a, b) => b.srNumber - a.srNumber);

    const ledger = mergedList.map((item) => ({
      _id: item._id,
      srNumber: item.srNumber,
      transactionDate: item.transactionDate,
      entryDate: item.entryDate,
      typeName: item.typeName,
      addedBy: item.addedBy,
      itemName: item.itemName,
      itemDescription: item.itemDescription,
      category: item.category,
      subCategory: item.subCategory,
      brand: item.brand,
      contentUnit: item.contentUnit,
      stockKey: item.stockKey,
      packagingDisplay: item.packagingDisplay,
      debitOut: item.debitOut,
      creditIn: item.creditIn,
      balance: item.balance,
      rowType: item.rowType,
    }));

    res.status(200).json({ ledger });
  } catch (error) {
    res.status(500).json({
      message: "Inventory ledger fetch karne mein masla aaya",
      error: error.message,
    });
  }
};

const getReconciliation = async (req, res) => {
  try {
    const hours = Number(req.query.hours) || 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const summary = await InventoryTransaction.aggregate([
      {
        $group: {
          _id: "$stockKey",
          itemName: { $first: "$itemName" },
          category: { $first: "$category" },
          subcategory: { $first: "$subcategory" },
          brand: { $first: "$brand" },
          contentUnit: { $first: "$contentUnit" },
          ...stockMetricsGroup,
          oldestGodamOut: {
            $min: {
              $cond: [
                { $eq: ["$outReason", "godam_exit"] },
                { $ifNull: ["$issuedDate", "$createdAt"] },
                null,
              ],
            },
          },
          oldestFieldUse: {
            $min: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$outReason", "field_use"] },
                    { $and: [{ $eq: ["$type", "out"] }, { $ifNull: ["$irrigation", false] }] },
                  ],
                },
                "$createdAt",
                null,
              ],
            },
          },
        },
      },
      { $match: { purchaseIn: { $gt: 0 } } },
    ]);

    const alerts = [];
    for (const row of summary) {
      const m = metricsFromAgg(row);
      if (m.pendingIssue <= 0.0001 && m.unissuedUse <= 0.0001) continue;

      const oldestEvent = row.oldestGodamOut || row.oldestFieldUse;
      if (!oldestEvent || new Date(oldestEvent) > cutoff) continue;

      const reasons = [];
      if (m.pendingIssue > 0.0001) {
        reasons.push(
          `${m.pendingIssue} ${row.contentUnit || "unit"} nikla lekin use/wapis nahi hua`
        );
      }
      if (m.unissuedUse > 0.0001) {
        reasons.push(
          `${m.unissuedUse} ${row.contentUnit || "unit"} field par use bina godam issue ke`
        );
      }

      alerts.push({
        stockKey: row._id,
        itemName: row.itemName,
        category: row.category,
        subcategory: row.subcategory,
        brand: row.brand,
        contentUnit: row.contentUnit,
        godamOut: m.godamOut,
        fieldUse: m.fieldUse,
        godamReturn: m.godamReturn,
        pendingIssue: m.pendingIssue,
        unissuedUse: m.unissuedUse,
        atGodam: m.atGodam,
        oldestEvent,
        hoursOpen: Math.round((Date.now() - new Date(oldestEvent)) / (60 * 60 * 1000)),
        message: reasons.join(" | "),
      });
    }

    alerts.sort((a, b) => new Date(a.oldestEvent) - new Date(b.oldestEvent));
    res.status(200).json({ alerts, hoursThreshold: hours });
  } catch (error) {
    res.status(500).json({ message: "Reconciliation fetch karne mein masla aaya", error: error.message });
  }
};

module.exports = {
  getStockSummary,
  getInventoryLedger,
  getTransactions,
  createStockIn,
  updateStockIn,
  deleteStockIn,
  createGodamOut,
  updateGodamOut,
  deleteGodamOut,
  createGodamReturn,
  getReconciliation,
};
