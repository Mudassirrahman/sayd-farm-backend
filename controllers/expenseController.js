const Expense = require("../models/expense");
const mongoose = require("mongoose");
const Advance = require("../models/advance");
const User = require("../models/user");
const {
  deleteExpenseWithLinkedAdjustment,
} = require("../utils/expensePairing");
const {
  validateLabourExpense,
  processLabourExpenseAfterSave,
} = require("../utils/payrollExpenseHandler");
const {
  applySalaryPaymentSideEffects,
  recomputePayPeriod,
} = require("../utils/payrollService");

/** Admin khud ki personal expense — manager ledger / list se alag */
const isAdminPersonalExpenseQuery = (adminUserIds) => ({
  user: { $in: adminUserIds },
  createdBy: { $in: adminUserIds },
  $expr: { $eq: ["$user", "$createdBy"] },
});

const excludeAdminPersonalFromQuery = (query, adminUserIds) => {
  if (!adminUserIds?.length) return query;
  const exclusion = { $nor: [isAdminPersonalExpenseQuery(adminUserIds)] };
  if (query.$and) {
    query.$and.push(exclusion);
  } else {
    query.$and = [exclusion];
  }
  return query;
};

const addExpense = async (req, res) => {
  try {
    const {
      itemName,
      amount,
      category,
      subcategory,
      subSubcategory,
      expenseDate,
      description,
      deductFromUser,
      targetUserId,
      linkedWorkerId,
      payrollMonth,
      payrollPaymentType,
      payrollLoanInstallment,
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

    const isAdminAllocatedToManager =
      req.user.role === "admin" && deductFromUser === "true";
    const isManagerSelfFundedPair =
      req.user.role === "user" && deductFromUser === "true";
    const isAdminPersonal =
      req.user.role === "admin" && !isAdminAllocatedToManager;

    if (isAdminAllocatedToManager && !targetUserId) {
      return res.status(400).json({
        message: "Please select a manager when 'Deduct from Manager' is enabled.",
      });
    }

    if (isAdminAllocatedToManager) {
      const targetUser = await User.findById(targetUserId).select("_id role");
      if (!targetUser || targetUser.role !== "user") {
        return res.status(400).json({
          message: "Selected target user is invalid for manager deduction.",
        });
      }
    }

    if (isManagerSelfFundedPair && targetUserId) {
      const targetStr = String(targetUserId);
      const selfStr = String(req.user._id);
      if (targetStr !== selfStr) {
        return res.status(403).json({
          message: "You can only create self-funded paired entries against your own fund.",
        });
      }
    }

    const expenseOwnerId = isAdminAllocatedToManager ? targetUserId : req.user._id;
    const amountNumber = Number(amount);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be a valid number greater than 0" });
    }

    await validateLabourExpense(
      {
        subcategory,
        linkedWorkerId,
        payrollPaymentType,
        payrollMonth,
        amount: amountNumber,
        monthlyInstallment: payrollLoanInstallment,
      },
      req.user
    );

    const newExpense = new Expense({
      user: expenseOwnerId,
      createdBy: req.user._id,
      itemName,
      amount: amountNumber,
      category,
      subcategory: subcategory || null,
      subSubcategory: subSubcategory || null,
      expenseDate: dateObj,
      description,
      receiptUrl,
      serialNo: newSerialNo,
      // Admin allocation + admin personal: no approval queue; manager self-funded stays pending
      status: isAdminAllocatedToManager || isAdminPersonal ? "approved" : "pending",
      linkedWorkerId: linkedWorkerId || null,
      payrollMonth: payrollMonth || null,
      payrollPaymentType: payrollPaymentType || null,
      payrollLoanInstallment: (() => {
        if (payrollLoanInstallment == null || payrollLoanInstallment === "") return null;
        const n = Number(payrollLoanInstallment);
        return Number.isFinite(n) ? n : null;
      })(),
    });

    await newExpense.save();

    await processLabourExpenseAfterSave(newExpense, req.user);

    if (isAdminAllocatedToManager) {
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
    } else if (isManagerSelfFundedPair) {
      const autoAdvance = new Advance({
        user: req.user._id,
        amount: amountNumber,
        dateGiven: dateObj,
        givenBy: req.user._id,
        description: `Self-Funded Auto-Adjustment: ${itemName} (S.No: ${newSerialNo})`,
        isAutoAdjustment: true,
        linkedExpense: newExpense._id,
      });
      await autoAdvance.save();
    }

    res.status(201).json({ message: "Expense added successfully", data: newExpense });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Failed to add expense",
    });
  }
};

const getExpenses = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      entryStartDate,
      entryEndDate,
      category,
      subcategory,
      subSubcategory,
      userId,
      mode,
    } = req.query;

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

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (subSubcategory) {
      query.subSubcategory = subSubcategory;
    }

    const hasCategoryTaxonomyFilter = !!(category || subcategory || subSubcategory);

    const currentUserId = new mongoose.Types.ObjectId(req.user._id || req.user.id);
    const isAdminUser = req.user.role === "admin";
    const explicitMode =
      mode === "admin_personal" || mode === "manager_ledger" ? mode : null;
    const adminUserIds = isAdminUser
      ? await User.find({ role: "admin" }).distinct("_id")
      : [];

    if (!isAdminUser) {
      query.user = currentUserId;
      advanceQuery.user = currentUserId;
    } else if (explicitMode === "admin_personal") {
      query.user = currentUserId;
      query.createdBy = currentUserId;
      advanceQuery.user = currentUserId;
    } else {
      const isFarmLedgerView =
        explicitMode === "manager_ledger" || explicitMode === null;

      if (userId === "admin_self") {
        // Legacy param — farm ledger: allocations only, not admin personal
        query.createdBy = currentUserId;
        query.user = { $ne: currentUserId };
        advanceQuery.givenBy = currentUserId;
        advanceQuery.user = { $ne: currentUserId };
      } else if (userId) {
        const filterUserId = new mongoose.Types.ObjectId(userId);
        const filterIsAdmin = adminUserIds.some((id) => id.equals(filterUserId));

        if (filterIsAdmin) {
          // Admin filter on farm ledger: manager allocations only
          query.createdBy = filterUserId;
          query.user = { $ne: filterUserId };
          advanceQuery.givenBy = filterUserId;
          advanceQuery.user = { $ne: filterUserId };
        } else if (explicitMode === "manager_ledger") {
          query.user = filterUserId;
          advanceQuery.user = filterUserId;
        } else {
          query.$or = [{ user: filterUserId }, { createdBy: filterUserId }];
          advanceQuery.$or = [{ user: filterUserId }, { givenBy: filterUserId }];
        }
      } else if (explicitMode === "manager_ledger") {
        query.user = { $ne: currentUserId };
        advanceQuery.user = { $ne: currentUserId };
      }

      if (isFarmLedgerView) {
        excludeAdminPersonalFromQuery(query, adminUserIds);
      }
    }

    const expensesList = await Expense.find(query)
      .populate("user", "name role")
      .populate("createdBy", "name role")
      .lean();

    let advancesList = [];
    const shouldIncludeAdvances =
      !hasCategoryTaxonomyFilter && explicitMode !== "admin_personal";
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

    // Expenses paired with admin "deduct from manager" auto-adjustments
    const autoLinkedExpenseIds = new Set(
      advancesList
        .filter((adv) => adv.isAutoAdjustment && adv.linkedExpense)
        .map((adv) => adv.linkedExpense.toString()),
    );
    const autoAdjByExpenseId = new Map(
      advancesList
        .filter((adv) => adv.isAutoAdjustment && adv.linkedExpense)
        .map((adv) => [adv.linkedExpense.toString(), adv]),
    );

    let mergedList = [];

    expensesList.forEach((exp) => {
      const expId = exp._id.toString();
      const pairedAdv = autoAdjByExpenseId.get(expId);
      const hasPaired = !!pairedAdv;
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
        subSubCategory: exp.subSubcategory || null,
        debitOut: exp.amount,
        creditIn: hasPaired ? pairedAdv.amount : 0,
        receiptUrl: exp.receiptUrl || null,
        primaryDate: exp.expenseDate || exp.createdAt,
        createdAt: exp.createdAt,
        isAutoAdjustment: false,
        linkedExpense: null,
        linkedAdvanceId: hasPaired ? pairedAdv._id : null,
        hasPairedAutoAdjustment: hasPaired,
        status: exp.status || "pending",
      });
    });

    advancesList.forEach((adv) => {
      // Admin-deduct credits are shown on the paired expense row (Credit In column)
      if (adv.isAutoAdjustment && adv.linkedExpense) return;

      const isAdminAdded = adv?.givenBy?.role === "admin";
      const isSelfAddedFund =
        String(adv?.givenBy?._id || adv?.givenBy) ===
        String(adv?.user?._id || adv?.user);

      let fundLabel = "Fund Added";
      if (isAdminAdded) {
        fundLabel = "Fund Added by Admin";
      } else if (isSelfAddedFund) {
        fundLabel = "Fund Added by Manager/User (Self)";
      } else {
        fundLabel = "Fund Added by Manager/User";
      }

      mergedList.push({
        _id: adv._id,
        rawUserId: adv.user?._id?.toString() || adv.user?.toString() || "unknown",
        rowType: "Add Fund",
        typeName: "Fund",
        purchasingDate: adv.dateGiven || adv.createdAt,
        entryDate: adv.createdAt,
        addedBy: adv.givenBy?.name || "Unknown",
        itemName: fundLabel,
        itemDescription: adv.description || null,
        category: "Funds",
        subCategory: null,
        subSubCategory: null,
        debitOut: 0,
        creditIn: adv.amount,
        receiptUrl: null,
        primaryDate: adv.dateGiven || adv.createdAt,
        createdAt: adv.createdAt,
        isAutoAdjustment: false,
        linkedExpense: null,
        linkedAdvanceId: null,
        hasPairedAutoAdjustment: false,
      });
    });

    // Entry order (createdAt): shared by Sr# assignment and running balance so values
    // stay on the correct row when purchasing dates are back-dated out of entry sequence.
    const compareEntryOrder = (a, b) => {
      const createdDiff = getTime(a.createdAt) - getTime(b.createdAt);
      if (createdDiff !== 0) return createdDiff;
      if (a.rowType === b.rowType) return 0;
      return a.rowType === "Add Fund" ? -1 : 1;
    };

    const sortedByCreatedAt = [...mergedList].sort(compareEntryOrder);
    const monthCounter = new Map();
    const srMap = new Map();
    sortedByCreatedAt.forEach((item) => {
      const d = new Date(item.createdAt);
      const monthKey = d.getFullYear() * 100 + d.getMonth();
      const current = (monthCounter.get(monthKey) || 0) + 1;
      monthCounter.set(monthKey, current);
      srMap.set(item._id.toString(), current);
    });

    const balanceByUser = new Map();
    const balanceMap = new Map();
    sortedByCreatedAt.forEach((item) => {
      const prev = balanceByUser.get(item.rawUserId) || 0;
      let next;
      if (item.rowType === "Add Fund") {
        next = prev + item.creditIn;
      } else if (item.hasPairedAutoAdjustment) {
        next = prev + item.creditIn - item.debitOut;
      } else if (item.status === "approved") {
        next = prev - item.debitOut;
      } else {
        next = prev;
      }
      balanceByUser.set(item.rawUserId, next);
      balanceMap.set(item._id.toString(), next);
    });

    mergedList = mergedList.map((item) => ({
      ...item,
      srNumber: srMap.get(item._id.toString()),
      balance: balanceMap.get(item._id.toString()) ?? 0,
    }));

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
      subSubCategory: item.subSubCategory ?? null,
      debitOut: item.debitOut,
      creditIn: item.creditIn,
      balance: item.balance,
      receiptUrl: item.receiptUrl,
      rowType: item.rowType,
      isAutoAdjustment: item.isAutoAdjustment,
      linkedExpense: item.linkedExpense,
      linkedAdvanceId: item.linkedAdvanceId ?? null,
      hasPairedAutoAdjustment: item.hasPairedAutoAdjustment || false,
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
    const pendingAutoLinkedExpense = expensesList
      .filter(
        (exp) =>
          exp.status !== "approved" &&
          autoLinkedExpenseIds.has(exp._id.toString()),
      )
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    // Approved expenses + pending admin-deduct pairs reduce balance (matches Fund tab)
    const remainingBalance      =
      totalFunds - approvedExpense - pendingAutoLinkedExpense;

    const summary = {
      totalRecords: expensesList.length,
      totalExpense,
      approvedExpense,
      pendingExpense,
      managerDirectExpense,
      adminAllocatedExpense,
      totalFunds,
      remainingBalance,
      categoryBreakdown: categoryTotals,
    };

    if (explicitMode === "admin_personal") {
      summary.adminTotal = totalExpense;
    }

    res.status(200).json({
      message: "Ledger fetched successfully",
      summary,
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
    const { itemName, amount, category, subcategory, subSubcategory, expenseDate, description } = req.body;

    const allowedUpdates = {};
    if (itemName !== undefined) allowedUpdates.itemName = String(itemName).trim();
    if (category !== undefined) allowedUpdates.category = String(category).trim();
    if (subcategory !== undefined) allowedUpdates.subcategory = subcategory || null;
    if (subSubcategory !== undefined) allowedUpdates.subSubcategory = subSubcategory || null;
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
    const existing = await Expense.findById(id);
    const deletedExpense = await deleteExpenseWithLinkedAdjustment(id);
    if (!deletedExpense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    if (
      existing?.linkedWorkerId &&
      existing?.payrollMonth
    ) {
      await recomputePayPeriod(existing.linkedWorkerId, existing.payrollMonth);
    }

    res.status(200).json({
      message: "Expense and linked Auto-Adjustment (if any) deleted successfully",
      deletedPair: true,
    });
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

    const existing = await Expense.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const previousStatus = existing.status;

    const expense = await Expense.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true },
    );

    res.status(200).json({ message: "Expense status updated", data: expense });

    if (
      expense.linkedWorkerId &&
      expense.payrollPaymentType === "salary" &&
      expense.payrollMonth
    ) {
      if (status === "approved" && previousStatus !== "approved") {
        await applySalaryPaymentSideEffects(expense);
      } else {
        await recomputePayPeriod(expense.linkedWorkerId, expense.payrollMonth);
      }
    }
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
