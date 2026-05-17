const LandBlock = require("../models/landBlock");
const { isValidCrop } = require("../utils/cropConstants");

const normalizeSubAcres = (subAcres) => {
  const result = [];
  for (let i = 0; i < (subAcres || []).length; i++) {
    const s = subAcres[i];
    const label = (typeof s === "string" ? s : s?.label || "").trim();
    const crop = typeof s === "object" ? s?.crop : null;
    if (!label) continue;
    if (!isValidCrop(crop)) {
      return { error: `${label || `Acre ${i + 1}`} ke liye fasal select karein` };
    }
    const entry = { label: label || `Acre ${i + 1}`, crop };
    if (s && s._id) entry._id = s._id;
    result.push(entry);
  }
  return { subAcres: result };
};

const getLandBlocks = async (req, res) => {
  try {
    const blocks = await LandBlock.find()
      .select("adminName managerName areaInAcres subAcres createdAt updatedAt")
      .sort({ adminName: 1 })
      .lean();
    res.status(200).json({ landBlocks: blocks });
  } catch (error) {
    res.status(500).json({ message: "Land blocks fetch karne mein masla aaya", error: error.message });
  }
};

const createLandBlock = async (req, res) => {
  try {
    const { adminName, managerName, areaInAcres, subAcres } = req.body;

    if (!adminName?.trim() || !managerName?.trim()) {
      return res.status(400).json({ message: "Admin naam aur manager naam dono zaroori hain" });
    }

    const normalized = normalizeSubAcres(subAcres);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    if (!normalized.subAcres.length) {
      return res.status(400).json({
        message: "Kam az kam ek acre number add karein (jaise Acre 1, Acre 2...)",
      });
    }

    const block = new LandBlock({
      adminName: adminName.trim(),
      managerName: managerName.trim(),
      areaInAcres: normalized.subAcres.length,
      subAcres: normalized.subAcres,
    });
    await block.save();
    res.status(201).json({ message: "Acre block add ho gaya", landBlock: block });
  } catch (error) {
    res.status(500).json({ message: "Acre block add karne mein masla aaya", error: error.message });
  }
};

const updateLandBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName, managerName, subAcres } = req.body;

    if (!adminName?.trim() || !managerName?.trim()) {
      return res.status(400).json({ message: "Admin naam aur manager naam dono zaroori hain" });
    }

    const existing = await LandBlock.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Acre block nahi mila" });
    }

    const normalized = normalizeSubAcres(subAcres);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    if (!normalized.subAcres.length) {
      return res.status(400).json({
        message: "Kam az kam ek acre number add karein (jaise Acre 1, Acre 2...)",
      });
    }

    const Irrigation = require("../models/irrigation");
    const oldIds = new Set((existing.subAcres || []).map((s) => String(s._id)));
    const newIds = new Set(
      (subAcres || [])
        .filter((s) => s && s._id)
        .map((s) => String(s._id))
    );
    const removedIds = [...oldIds].filter((oid) => !newIds.has(oid));

    for (const removedId of removedIds) {
      const inUse = await Irrigation.exists({ landBlock: id, landSubAcre: removedId });
      if (inUse) {
        return res.status(400).json({
          message: "Jo acre number delete kar rahe hain woh irrigation mein use ho raha hai",
        });
      }
    }

    const updated = await LandBlock.findByIdAndUpdate(
      id,
      {
        adminName: adminName.trim(),
        managerName: managerName.trim(),
        areaInAcres: normalized.subAcres.length,
        subAcres: normalized.subAcres,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({ message: "Acre block update ho gaya", landBlock: updated });
  } catch (error) {
    res.status(500).json({ message: "Acre block update karne mein masla aaya", error: error.message });
  }
};

const deleteLandBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const Irrigation = require("../models/irrigation");
    const inUse = await Irrigation.exists({ landBlock: id });
    if (inUse) {
      return res.status(400).json({
        message: "Yeh block irrigation records mein use ho raha hai — pehle woh records delete karein",
      });
    }

    const deleted = await LandBlock.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Acre block nahi mila" });
    }
    res.status(200).json({ message: "Acre block delete ho gaya" });
  } catch (error) {
    res.status(500).json({ message: "Acre block delete karne mein masla aaya", error: error.message });
  }
};

module.exports = { getLandBlocks, createLandBlock, updateLandBlock, deleteLandBlock };
