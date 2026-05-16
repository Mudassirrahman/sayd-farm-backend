const InventoryCategory = require("../models/inventoryCategory");

const getInventoryCategories = async (req, res) => {
  try {
    const categories = await InventoryCategory.find({}, { name: 1, subcategories: 1 })
      .sort({ name: 1 })
      .lean();

    const normalized = categories.map((cat) => ({
      ...cat,
      subcategories: Array.isArray(cat.subcategories)
        ? cat.subcategories.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
        : [],
    }));
    res.status(200).json({ categories: normalized });
  } catch (error) {
    res.status(500).json({ message: "Categories fetch karne mein masla aaya", error: error.message });
  }
};

const createInventoryCategory = async (req, res) => {
  try {
    const { name, subcategories } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: "Category ka naam zaroori hai" });
    }

    const existing = await InventoryCategory.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: "Yeh category pehle se maujood hai" });
    }

    const category = new InventoryCategory({
      name: name.trim(),
      subcategories: subcategories || [],
    });
    await category.save();
    res.status(201).json({ message: "Category ban gayi", category });
  } catch (error) {
    res.status(500).json({ message: "Category banane mein masla aaya", error: error.message });
  }
};

const updateInventoryCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subcategories } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Category ka naam zaroori hai" });
    }

    const duplicate = await InventoryCategory.findOne({ name: name.trim(), _id: { $ne: id } });
    if (duplicate) {
      return res.status(400).json({ message: "Doosri category is naam se pehle se hai" });
    }

    const updated = await InventoryCategory.findByIdAndUpdate(
      id,
      { name: name.trim(), subcategories: subcategories || [] },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category nahi mili" });
    }
    res.status(200).json({ message: "Category update ho gayi", category: updated });
  } catch (error) {
    res.status(500).json({ message: "Category update karne mein masla aaya", error: error.message });
  }
};

const deleteInventoryCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await InventoryCategory.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Category nahi mili" });
    }
    res.status(200).json({ message: "Category delete ho gayi" });
  } catch (error) {
    res.status(500).json({ message: "Category delete karne mein masla aaya", error: error.message });
  }
};

module.exports = {
  getInventoryCategories,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
};
