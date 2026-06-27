const express = require("express");
const router = express.Router();

const {
  getPayrollDashboard,
  getPayrollCalculate,
  setWorkerSalary,
  approveWorkerAdvance,
  getWorkerAdvances,
  updateWorkerLoan,
  getWorkerLoans,
  recomputePayroll,
} = require("../controllers/payrollController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const rolesMiddleware = require("../middleware/rolesMiddleware");

router.get("/dashboard", authenticateUser, roleMiddleware("admin"), getPayrollDashboard);

router.get(
  "/calculate",
  authenticateUser,
  rolesMiddleware("admin", "user"),
  getPayrollCalculate
);

router.put(
  "/worker/:id/salary",
  authenticateUser,
  roleMiddleware("admin"),
  setWorkerSalary
);

router.get(
  "/worker/:workerId/advances",
  authenticateUser,
  roleMiddleware("admin"),
  getWorkerAdvances
);

router.patch(
  "/advances/:id/status",
  authenticateUser,
  roleMiddleware("admin"),
  approveWorkerAdvance
);

router.get(
  "/worker/:workerId/loans",
  authenticateUser,
  roleMiddleware("admin"),
  getWorkerLoans
);

router.put("/loans/:id", authenticateUser, roleMiddleware("admin"), updateWorkerLoan);

router.post("/recompute", authenticateUser, roleMiddleware("admin"), recomputePayroll);

module.exports = router;
