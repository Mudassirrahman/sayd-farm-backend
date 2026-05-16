const LandBlock = require("../models/landBlock");

const getLandBlocks = async (req, res) => {
  try {
    const blocks = await LandBlock.find()
      .select("adminName managerName areaInAcres createdAt updatedAt")
      .sort({ adminName: 1 })
      .lean();
    res.status(200).json({ landBlocks: blocks });
  } catch (error) {
    res.status(500).json({ message: "Land blocks fetch karne mein masla aaya", error: error.message });
  }
};

const createLandBlock = async (req, res) => {
  try {
    const { adminName, managerName, areaInAcres } = req.body;

    if (!adminName?.trim() || !managerName?.trim()) {
      return res.status(400).json({ message: "Admin naam aur manager naam dono zaroori hain" });
    }
    if (!areaInAcres || Number(areaInAcres) <= 0) {
      return res.status(400).json({ message: "Acre ki tadaad sahi likhein (0 se zyada)" });
    }

    const block = new LandBlock({
      adminName: adminName.trim(),
      managerName: managerName.trim(),
      areaInAcres: Number(areaInAcres),
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
    const { adminName, managerName, areaInAcres } = req.body;

    if (!adminName?.trim() || !managerName?.trim()) {
      return res.status(400).json({ message: "Admin naam aur manager naam dono zaroori hain" });
    }
    if (!areaInAcres || Number(areaInAcres) <= 0) {
      return res.status(400).json({ message: "Acre ki tadaad sahi likhein (0 se zyada)" });
    }

    const updated = await LandBlock.findByIdAndUpdate(
      id,
      {
        adminName: adminName.trim(),
        managerName: managerName.trim(),
        areaInAcres: Number(areaInAcres),
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Acre block nahi mila" });
    }

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
        message: "Yeh acre irrigation records mein use ho raha hai — pehle woh records delete karein",
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
