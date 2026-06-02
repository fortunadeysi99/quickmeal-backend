const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema(
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
    category: {
      type: String,
      default: "Makanan",
    },
    price: {
      type: Number,
      required: true,
    },
    // Stok makanan
    stock: {
      type: Number,
      default: 0,
    },
    // Apakah tersedia
    isAvailable: {
      type: Boolean,
      default: true,
    },
    image: {
      type: String,
    },
    // Rating menu
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    // Info nutrisional (optional)
    calories: Number,
    preparationTime: Number, // dalam menit
    spicy: {
      type: Boolean,
      default: false,
    },
    vegetarian: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Menu", menuSchema);