const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    subcategories: [
      {
        name: {
          type: String,
          trim: true,
          required: true,
        },
        subSubcategories: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
