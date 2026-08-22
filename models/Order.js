const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    items: [
      {
        menu: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Menu",
        },
        name: String,
        price: Number,
        originalPrice: Number,
        discountPrice: Number,
        discountAmount: Number,
        variantName: String,
        qty: {
          type: Number,
          required: true,
        },
        subtotal: Number,
      },
    ],
    subtotal: {
      type: Number,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    // Alamat pengiriman
    deliveryAddress: {
      street: String,
      city: String,
      postalCode: String,
      latitude: Number,
      longitude: Number,
    },
    // Catatan khusus untuk pesanan
    notes: String,
    // Status pesanan
    status: {
      type: String,
      enum: ["pending", "confirmed", "preparing", "ready", "on_delivery", "delivered", "cancelled"],
      default: "pending",
    },
    // Status pembayaran
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet", "bank_transfer"],
      default: "cash",
    },
    ownerEarningCredited: {
      type: Boolean,
      default: false,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Rating dan review
    rating: Number,
    review: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);