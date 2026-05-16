const express = require("express");
const router = express.Router();
const {
  getStockSummary,
  getTransactions,
  createStockIn,
} = require("../controllers/inventoryController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/stock-summary", authenticateUser, getStockSummary);
router.get("/transactions", authenticateUser, getTransactions);
router.post("/transactions", authenticateUser, roleMiddleware("admin"), createStockIn);

module.exports = router;
