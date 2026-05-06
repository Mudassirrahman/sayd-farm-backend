const express = require("express");
const router = express.Router();

const {
  addExpense,
  getExpenses,
  updateExpense,
  updateExpenseStatus,
  deleteExpense,
} = require("../controllers/expenseController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload");

router.get("/", authenticateUser, getExpenses);

router.post("/", authenticateUser, upload.single("receipt"), addExpense);

router.put(
  "/:id",
  authenticateUser,
  roleMiddleware("admin"),
  upload.single("receipt"),
  updateExpense,
);

router.patch(
  "/:id/status",
  authenticateUser,
  roleMiddleware("admin"),
  updateExpenseStatus,
);

router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteExpense);

module.exports = router;
