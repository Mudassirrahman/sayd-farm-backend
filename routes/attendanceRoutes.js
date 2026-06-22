const express = require("express");
const router = express.Router();

const {
  getDailyAttendance,
  getMonthlyAttendance,
  upsertAttendance,
  getWorkerAttendanceHistory,
} = require("../controllers/attendanceController");

const authenticateUser = require("../middleware/authMiddleware");
const rolesMiddleware = require("../middleware/rolesMiddleware");

router.get("/daily", authenticateUser, getDailyAttendance);

router.get("/monthly", authenticateUser, getMonthlyAttendance);

router.get("/worker/:workerId", authenticateUser, getWorkerAttendanceHistory);

router.post("/", authenticateUser, rolesMiddleware("admin", "user"), upsertAttendance);

module.exports = router;
