const express = require("express");
const router = express.Router();

const {
  createWorker,
  getWorkers,
  updateWorker,
  deleteWorker,
} = require("../controllers/workerController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const rolesMiddleware = require("../middleware/rolesMiddleware");

router.get("/", authenticateUser, getWorkers);

router.post("/", authenticateUser, rolesMiddleware("admin", "user"), createWorker);

router.put("/:id", authenticateUser, roleMiddleware("admin"), updateWorker);

router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteWorker);

module.exports = router;
