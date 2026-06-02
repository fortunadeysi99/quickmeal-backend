const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    icon: {
      type: String,
    },
    // Urutan tampilan kategori
    order: {
      type: Number,
      default: 0,
    },
    // Menus dalam kategori ini
    menus: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Menu",
    }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Category", categorySchema);
