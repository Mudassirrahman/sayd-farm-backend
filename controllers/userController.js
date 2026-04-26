const User = require("../models/user");

// 1. Saare users ki list lana (Sirf Admin ke liye)
// ?includeAdmins=true → returns all roles (used by filter dropdowns)
const getAllUsers = async (req, res) => {
  try {
    const { includeAdmins } = req.query;
    const filter = includeAdmins === "true" ? {} : { role: "user" };
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });
    res.status(200).json({ users });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: error.message });
  }
};

const approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(
      id,
      { isApproved: true },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User approved successfully", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to approve user", error: error.message });
  }
};

const rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(
      id,
      { isApproved: false }, // Wapas false kar diya
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res
      .status(200)
      .json({ message: "User rejected/suspended successfully", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to reject user", error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
};

module.exports = {
  getAllUsers,
  approveUser,
  rejectUser,
  deleteUser,
};
