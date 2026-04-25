const Category = require("../models/category");

// GET all categories
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({}, { name: 1, subcategories: 1 })
      .sort({ name: 1 })
      .lean();

    const normalizedCategories = categories.map((category) => ({
      ...category,
      subcategories: Array.isArray(category.subcategories)
        ? category.subcategories
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : [],
    }));
    res.status(200).json({ categories: normalizedCategories });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch categories", error: error.message });
  }
};

// POST create new category (admin only)
const createCategory = async (req, res) => {
  try {
    const { name, subcategories } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: "Category with this name already exists" });
    }

    const category = new Category({
      name: name.trim(),
      subcategories: subcategories || [],
    });

    await category.save();
    res.status(201).json({ message: "Category created successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Failed to create category", error: error.message });
  }
};

// PUT update category (name + subcategories) (admin only)
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subcategories } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const duplicate = await Category.findOne({ name: name.trim(), _id: { $ne: id } });
    if (duplicate) {
      return res.status(400).json({ message: "Another category with this name already exists" });
    }

    const updated = await Category.findByIdAndUpdate(
      id,
      { name: name.trim(), subcategories: subcategories || [] },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category updated successfully", category: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update category", error: error.message });
  }
};

// DELETE category (admin only)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete category", error: error.message });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
