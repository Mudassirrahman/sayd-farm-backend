const Worker = require("../models/worker");
const Attendance = require("../models/attendance");
const { ATTENDANCE_STATUSES, DAY_FRACTION_MAP } = require("../models/attendance");
const { normalizeToDay, formatDateKey, parseMonth, getMonthRange } = require("../utils/dateUtils");

const getDailyAttendance = async (req, res) => {
  try {
    const dateParam = req.query.date;
    const day = normalizeToDay(dateParam || new Date());

    if (!day) {
      return res.status(400).json({ message: "Sahi date format chahiye (YYYY-MM-DD)." });
    }

    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const workers = await Worker.find({ isActive: true }).sort({ name: 1 });

    const attendanceRecords = await Attendance.find({
      date: { $gte: day, $lt: nextDay },
    })
      .populate("markedBy", "name email role")
      .populate("worker", "name role");

    const attendanceByWorker = new Map(
      attendanceRecords.map((record) => [String(record.worker._id || record.worker), record])
    );

    const data = workers.map((worker) => ({
      worker,
      attendance: attendanceByWorker.get(String(worker._id)) || null,
      date: formatDateKey(day),
    }));

    res.status(200).json({
      message: "Rozana hazri mili.",
      date: formatDateKey(day),
      data,
    });
  } catch (error) {
    res.status(500).json({ message: "Hazri fetch karne mein masla aaya.", error: error.message });
  }
};

const getMonthlyAttendance = async (req, res) => {
  try {
    const { year, month } = parseMonth(req.query.month);
    const { startDate, endDate, daysInMonth, dates, monthKey } = getMonthRange(year, month);

    const workers = await Worker.find({ isActive: true }).sort({ name: 1 });

    const attendanceRecords = await Attendance.find({
      date: { $gte: startDate, $lt: endDate },
    }).populate("markedBy", "name email role");

    const recordsByWorker = new Map();
    for (const record of attendanceRecords) {
      const workerId = String(record.worker);
      if (!recordsByWorker.has(workerId)) {
        recordsByWorker.set(workerId, []);
      }
      recordsByWorker.get(workerId).push(record);
    }

    const todayKey = formatDateKey(new Date());
    const isCurrentMonth = monthKey === todayKey.slice(0, 7);

    const data = workers.map((worker) => {
      const workerRecords = recordsByWorker.get(String(worker._id)) || [];
      const attendanceByDate = {};

      for (const record of workerRecords) {
        const dateKey = formatDateKey(record.date);
        attendanceByDate[dateKey] = {
          _id: record._id,
          status: record.status,
          dayFraction: record.dayFraction,
          markedBy: record.markedBy,
        };
      }

      const summary = { full: 0, half: 0, absent: 0, notMarked: 0, totalDayFraction: 0 };

      for (const dateKey of dates) {
        if (isCurrentMonth && dateKey > todayKey) continue;

        const att = attendanceByDate[dateKey];
        if (att) {
          summary[att.status] += 1;
          summary.totalDayFraction += att.dayFraction;
        } else {
          summary.notMarked += 1;
        }
      }

      return { worker, attendanceByDate, summary };
    });

    res.status(200).json({
      message: "Mahana hazri mili.",
      month: monthKey,
      daysInMonth,
      dates,
      isCurrentMonth,
      today: todayKey,
      data,
    });
  } catch (error) {
    res.status(500).json({ message: "Mahana hazri fetch karne mein masla aaya.", error: error.message });
  }
};

const upsertAttendance = async (req, res) => {
  try {
    const { workerId, date, status, note } = req.body;

    if (!workerId || !date || !status) {
      return res.status(400).json({ message: "Worker, date aur status zaroori hain." });
    }

    if (!ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Status "${status}" valid nahi. Options: ${ATTENDANCE_STATUSES.join(", ")}`,
      });
    }

    const worker = await Worker.findOne({ _id: workerId, isActive: true });
    if (!worker) {
      return res.status(404).json({ message: "Active worker nahi mila." });
    }

    const day = normalizeToDay(date);
    if (!day) {
      return res.status(400).json({ message: "Sahi date format chahiye (YYYY-MM-DD)." });
    }

    const dayFraction = DAY_FRACTION_MAP[status];

    const attendance = await Attendance.findOneAndUpdate(
      { worker: workerId, date: day },
      {
        worker: workerId,
        date: day,
        status,
        dayFraction,
        markedBy: req.user._id,
        note: note ? String(note).trim() : null,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
      .populate("worker", "name role")
      .populate("markedBy", "name email role");

    res.status(200).json({
      message: "Hazri save ho gayi.",
      data: attendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Is din ki hazri pehle se maujood hai." });
    }
    res.status(500).json({ message: "Hazri save karne mein masla aaya.", error: error.message });
  }
};

/**
 * Worker ki hazri history — salary module is endpoint ko use karega.
 * Query: from, to (YYYY-MM-DD), optional month (YYYY-MM)
 */
const getWorkerAttendanceHistory = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { from, to, month } = req.query;

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ message: "Worker nahi mila." });
    }

    let startDate;
    let endDate;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const parsed = parseMonth(month);
      const range = getMonthRange(parsed.year, parsed.month);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      startDate = normalizeToDay(from);
      endDate = normalizeToDay(to);

      if (!startDate || !endDate) {
        return res.status(400).json({
          message: "from/to (YYYY-MM-DD) ya month (YYYY-MM) zaroori hai.",
        });
      }

      endDate = new Date(endDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
    }

    const records = await Attendance.find({
      worker: workerId,
      date: { $gte: startDate, $lt: endDate },
    })
      .populate("markedBy", "name email role")
      .sort({ date: 1 });

    const totalDayFraction = records.reduce((sum, r) => sum + r.dayFraction, 0);

    res.status(200).json({
      message: "Hazri history mili.",
      worker: { _id: worker._id, name: worker.name, role: worker.role },
      totalDayFraction,
      data: records,
    });
  } catch (error) {
    res.status(500).json({ message: "Hazri history fetch karne mein masla aaya.", error: error.message });
  }
};

module.exports = {
  getDailyAttendance,
  getMonthlyAttendance,
  upsertAttendance,
  getWorkerAttendanceHistory,
};
