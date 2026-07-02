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
    deliveryAddress: {
      address: {
        type: String,
      },
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
      notes: {
        type: String,
      },
    },
    deliveryAddresses: [
      {
        label: {
          type: String,
          default: "Utama",
        },
        address: {
          type: String,
        },
        latitude: {
          type: Number,
        },
        longitude: {
          type: Number,
        },
        notes: {
          type: String,
          default: "",
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],
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
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
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
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);