const Worker = require("../models/worker");

const createWorker = async (req, res) => {
  try {
    const { name, role } = req.body;

    if (!name?.trim() || !role?.trim()) {
      return res
        .status(400)
        .json({ message: "Naam aur role dono zaroori hain." });
    }

    const worker = new Worker({
      name: String(name).trim(),
      role: String(role).trim(),
      createdBy: req.user._id,
    });

    await worker.save();

    const populated = await worker.populate("createdBy", "name email role");

    res.status(201).json({ message: "Worker add ho gaya.", data: populated });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Worker add karne mein masla aaya.",
        error: error.message,
      });
  }
};

const getWorkers = async (req, res) => {
  try {
    const includeInactive =
      req.user.role === "admin" && req.query.includeInactive === "true";

    const query = includeInactive ? {} : { isActive: true };

    const workers = await Worker.find(query)
      .populate("createdBy", "name email role")
      .sort({ name: 1 });

    res.status(200).json({ message: "Workers list mili.", data: workers });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Workers fetch karne mein masla aaya.",
        error: error.message,
      });
  }
};

const updateWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, monthlySalary } = req.body;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ message: "Naam khali nahi ho sakta." });
      }
      worker.name = String(name).trim();
    }

    if (role !== undefined) {
      if (!String(role).trim()) {
        return res.status(400).json({ message: "Role khali nahi ho sakta." });
      }
      worker.role = String(role).trim();
    }

    if (isActive !== undefined) {
      worker.isActive = Boolean(isActive);
    }

    if (monthlySalary !== undefined) {
      const salary = Number(monthlySalary);
      if (!Number.isFinite(salary) || salary < 0) {
        return res.status(400).json({ message: "Valid monthly salary chahiye." });
      }
      worker.monthlySalary = salary;
    }

    await worker.save();

    const updated = await Worker.findById(id).populate(
      "createdBy",
      "name email role",
    );

    res.status(200).json({ message: "Worker update ho gaya.", data: updated });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Worker update karne mein masla aaya.",
        error: error.message,
      });
  }
};

const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    worker.isActive = false;
    await worker.save();

    res.status(200).json({ message: "Worker deactivate ho gaya." });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Worker delete karne mein masla aaya.",
        error: error.message,
      });
  }
};

module.exports = { createWorker, getWorkers, updateWorker, deleteWorker };
