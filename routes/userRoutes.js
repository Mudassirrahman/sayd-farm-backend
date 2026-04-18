const express = require("express");
const router = express.Router();

const {
  getAllUsers,
  approveUser,
  rejectUser,
  deleteUser,
} = require("../controllers/userController");

const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authenticateUser, roleMiddleware("admin"), getAllUsers);
router.put(
  "/:id/approve",
  authenticateUser,
  roleMiddleware("admin"),
  approveUser,
);
router.put(
  "/:id/reject",
  authenticateUser,
  roleMiddleware("admin"),
  rejectUser,
);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteUser);

module.exports = router;
