const Task = require("../models/task");
const User = require("../models/user");

const STATUS_ORDER = { pending: 0, in_progress: 1, completed: 2 };

const createTask = async (req, res) => {
  try {
    const { title, description, priority, assignedTo } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({ message: "Title and assigned user are required." });
    }

    const targetUser = await User.findById(assignedTo).select("_id name role");
    if (!targetUser) {
      return res.status(404).json({ message: "Assigned user not found." });
    }

    const task = new Task({
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      priority: priority || "medium",
      status: "pending",
      assignedTo,
      createdBy: req.user._id,
    });

    await task.save();

    const populated = await task.populate([
      { path: "assignedTo", select: "name email role" },
      { path: "createdBy", select: "name email role" },
    ]);

    res.status(201).json({ message: "Task created successfully.", data: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to create task.", error: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const query = isAdmin ? {} : { assignedTo: req.user._id };

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ message: "Tasks fetched successfully.", data: tasks });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks.", error: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user.role === "admin";

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    if (!isAdmin && String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied." });
    }

    if (isAdmin) {
      const { title, description, priority, status, assignedTo } = req.body;

      if (title !== undefined) task.title = String(title).trim();
      if (description !== undefined) task.description = description ? String(description).trim() : null;
      if (priority !== undefined) task.priority = priority;
      if (status !== undefined) {
        if (!STATUS_ORDER.hasOwnProperty(status)) {
          return res.status(400).json({ message: "Invalid status value." });
        }
        task.status = status;
      }
      if (assignedTo !== undefined) {
        const targetUser = await User.findById(assignedTo).select("_id");
        if (!targetUser) {
          return res.status(404).json({ message: "Assigned user not found." });
        }
        task.assignedTo = assignedTo;
      }
    } else {
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Only status update is allowed." });
      }

      if (!STATUS_ORDER.hasOwnProperty(status)) {
        return res.status(400).json({ message: "Invalid status value." });
      }

      if (STATUS_ORDER[status] <= STATUS_ORDER[task.status]) {
        return res.status(400).json({
          message: `Status can only move forward. Current status is "${task.status}".`,
        });
      }

      task.status = status;
    }

    await task.save();

    const updated = await Task.findById(id)
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email role");

    res.status(200).json({ message: "Task updated successfully.", data: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update task.", error: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Task.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.status(200).json({ message: "Task deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete task.", error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find({ isApproved: true }).select("_id name email role");
    res.status(200).json({ message: "Users fetched.", data: users });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users.", error: error.message });
  }
};

module.exports = { createTask, getTasks, updateTask, deleteTask, getUsers };
