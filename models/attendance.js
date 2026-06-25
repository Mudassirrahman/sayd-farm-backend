const mongoose = require("mongoose");

const ATTENDANCE_STATUSES = ["absent", "full", "half"];

const DAY_FRACTION_MAP = {
  absent: 0,
  half: 0.5,
  full: 1,
};

const attendanceSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Worker",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
    },
    /** Present-day weight: absent=0, half=0.5, full=1 */
    dayFraction: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

attendanceSchema.index({ worker: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ worker: 1, date: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.DAY_FRACTION_MAP = DAY_FRACTION_MAP;
