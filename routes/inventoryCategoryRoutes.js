const express = require("express");
const router = express.Router();
const {
  getInventoryCategories,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
} = require("../controllers/inventoryCategoryController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authenticateUser, getInventoryCategories);
router.post("/", authenticateUser, roleMiddleware("admin"), createInventoryCategory);
router.put("/:id", authenticateUser, roleMiddleware("admin"), updateInventoryCategory);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteInventoryCategory);

module.exports = router;
