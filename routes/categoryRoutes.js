const express = require("express");
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Anyone logged in can read categories (managers need this for expense form)
router.get("/", authenticateUser, getCategories);

// Only admin can create, update, delete
router.post("/", authenticateUser, roleMiddleware("admin"), createCategory);
router.put("/:id", authenticateUser, roleMiddleware("admin"), updateCategory);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteCategory);

module.exports = router;
