const express = require("express");
const router = express.Router();

const {
  getMonthlySalary,
  getPendingIndicator,
  createSalaryAdvance,
  approveSalaryAdvance,
  rejectSalaryAdvance,
  createWorkerLoan,
  setWorkerSalary,
  markSalaryPaid,
} = require("../controllers/salaryController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const rolesMiddleware = require("../middleware/rolesMiddleware");

router.get("/monthly", authenticateUser, getMonthlySalary);
router.get("/pending-indicator", authenticateUser, roleMiddleware("admin"), getPendingIndicator);

router.post("/advances", authenticateUser, rolesMiddleware("admin", "user"), createSalaryAdvance);
router.put("/advances/:id/approve", authenticateUser, roleMiddleware("admin"), approveSalaryAdvance);
router.put("/advances/:id/reject", authenticateUser, roleMiddleware("admin"), rejectSalaryAdvance);

router.post("/loans", authenticateUser, rolesMiddleware("admin", "user"), createWorkerLoan);
router.put("/worker/:id/salary", authenticateUser, roleMiddleware("admin"), setWorkerSalary);
router.put("/payments/:workerId/mark-paid", authenticateUser, roleMiddleware("admin"), markSalaryPaid);

module.exports = router;
