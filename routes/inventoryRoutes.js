const express = require("express");
const router = express.Router();
const {
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
  getInventoryCostByCrop,
} = require("../controllers/inventoryController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const rolesMiddleware = require("../middleware/rolesMiddleware");

router.get("/stock-summary", authenticateUser, getStockSummary);
router.get("/ledger", authenticateUser, getInventoryLedger);
router.get("/reports/cost-by-crop", authenticateUser, getInventoryCostByCrop);
router.get("/reconciliation", authenticateUser, roleMiddleware("admin"), getReconciliation);
router.get("/transactions", authenticateUser, getTransactions);

router.post("/transactions", authenticateUser, rolesMiddleware("admin", "user"), createStockIn);
router.put("/transactions/:id", authenticateUser, roleMiddleware("admin"), updateStockIn);
router.delete("/transactions/:id", authenticateUser, roleMiddleware("admin"), deleteStockIn);

router.post("/godam-out", authenticateUser, rolesMiddleware("admin", "user"), createGodamOut);
router.put("/godam-out/:id", authenticateUser, roleMiddleware("admin"), updateGodamOut);
router.delete("/godam-out/:id", authenticateUser, roleMiddleware("admin"), deleteGodamOut);

router.post("/godam-return", authenticateUser, rolesMiddleware("admin", "manager"), createGodamReturn);

module.exports = router;
