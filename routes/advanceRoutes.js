const express = require("express");
const router = express.Router();
const {
  addAdvance,
  updateAdvance,
  deleteAdvance,
  getUserBalance,
  getAllBalances,
  getFundsBreakdown,
} = require("../controllers/advanceController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Normal user apni details dekh sakta hai
router.get("/my-balance", authenticateUser, getUserBalance);

// Admin kisi ko bhi, manager khud ko funds add kar sakta hai
router.post("/", authenticateUser, addAdvance);
router.put("/:id", authenticateUser, roleMiddleware("admin"), updateAdvance);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteAdvance);
router.get(
  "/all-balances",
  authenticateUser,
  roleMiddleware("admin"),
  getAllBalances,
);
router.get(
  "/funds-breakdown",
  authenticateUser,
  roleMiddleware("admin"),
  getFundsBreakdown,
);
router.get(
  "/:userId/balance",
  authenticateUser,
  roleMiddleware("admin"),
  getUserBalance,
);

module.exports = router;
