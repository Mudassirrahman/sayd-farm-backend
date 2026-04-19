const express = require("express");
const router = express.Router();
const {
  addAdvance,
  getUserBalance,
  getAllBalances,
} = require("../controllers/advanceController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Normal user apni details dekh sakta hai
router.get("/my-balance", authenticateUser, getUserBalance);

// Sirf Admin naye funds add kar sakta hai aur sab ka hisaab dekh sakta hai
router.post("/", authenticateUser, roleMiddleware("admin"), addAdvance);
router.get(
  "/all-balances",
  authenticateUser,
  roleMiddleware("admin"),
  getAllBalances,
);
router.get(
  "/:userId/balance",
  authenticateUser,
  roleMiddleware("admin"),
  getUserBalance,
);

module.exports = router;
