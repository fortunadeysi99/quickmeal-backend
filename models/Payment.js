const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet", "bank_transfer"],
      default: "cash",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "refunded"],
      default: "pending",
    },
    transactionId: String,
    // Info pembayaran gateway (jika menggunakan midtrans, xendit, dll)
    gatewayResponse: mongoose.Schema.Types.Mixed,
    // Bukti pembayaran (untuk bank transfer)
    paymentProof: String,
    // Notes
    notes: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
