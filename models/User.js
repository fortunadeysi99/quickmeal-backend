const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
    },
    role: {
      type: String,
      enum: ["admin", "owner", "user"],
      default: "user",
    },
    avatar: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // Untuk owner - reference ke restaurant yang dikelola
    restaurants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    }],
    // Untuk user - wishlist
    wishlist: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Menu",
    }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);