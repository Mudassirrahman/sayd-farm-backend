const mongoose = require("mongoose");
const Irrigation = require("../models/irrigation");
const InventoryTransaction = require("../models/inventoryTransaction");
const LandBlock = require("../models/landBlock");
const { buildStockKey, getPendingReturnForKey } = require("../utils/inventoryUtils");
const { isKhaadCategory } = require("../utils/categoryUtils");

const mapMaterial = (m) => {
  const material = {
    stockKey: m.stockKey || buildStockKey(m),
    itemName: m.itemName,
    category: m.category,
    subcategory: m.subcategory || "",
    brand: m.brand || "",
    quantityUsed: Number(m.quantityUsed),
    contentUnit: m.contentUnit || "kg",
  };
  if (isKhaadCategory(m.category) && m.applicationMethod) {
    material.applicationMethod = m.applicationMethod;
  }
  return material;
};

const validateMaterialsInput = (materialsUsed) => {
  if (!materialsUsed?.length) return null;
  for (const mat of materialsUsed) {
    const qty = Number(mat.quantityUsed);
    if (!qty || qty <= 0) continue;
    if (isKhaadCategory(mat.category) && !mat.applicationMethod) {
      return `${mat.itemName || "Khaad"} ke liye tareeqa select karein (flood / chatta maar)`;
    }
  }
  return null;
};

const populateIrrigation = (query) =>
  query
    .populate("landBlock", "adminName managerName areaInAcres subAcres")
    .populate("createdBy", "name email role");

const validateLandSelection = async (landBlockId, landSubAcre, session) => {
  const block = await LandBlock.findById(landBlockId).session(session || null);
  if (!block) return { error: "Acre block nahi mila" };

  const subAcres = block.subAcres || [];
  if (subAcres.length === 0) {
    return { block, error: null };
  }

  if (!landSubAcre) {
    return { error: "Specific acre number select karein (Acre 1, Acre 2...)" };
  }

  const found = subAcres.some((s) => String(s._id) === String(landSubAcre));
  if (!found) {
    return { error: "Yeh acre number is block ka nahi hai" };
  }

  return { block, error: null };
};

const validateMaterialsStock = async (materialsUsed) => {
  if (!materialsUsed?.length) return null;

  for (const mat of materialsUsed) {
    const qty = Number(mat.quantityUsed);
    if (!qty || qty <= 0) {
      return `Miqdar sahi nahi: ${mat.itemName || "item"}`;
    }
    const stockKey = mat.stockKey || buildStockKey(mat);
    const available = await getPendingReturnForKey(stockKey);
    if (qty > available + 0.0001) {
      return `${mat.itemName} ke liye godam se nikla stock kam hai. Use ke liye baqi: ${available} ${mat.contentUnit || "kg"}`;
    }
  }
  return null;
};

const createOutTransactions = async (irrigationId, materialsUsed, userId, session) => {
  const txns = [];
  for (const mat of materialsUsed) {
    const stockKey = mat.stockKey || buildStockKey(mat);
    const txn = new InventoryTransaction({
      type: "out",
      outReason: "field_use",
      itemName: mat.itemName,
      category: mat.category,
      subcategory: mat.subcategory || "",
      brand: mat.brand || "",
      containerType: "other",
      containerCount: 0,
      contentPerContainer: 0,
      contentUnit: mat.contentUnit || "kg",
      totalQuantity: Number(mat.quantityUsed),
      quantityUsed: Number(mat.quantityUsed),
      stockKey,
      irrigation: irrigationId,
      createdBy: userId,
      notes: "Irrigation se use hua",
    });
    if (session) await txn.save({ session });
    else await txn.save();
    txns.push(txn);
  }
  return txns;
};

const deleteOutTransactions = async (irrigationId, session) => {
  const opts = session ? { session } : {};
  await InventoryTransaction.deleteMany(
    {
      irrigation: irrigationId,
      type: "out",
      $or: [{ outReason: "field_use" }, { outReason: { $exists: false } }, { outReason: null }],
    },
    opts
  );
};

const getIrrigations = async (req, res) => {
  try {
    const { landBlockId, startDate, endDate, waterSource } = req.query;
    const filter = {};

    if (landBlockId) filter.landBlock = landBlockId;
    if (waterSource === "canal" || waterSource === "tubewell") filter.waterSource = waterSource;
    if (startDate || endDate) {
      filter.activityDate = {};
      if (startDate) filter.activityDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.activityDate.$lte = end;
      }
    }

    const irrigations = await populateIrrigation(Irrigation.find(filter).sort({ activityDate: -1 }));
    res.status(200).json({ irrigations });
  } catch (error) {
    res.status(500).json({ message: "Irrigation records fetch karne mein masla aaya", error: error.message });
  }
};

const createIrrigation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      landBlock,
      landSubAcre,
      activityDate,
      waterSource,
      startTime,
      endTime,
      performedBy,
      temperature,
      materialsUsed,
      notes,
    } = req.body;

    if (!landBlock) return res.status(400).json({ message: "Acre select karna zaroori hai" });
    if (!activityDate) return res.status(400).json({ message: "Date zaroori hai" });
    if (!waterSource) return res.status(400).json({ message: "Pani ka source select karein" });
    if (!startTime || !endTime) return res.status(400).json({ message: "Start aur end time zaroori hain" });
    if (!performedBy?.trim()) return res.status(400).json({ message: "Kis ne lagaya — yeh likhna zaroori hai" });

    const materialsError = validateMaterialsInput(materialsUsed);
    if (materialsError) {
      return res.status(400).json({ message: materialsError });
    }

    const landCheck = await validateLandSelection(landBlock, landSubAcre, session);
    if (landCheck.error) {
      await session.abortTransaction();
      return res.status(400).json({ message: landCheck.error });
    }

    const stockError = await validateMaterialsStock(materialsUsed);
    if (stockError) {
      await session.abortTransaction();
      return res.status(400).json({ message: stockError });
    }

    const irrigation = new Irrigation({
      landBlock,
      landSubAcre: landSubAcre || undefined,
      activityDate: new Date(activityDate),
      waterSource,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      performedBy: performedBy.trim(),
      temperature: temperature != null ? Number(temperature) : undefined,
      materialsUsed: (materialsUsed || [])
        .filter((m) => m.stockKey && Number(m.quantityUsed) > 0)
        .map(mapMaterial),
      notes: notes?.trim() || "",
      createdBy: req.user._id,
    });

    await irrigation.save({ session });

    if (materialsUsed?.length) {
      await createOutTransactions(irrigation._id, irrigation.materialsUsed, req.user._id, session);
    }

    await session.commitTransaction();
    const populated = await populateIrrigation(Irrigation.findById(irrigation._id));
    res.status(201).json({ message: "Irrigation record save ho gaya", irrigation: populated });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: "Irrigation save karne mein masla aaya", error: error.message });
  } finally {
    session.endSession();
  }
};

const updateIrrigation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";

    const existing = await Irrigation.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Record nahi mila" });
    }

    const isCreator = String(existing.createdBy) === String(req.user._id);
    if (!isAdmin && !isCreator) {
      await session.abortTransaction();
      return res.status(403).json({ message: "Sirf admin ya record bananay wala edit kar sakta hai" });
    }

    const {
      landBlock,
      landSubAcre,
      activityDate,
      waterSource,
      startTime,
      endTime,
      performedBy,
      temperature,
      materialsUsed,
      notes,
    } = req.body;

    await deleteOutTransactions(id, session);

    const materialsError = validateMaterialsInput(materialsUsed);
    if (materialsError) {
      await session.abortTransaction();
      return res.status(400).json({ message: materialsError });
    }

    const stockError = await validateMaterialsStock(materialsUsed);
    if (stockError) {
      await session.abortTransaction();
      return res.status(400).json({ message: stockError });
    }

    const targetLandBlock = landBlock || existing.landBlock;
    const landCheck = await validateLandSelection(
      targetLandBlock,
      landSubAcre !== undefined ? landSubAcre : existing.landSubAcre,
      session
    );
    if (landCheck.error) {
      await session.abortTransaction();
      return res.status(400).json({ message: landCheck.error });
    }

    existing.landBlock = targetLandBlock;
    existing.landSubAcre = landSubAcre !== undefined ? landSubAcre || undefined : existing.landSubAcre;
    if (activityDate) existing.activityDate = new Date(activityDate);
    if (waterSource) existing.waterSource = waterSource;
    if (startTime) existing.startTime = startTime.trim();
    if (endTime) existing.endTime = endTime.trim();
    if (performedBy) existing.performedBy = performedBy.trim();
    if (temperature !== undefined) existing.temperature = temperature != null ? Number(temperature) : undefined;
    if (notes !== undefined) existing.notes = notes?.trim() || "";
    existing.materialsUsed = (materialsUsed || [])
      .filter((m) => m.stockKey && Number(m.quantityUsed) > 0)
      .map(mapMaterial);

    await existing.save({ session });

    if (existing.materialsUsed?.length) {
      await createOutTransactions(existing._id, existing.materialsUsed, req.user._id, session);
    }

    await session.commitTransaction();
    const populated = await populateIrrigation(Irrigation.findById(existing._id));
    res.status(200).json({ message: "Irrigation record update ho gaya", irrigation: populated });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: "Irrigation update karne mein masla aaya", error: error.message });
  } finally {
    session.endSession();
  }
};

const deleteIrrigation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";

    const existing = await Irrigation.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Record nahi mila" });
    }

    if (!isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({ message: "Sirf admin delete kar sakta hai" });
    }

    await deleteOutTransactions(id, session);
    await Irrigation.findByIdAndDelete(id, { session });
    await session.commitTransaction();
    res.status(200).json({ message: "Irrigation record delete ho gaya — stock wapas aa gaya" });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: "Irrigation delete karne mein masla aaya", error: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = { getIrrigations, createIrrigation, updateIrrigation, deleteIrrigation };
