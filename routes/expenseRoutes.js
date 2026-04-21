const express = require("express");
const router = express.Router();

const {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload");

router.get("/", authenticateUser, getExpenses);

router.post("/", authenticateUser, upload.single("receipt"), addExpense);

router.put("/:id", authenticateUser, roleMiddleware("admin"), updateExpense);

router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteExpense);

module.exports = router;
