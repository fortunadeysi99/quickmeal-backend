const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    // Kategori restoran (e.g., "Indonesian", "Chinese", "Fast Food", dll)
    categories: [{
      type: String,
    }],
    // Koordinat Google Maps
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },
    // Banner/Cover image
    banner: {
      type: String,
    },
    logo: {
      type: String,
    },
    // Rating dari user
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    // Jumlah rating/review
    reviewCount: {
      type: Number,
      default: 0,
    },
    // Status operasional restoran
    isOpen: {
      type: Boolean,
      default: true,
    },
    // Jam operasional
    openingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String },
    },
    // Menu yang tersedia
    menus: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Menu",
    }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Restaurant", restaurantSchema);