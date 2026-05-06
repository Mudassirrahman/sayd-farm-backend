const Expense = require("../models/expense");
const mongoose = require("mongoose");
const Advance = require("../models/advance");
const User = require("../models/user");

const addExpense = async (req, res) => {
  try {
    const {
      itemName,
      amount,
      category,
      subcategory,
      expenseDate,
      description,
      deductFromUser,
      targetUserId,
    } = req.body;

    if (!itemName || !amount || !category) {
      return res
        .status(400)
        .json({ message: "Item name, amount, and category are required" });
    }

    let receiptUrl = null;
    if (req.file) {
      receiptUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const dateObj = new Date(expenseDate || Date.now());
    const firstDayOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const lastDayOfMonth = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const lastExpense = await Expense.findOne({
      expenseDate: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
    }).sort({ serialNo: -1 });

    const newSerialNo = lastExpense?.serialNo ? lastExpense.serialNo + 1 : 1;

    const isAllocatedToManager =
      req.user.role === "admin" && deductFromUser === "true";

    if (isAllocatedToManager && !targetUserId) {
      return res.status(400).json({
        message: "Please select a manager when 'Deduct from Manager' is enabled.",
      });
    }

    if (isAllocatedToManager) {
      const targetUser = await User.findById(targetUserId).select("_id role");
      if (!targetUser || targetUser.role !== "user") {
        return res.status(400).json({
          message: "Selected target user is invalid for manager deduction.",
        });
      }
    }

    const expenseOwnerId = isAllocatedToManager ? targetUserId : req.user._id;
    const amountNumber = Number(amount);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be a valid number greater than 0" });
    }

    const newExpense = new Expense({
      user: expenseOwnerId,
      createdBy: req.user._id,
      itemName,
      amount: amountNumber,
      category,
      subcategory: subcategory || null,
      expenseDate: dateObj,
      description,
      receiptUrl,
      serialNo: newSerialNo,
    });

    await newExpense.save();

    if (isAllocatedToManager) {
      const autoAdvance = new Advance({
        user: targetUserId,
        amount: amountNumber,
        dateGiven: dateObj,
        givenBy: req.user._id,
        description: `Auto-Adjustment for Expense: ${itemName} (S.No: ${newSerialNo})`,
        isAutoAdjustment: true,
        linkedExpense: newExpense._id,
      });
      await autoAdvance.save();
    }

    res.status(201).json({ message: "Expense added successfully", data: newExpense });
  } catch (error) {
    res.status(500).json({ message: "Failed to add expense", error: error.message });
  }
};

const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, entryStartDate, entryEndDate, category, userId, mode } = req.query;

    let query = {};
    let advanceQuery = {};

    // Filter by purchasing date (expenseDate / dateGiven)
    if (startDate || endDate) {
      query.expenseDate = {};
      advanceQuery.dateGiven = {};
      if (startDate) {
        query.expenseDate.$gte = new Date(startDate);
        advanceQuery.dateGiven.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.expenseDate.$lte = end;
        advanceQuery.dateGiven.$lte = end;
      }
    }

    // Filter by DB entry date (createdAt) — used by the month dropdown
    if (entryStartDate || entryEndDate) {
      query.createdAt = {};
      advanceQuery.createdAt = {};
      if (entryStartDate) {
        query.createdAt.$gte = new Date(entryStartDate);
        advanceQuery.createdAt.$gte = new Date(entryStartDate);
      }
      if (entryEndDate) {
        const end = new Date(entryEndDate);
        end.setUTCHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
        advanceQuery.createdAt.$lte = end;
      }
    }

    if (category) {
      query.category = category;
    }

    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const isAdminUser = req.user.role === "admin";
    const explicitMode =
      mode === "admin_personal" || mode === "manager_ledger" ? mode : null;

    if (!isAdminUser) {
      query.user = currentUserId;
      advanceQuery.user = currentUserId;
    } else {
      if (explicitMode === "admin_personal") {
        query.user = currentUserId;
        advanceQuery.user = currentUserId;
      } else if (explicitMode === "manager_ledger") {
        if (userId) {
          query.user = new mongoose.Types.ObjectId(userId);
          advanceQuery.user = new mongoose.Types.ObjectId(userId);
        } else {
          query.user = { $ne: currentUserId };
          advanceQuery.user = { $ne: currentUserId };
        }
      } else if (userId === "admin_self") {
        query.user = currentUserId;
        advanceQuery.user = currentUserId;
      } else if (userId) {
        const filterUserId = new mongoose.Types.ObjectId(userId);
        // Match any record where the selected user is involved in ANY capacity:
        //   Expenses — owner (user) OR the person who logged it (createdBy)
        //   Advances — recipient (user) OR the person who gave it (givenBy) 
        query.$or = [{ user: filterUserId }, { createdBy: filterUserId }];
        advanceQuery.$or = [{ user: filterUserId }, { givenBy: filterUserId }];
      }
    }

    const expensesList = await Expense.find(query)
      .populate("user", "name role")
      .populate("createdBy", "name role")
      .lean();

    let advancesList = [];
    const shouldIncludeAdvances = !category && explicitMode !== "admin_personal";
    if (shouldIncludeAdvances) {
      advancesList = await Advance.find(advanceQuery)
        .populate("user", "name role")
        .populate("givenBy", "name role")
        .lean();
    }

    const getTime = (value) => {
      const t = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(t) ? t : 0;
    };

    let mergedList = [];

    expensesList.forEach((exp) => {
      mergedList.push({
        _id: exp._id,
        rawUserId: exp.user?._id?.toString() || exp.user?.toString() || "unknown",
        rowType: "Expense",
        typeName: "Expense",
        purchasingDate: exp.expenseDate || exp.createdAt,
        entryDate: exp.createdAt,
        addedBy: exp.createdBy?.name || exp.user?.name || "Unknown",
        itemName: exp.itemName,
        itemDescription: exp.description || null,
        category: exp.category,
        subCategory: exp.subcategory || null,
        debitOut: exp.amount,
        creditIn: 0,
        receiptUrl: exp.receiptUrl || null,
        primaryDate: exp.expenseDate || exp.createdAt,
        createdAt: exp.createdAt,
        isAutoAdjustment: false,
        linkedExpense: null,
        status: exp.status || "pending",
      });
    });

    // Build a lookup of expenseId → createdAt so that Auto-Adjustment entries can be
    // assigned a sort key that is 1ms BEFORE their linked expense. This guarantees that
    // the credit (Auto-Adjustment) always sorts strictly before its paired debit (Expense)
    // regardless of which document MongoDB persisted first.
    const expenseCreatedAtMap = new Map(
      expensesList.map((exp) => [exp._id.toString(), new Date(exp.createdAt).getTime()])
    );

    advancesList.forEach((adv) => {
      const isAdminAdded = adv?.givenBy?.role === "admin";
      const isSelfAddedFund =
        String(adv?.givenBy?._id || adv?.givenBy) ===
        String(adv?.user?._id || adv?.user);

      let fundLabel = "Fund Added";
      if (adv.isAutoAdjustment) {
        fundLabel = "Auto-Adjustment (Admin Deduction)";
      } else if (isAdminAdded) {
        fundLabel = "Fund Added by Admin";
      } else if (isSelfAddedFund) {
        fundLabel = "Fund Added by Manager/User (Self)";
      } else {
        fundLabel = "Fund Added by Manager/User";
      }

      // For Auto-Adjustments: use linkedExpense.createdAt - 1ms as the sort key.
      // This places the credit entry immediately before its paired expense in every sort,
      // so balance always goes positive before the debit is applied.
      let sortCreatedAt = adv.createdAt;
      if (adv.isAutoAdjustment && adv.linkedExpense) {
        const linkedTs = expenseCreatedAtMap.get(adv.linkedExpense.toString());
        if (linkedTs) sortCreatedAt = new Date(linkedTs - 1);
      }

      mergedList.push({
        _id: adv._id,
        rawUserId: adv.user?._id?.toString() || adv.user?.toString() || "unknown",
        rowType: "Add Fund",
        typeName: adv.isAutoAdjustment ? "Auto-Adjustment" : "Fund",
        purchasingDate: adv.dateGiven || adv.createdAt,
        entryDate: adv.createdAt,
        addedBy: adv.givenBy?.name || "Unknown",
        itemName: fundLabel,
        itemDescription: adv.description || null,
        category: "Funds",
        subCategory: null,
        debitOut: 0,
        creditIn: adv.amount,
        receiptUrl: null,
        primaryDate: adv.dateGiven || adv.createdAt,
        createdAt: sortCreatedAt,
        isAutoAdjustment: adv.isAutoAdjustment || false,
        linkedExpense: adv.linkedExpense || null,
      });
    });

    // Sort oldest-to-newest: establishes srNumber sequence and running balance.
    // Auto-Adjustments already have createdAt = linkedExpense.createdAt - 1ms,
    // so they will always land immediately before their paired expense.
    mergedList.sort((a, b) => {
      const dateDiff = getTime(a.primaryDate) - getTime(b.primaryDate);
      if (dateDiff !== 0) return dateDiff;
      const createdDiff = getTime(a.createdAt) - getTime(b.createdAt);
      if (createdDiff !== 0) return createdDiff;
      // Exact same ms (non-linked same-date entries): credit before debit
      if (a.rowType === b.rowType) return 0;
      return a.rowType === "Add Fund" ? -1 : 1;
    });

    // Assign monthly-reset Sr Numbers based on createdAt ORDER within each createdAt-month.
    // We sort a separate copy by createdAt to get the correct sequence, then map sr# back
    // to the main list (which stays sorted by primaryDate for balance calculation).
    const sortedByCreatedAt = [...mergedList].sort(
      (a, b) => getTime(a.createdAt) - getTime(b.createdAt)
    );
    const monthCounter = new Map();
    const srMap = new Map();
    sortedByCreatedAt.forEach((item) => {
      const d = new Date(item.createdAt);
      const monthKey = d.getFullYear() * 100 + d.getMonth();
      const current = (monthCounter.get(monthKey) || 0) + 1;
      monthCounter.set(monthKey, current);
      srMap.set(item._id.toString(), current);
    });
    mergedList = mergedList.map((item) => ({
      ...item,
      srNumber: srMap.get(item._id.toString()),
    }));

    // Calculate running balance per user key (uses primaryDate sort order — unchanged).
    // Only "approved" expenses deduct from balance; pending and rejected are shown
    // in the ledger but do NOT affect the running balance.
    const balanceByUser = new Map();
    mergedList = mergedList.map((item) => {
      const prev = balanceByUser.get(item.rawUserId) || 0;
      let next;
      if (item.rowType === "Add Fund") {
        next = prev + item.creditIn;
      } else if (item.status === "approved") {
        next = prev - item.debitOut;
      } else {
        next = prev; // pending / rejected — no balance change
      }
      balanceByUser.set(item.rawUserId, next);
      return { ...item, balance: next };
    });

    // Display sort: newest createdAt-month first; within same month newest sr# (highest) first.
    // Using createdAt month so grouping matches the sr# month — back-dated entries
    // (April purchase entered in May) show under May, consistent with their May sr#.
    mergedList.sort((a, b) => {
      const aYM = new Date(a.createdAt).getFullYear() * 100 + new Date(a.createdAt).getMonth();
      const bYM = new Date(b.createdAt).getFullYear() * 100 + new Date(b.createdAt).getMonth();
      if (bYM !== aYM) return bYM - aYM;
      return b.srNumber - a.srNumber;
    });

    // Build clean response shape matching the DataGrid columns
    const ledgerData = mergedList.map((item) => ({
      _id: item._id,
      srNumber: item.srNumber,
      purchasingDate: item.purchasingDate,
      entryDate: item.entryDate,
      typeName: item.typeName,
      addedBy: item.addedBy,
      itemName: item.itemName,
      itemDescription: item.itemDescription,
      category: item.category,
      subCategory: item.subCategory,
      debitOut: item.debitOut,
      creditIn: item.creditIn,
      balance: item.balance,
      receiptUrl: item.receiptUrl,
      rowType: item.rowType,
      isAutoAdjustment: item.isAutoAdjustment,
      linkedExpense: item.linkedExpense,
      userId: item.rawUserId,
      status: item.status ?? null,
    }));

    // ── Summary Cards (4 precise values) ────────────────────────────────────
    //
    // adminAllocatedExpense: admin entered the expense on behalf of a manager
    //   → identified by createdBy ∈ admin user IDs
    // managerDirectExpense: manager entered their own expense (createdBy = null
    //   for old records OR createdBy.role = "user")
    //   → totalExpense - adminAllocatedExpense
    // totalFunds: sum of all advances in scope (date + user filtered)
    // remainingBalance: totalFunds - totalExpense (supports negative values)

    const adminUserIds = await User.find({ role: "admin" }).distinct("_id");

    // Queries scoped to approved-only (for balance calculations)
    const approvedQuery   = { ...query,   status: "approved" };
    const approvedAdvQuery = { ...advanceQuery };

    const [expenseSummary, approvedSummary, pendingSummary, fundSummaryAgg, categoryTotals] =
      await Promise.all([
        // All expenses (regardless of status) — informational total
        Expense.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalExpense: { $sum: "$amount" },
              adminAllocatedExpense: {
                $sum: {
                  $cond: [{ $in: ["$createdBy", adminUserIds] }, "$amount", 0],
                },
              },
            },
          },
        ]),
        // Approved expenses only — used for remaining balance
        Expense.aggregate([
          { $match: approvedQuery },
          {
            $group: {
              _id: null,
              approvedExpense: { $sum: "$amount" },
              adminAllocatedApproved: {
                $sum: {
                  $cond: [{ $in: ["$createdBy", adminUserIds] }, "$amount", 0],
                },
              },
            },
          },
        ]),
        // Pending expenses — shown as informational badge
        Expense.aggregate([
          { $match: { ...query, status: "pending" } },
          { $group: { _id: null, pendingExpense: { $sum: "$amount" } } },
        ]),
        // Fund total — uses advanceQuery (date + user, no category restriction)
        mode !== "admin_personal"
          ? Advance.aggregate([
              { $match: approvedAdvQuery },
              { $group: { _id: null, totalFunds: { $sum: "$amount" } } },
            ])
          : Promise.resolve([]),
        // Category breakdown — approved expenses only (consistent with balance)
        Expense.aggregate([
          { $match: approvedQuery },
          { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
          { $sort: { totalAmount: -1 } },
        ]),
      ]);

    const totalExpense          = expenseSummary[0]?.totalExpense          || 0;
    const adminAllocatedExpense = expenseSummary[0]?.adminAllocatedExpense || 0;
    const managerDirectExpense  = totalExpense - adminAllocatedExpense;
    const approvedExpense       = approvedSummary[0]?.approvedExpense      || 0;
    const pendingExpense        = pendingSummary[0]?.pendingExpense         || 0;
    const totalFunds            = fundSummaryAgg[0]?.totalFunds            || 0;
    // Balance only counts approved expenses; intentionally allows negative
    const remainingBalance      = totalFunds - approvedExpense;

    res.status(200).json({
      message: "Ledger fetched successfully",
      summary: {
        totalRecords: expensesList.length,
        totalExpense,
        approvedExpense,
        pendingExpense,
        managerDirectExpense,
        adminAllocatedExpense,
        totalFunds,
        remainingBalance,
        categoryBreakdown: categoryTotals,
      },
      data: ledgerData,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch ledger", error: error.message });
  }
};

// Admin only — fields are whitelisted to prevent overwriting user/serialNo/_id
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, amount, category, subcategory, expenseDate, description } = req.body;

    const allowedUpdates = {};
    if (itemName !== undefined) allowedUpdates.itemName = String(itemName).trim();
    if (category !== undefined) allowedUpdates.category = String(category).trim();
    if (subcategory !== undefined) allowedUpdates.subcategory = subcategory || null;
    if (expenseDate !== undefined) allowedUpdates.expenseDate = new Date(expenseDate);
    if (description !== undefined) allowedUpdates.description = description;

    if (amount !== undefined) {
      const amountNumber = Number(amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        return res
          .status(400)
          .json({ message: "Amount must be a valid number greater than 0" });
      }
      allowedUpdates.amount = amountNumber;
    }

    if (req.file) {
      allowedUpdates.receiptUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true, runValidators: true },
    );

    if (!updatedExpense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json({ message: "Expense updated successfully", data: updatedExpense });
  } catch (error) {
    res.status(500).json({ message: "Failed to update expense", error: error.message });
  }
};

// Admin only
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedExpense = await Expense.findByIdAndDelete(id);
    if (!deletedExpense) {
      return res.status(404).json({ message: "Expense not found" });
    }
    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete expense", error: error.message });
  }
};

// Admin only — change approval status of an expense
const updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Invalid status. Must be pending, approved, or rejected." });
    }

    const expense = await Expense.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true },
    );

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json({ message: "Expense status updated", data: expense });
  } catch (error) {
    res.status(500).json({ message: "Failed to update status", error: error.message });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  updateExpense,
  updateExpenseStatus,
  deleteExpense,
};
