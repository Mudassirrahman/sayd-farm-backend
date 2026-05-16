const express = require("express");
const router = express.Router();
const {
  getLandBlocks,
  createLandBlock,
  updateLandBlock,
  deleteLandBlock,
} = require("../controllers/landBlockController");
const authenticateUser = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authenticateUser, getLandBlocks);
router.post("/", authenticateUser, roleMiddleware("admin"), createLandBlock);
router.put("/:id", authenticateUser, roleMiddleware("admin"), updateLandBlock);
router.delete("/:id", authenticateUser, roleMiddleware("admin"), deleteLandBlock);

module.exports = router;
