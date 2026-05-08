const express = require("express");
const router = express.Router();

const {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  getUsers,
} = require("../controllers/taskController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All authenticated users can fetch tasks (admin sees all, user sees own)
router.get("/", authenticateUser, getTasks);

// Admin only: get list of approved users to populate assign dropdown
router.get("/users", authenticateUser, roleMiddleware("admin"), getUsers);

// Admin only: create new task
router.post("/", authenticateUser, roleMiddleware("admin"), createTask);

// Auth required: admin can update all fields, user can only move status forward
router.put("/:id", authenticateUser, updateTask);

// Admin only: delete task
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteTask);

module.exports = router;
