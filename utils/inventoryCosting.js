const mongoose = require("mongoose");
const InventoryTransaction = require("../models/inventoryTransaction");
const LandBlock = require("../models/landBlock");
const Irrigation = require("../models/irrigation");
const { CROP_LABELS } = require("./cropConstants");

const EPS = 0.0001;

const purchaseInFilter = {
  type: "in",
  $or: [
    { inReason: { $exists: false } },
    { inReason: null },
    { inReason: "purchase" },
  ],
};

const godamOutFilter = {
  type: "out",
  outReason: "godam_exit",
};

const fieldUseFilter = {
  type: "out",
  outReason: "field_use",
};

const wapisFilter = {
  type: "in",
  inReason: "godam_return",
};

const roundQty = (n) => Math.round(n * 1000) / 1000;
const roundMoney = (n) => Math.round(n * 100) / 100;

const weightedUnitCostFromLots = (lotAllocations = []) => {
  if (!lotAllocations.length) return 0;
  let totalQty = 0;
  let totalCost = 0;
  for (const a of lotAllocations) {
    totalQty += a.qty;
    totalCost += a.qty * (a.unitCost || 0);
  }
  return totalQty > EPS ? totalCost / totalQty : 0;
};

const deriveCropYear = (date) => {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
};

const resolveCropFromLand = async (landBlockId, landSubAcre, session) => {
  if (!landBlockId) return null;
  const block = await LandBlock.findById(landBlockId).session(session || null).lean();
  if (!block) return null;
  const subs = block.subAcres || [];
  if (!subs.length) return null;
  if (!landSubAcre) return subs[0]?.crop || null;
  const sub = subs.find((s) => String(s._id) === String(landSubAcre));
  return sub?.crop || null;
};

async function needsCostingRebuild(stockKey) {
  const purchaseMissing = await InventoryTransaction.exists({
    stockKey,
    ...purchaseInFilter,
    $or: [
      { qtyRemainingAtGodam: { $exists: false } },
      { qtyRemainingAtGodam: null },
    ],
  });
  if (purchaseMissing) return true;

  const godamMissing = await InventoryTransaction.exists({
    stockKey,
    ...godamOutFilter,
    $or: [{ qtyPendingFieldUse: { $exists: false } }, { qtyPendingFieldUse: null }],
  });
  return !!godamMissing;
}

/**
 * Replay FIFO state for legacy data — keeps aggregate qty metrics unchanged.
 */
async function rebuildCostingForStockKey(stockKey, session) {
  const opts = session ? { session } : {};
  const purchases = await InventoryTransaction.find({ stockKey, ...purchaseInFilter })
    .sort({ receivedDate: 1, createdAt: 1 })
    .session(session || null);

  const godamOuts = await InventoryTransaction.find({ stockKey, ...godamOutFilter })
    .sort({ issuedDate: 1, createdAt: 1 })
    .session(session || null);

  const wapisList = await InventoryTransaction.find({ stockKey, ...wapisFilter })
    .sort({ returnDate: 1, createdAt: 1 })
    .session(session || null);

  const fieldUses = await InventoryTransaction.find({ stockKey, ...fieldUseFilter })
    .sort({ createdAt: 1 })
    .session(session || null);

  const lotRemaining = new Map();
  for (const p of purchases) {
    p.qtyRemainingAtGodam = p.totalQuantity;
    if (!p.unitCost && p.totalPurchaseCost > 0 && p.totalQuantity > 0) {
      p.unitCost = roundMoney(p.totalPurchaseCost / p.totalQuantity);
    }
    lotRemaining.set(String(p._id), p.totalQuantity);
    await p.save(opts);
  }

  for (const go of godamOuts) {
    go.lotAllocations = [];
    go.qtyPendingFieldUse = go.totalQuantity;
    await go.save(opts);
  }

  for (const go of godamOuts) {
    let need = go.totalQuantity;
    const allocations = [];
    for (const lot of purchases) {
      if (need <= EPS) break;
      const lotId = String(lot._id);
      const avail = lotRemaining.get(lotId) || 0;
      if (avail <= EPS) continue;
      const take = Math.min(need, avail);
      lotRemaining.set(lotId, avail - take);
      allocations.push({
        purchaseTxnId: lot._id,
        qty: take,
        unitCost: lot.unitCost || 0,
      });
      need -= take;
    }
    go.lotAllocations = allocations;
    go.qtyPendingFieldUse = go.totalQuantity;
    await go.save(opts);
  }

  for (const lot of purchases) {
    lot.qtyRemainingAtGodam = lotRemaining.get(String(lot._id)) ?? 0;
    await lot.save(opts);
  }

  for (const w of wapisList) {
    let rem = w.totalQuantity;
    for (let i = godamOuts.length - 1; i >= 0 && rem > EPS; i--) {
      const go = godamOuts[i];
      const take = Math.min(rem, go.qtyPendingFieldUse || 0);
      if (take <= EPS) continue;
      go.qtyPendingFieldUse = roundQty((go.qtyPendingFieldUse || 0) - take);
      rem -= take;
      await go.save(opts);
    }
  }

  for (const fu of fieldUses) {
    let rem = fu.totalQuantity;
    const godamOutAllocations = [];
    for (const go of godamOuts) {
      if (rem <= EPS) break;
      const pending = go.qtyPendingFieldUse || 0;
      if (pending <= EPS) continue;
      const take = Math.min(rem, pending);
      const unitCost = weightedUnitCostFromLots(go.lotAllocations);
      const cost = roundMoney(take * unitCost);
      go.qtyPendingFieldUse = roundQty(pending - take);
      await go.save(opts);
      godamOutAllocations.push({
        godamOutId: go._id,
        qty: take,
        unitCost,
        cost,
      });
      rem -= take;
    }
    fu.godamOutAllocations = godamOutAllocations;
    fu.totalCostSnapshot = roundMoney(
      godamOutAllocations.reduce((s, a) => s + (a.cost || 0), 0),
    );
    fu.unitCostSnapshot =
      fu.totalQuantity > EPS
        ? roundMoney(fu.totalCostSnapshot / fu.totalQuantity)
        : 0;
    if (fu.irrigation) {
      const irr = await Irrigation.findById(fu.irrigation).session(session || null).lean();
      if (irr) {
        fu.landBlock = irr.landBlock;
        fu.landSubAcre = irr.landSubAcre;
        fu.cropYear = deriveCropYear(irr.activityDate);
        fu.crop =
          (await resolveCropFromLand(irr.landBlock, irr.landSubAcre, session)) || undefined;
        if (!fu.issuedDate) fu.issuedDate = irr.activityDate;
      }
    }
    await fu.save(opts);
  }
}

async function ensureCostingInitialized(stockKey, session) {
  if (await needsCostingRebuild(stockKey)) {
    await rebuildCostingForStockKey(stockKey, session);
  }
}

async function allocateLotsForGodamOut(stockKey, qtyNeeded, session) {
  await ensureCostingInitialized(stockKey, session);
  const lots = await InventoryTransaction.find({ stockKey, ...purchaseInFilter })
    .sort({ receivedDate: 1, createdAt: 1 })
    .session(session || null);

  let remaining = qtyNeeded;
  const allocations = [];

  for (const lot of lots) {
    if (remaining <= EPS) break;
    const avail = lot.qtyRemainingAtGodam ?? 0;
    if (avail <= EPS) continue;
    const take = Math.min(remaining, avail);
    lot.qtyRemainingAtGodam = roundQty(avail - take);
    await lot.save(session ? { session } : undefined);
    allocations.push({
      purchaseTxnId: lot._id,
      qty: take,
      unitCost: lot.unitCost || 0,
    });
    remaining -= take;
  }

  if (remaining > EPS) {
    throw new Error(
      `Godam mein lot stock kam hai (FIFO). ${roundQty(remaining)} unit allocate nahi ho saka`,
    );
  }

  return allocations;
}

async function reverseLotAllocations(lotAllocations = [], session) {
  for (const a of lotAllocations) {
    if (!a?.purchaseTxnId || !a.qty) continue;
    const lot = await InventoryTransaction.findById(a.purchaseTxnId).session(
      session || null,
    );
    if (!lot) continue;
    lot.qtyRemainingAtGodam = roundQty((lot.qtyRemainingAtGodam ?? 0) + a.qty);
    await lot.save(session ? { session } : undefined);
  }
}

async function applyWapisToGodamOuts(stockKey, qty, session) {
  await ensureCostingInitialized(stockKey, session);
  const godamOuts = await InventoryTransaction.find({
    stockKey,
    ...godamOutFilter,
    qtyPendingFieldUse: { $gt: EPS },
  })
    .sort({ issuedDate: -1, createdAt: -1 })
    .session(session || null);

  let rem = qty;
  for (const go of godamOuts) {
    if (rem <= EPS) break;
    const pending = go.qtyPendingFieldUse || 0;
    const take = Math.min(rem, pending);
    if (take <= EPS) continue;
    go.qtyPendingFieldUse = roundQty(pending - take);
    await go.save(session ? { session } : undefined);
    rem -= take;
  }
}

async function allocateGodamOutsForFieldUse(stockKey, qtyNeeded, session) {
  await ensureCostingInitialized(stockKey, session);
  const godamOuts = await InventoryTransaction.find({
    stockKey,
    ...godamOutFilter,
    qtyPendingFieldUse: { $gt: EPS },
  })
    .sort({ issuedDate: 1, createdAt: 1 })
    .session(session || null);

  let remaining = qtyNeeded;
  const allocations = [];

  for (const go of godamOuts) {
    if (remaining <= EPS) break;
    const pending = go.qtyPendingFieldUse || 0;
    if (pending <= EPS) continue;
    const take = Math.min(remaining, pending);
    const unitCost = weightedUnitCostFromLots(go.lotAllocations);
    const cost = roundMoney(take * unitCost);
    go.qtyPendingFieldUse = roundQty(pending - take);
    await go.save(session ? { session } : undefined);
    allocations.push({
      godamOutId: go._id,
      qty: take,
      unitCost,
      cost,
    });
    remaining -= take;
  }

  if (remaining > EPS) {
    throw new Error(
      `Godam out pending kam hai. ${roundQty(remaining)} unit field use ke liye allocate nahi ho saka`,
    );
  }

  return allocations;
}

async function reverseGodamOutFieldAllocations(godamOutAllocations = [], session) {
  for (const a of godamOutAllocations) {
    if (!a?.godamOutId || !a.qty) continue;
    const go = await InventoryTransaction.findById(a.godamOutId).session(
      session || null,
    );
    if (!go) continue;
    go.qtyPendingFieldUse = roundQty((go.qtyPendingFieldUse || 0) + a.qty);
    await go.save(session ? { session } : undefined);
  }
}

async function getPendingGodamOutBatches(stockKey) {
  await ensureCostingInitialized(stockKey);
  const rows = await InventoryTransaction.find({
    stockKey,
    ...godamOutFilter,
    qtyPendingFieldUse: { $gt: EPS },
  })
    .sort({ issuedDate: 1, createdAt: 1 })
    .select("issuedDate qtyPendingFieldUse lotAllocations totalQuantity contentUnit")
    .lean();

  return rows.map((r) => ({
    godamOutId: r._id,
    issuedDate: r.issuedDate,
    qtyPending: r.qtyPendingFieldUse,
    unitCost: weightedUnitCostFromLots(r.lotAllocations),
    contentUnit: r.contentUnit,
  }));
}

async function initializePurchaseLot(txn, { totalPurchaseCost, linkedExpenseId, unitCost }) {
  const totalCost = Number(totalPurchaseCost) || 0;
  if (linkedExpenseId) txn.linkedExpenseId = linkedExpenseId;
  if (totalCost > 0) txn.totalPurchaseCost = roundMoney(totalCost);
  if (unitCost > 0) {
    txn.unitCost = roundMoney(unitCost);
  } else if (totalCost > 0 && txn.totalQuantity > 0) {
    txn.unitCost = roundMoney(totalCost / txn.totalQuantity);
  } else {
    txn.unitCost = 0;
  }
  txn.qtyRemainingAtGodam = txn.totalQuantity;
}

module.exports = {
  EPS,
  deriveCropYear,
  resolveCropFromLand,
  CROP_LABELS,
  ensureCostingInitialized,
  rebuildCostingForStockKey,
  allocateLotsForGodamOut,
  reverseLotAllocations,
  applyWapisToGodamOuts,
  allocateGodamOutsForFieldUse,
  reverseGodamOutFieldAllocations,
  getPendingGodamOutBatches,
  initializePurchaseLot,
  weightedUnitCostFromLots,
  roundQty,
  roundMoney,
};
