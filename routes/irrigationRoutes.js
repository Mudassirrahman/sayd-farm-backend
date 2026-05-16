const express = require("express");
const router = express.Router();
const {
  getIrrigations,
  createIrrigation,
  updateIrrigation,
  deleteIrrigation,
} = require("../controllers/irrigationController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authenticateUser, getIrrigations);
router.post("/", authenticateUser, createIrrigation);
router.put("/:id", authenticateUser, updateIrrigation);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteIrrigation);

module.exports = router;
