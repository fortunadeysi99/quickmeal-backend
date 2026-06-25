const Order = require("../models/Order");
const Menu = require("../models/Menu");
const Cart = require("../models/Cart");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");

// ==================== CREATE ORDER ====================

exports.createOrder = async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress, notes, paymentMethod } = req.body;

    if (!restaurantId || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID dan items harus diisi",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    // Hitung total harga
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const menu = await Menu.findById(item.menuId);

      if (!menu) {
        return res.status(404).json({
          success: false,
          message: `Menu dengan ID ${item.menuId} tidak ditemukan`,
        });
      }

      if (!menu.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `Menu ${menu.name} tidak tersedia`,
        });
      }

      if (menu.stock < item.qty) {
        return res.status(400).json({
          success: false,
          message: `Stok menu ${menu.name} tidak cukup (stok: ${menu.stock})`,
        });
      }

      const itemSubtotal = menu.price * item.qty;
      subtotal += itemSubtotal;

      orderItems.push({
        menu: menu._id,
        name: menu.name,
        price: menu.price,
        qty: item.qty,
        subtotal: itemSubtotal,
      });

      // Kurangi stok
      menu.stock -= item.qty;
      await menu.save();
    }

    // Hitung biaya delivery dan pajak
    const deliveryFee = 5000; // Fixed delivery fee, bisa disesuaikan
    const tax = Math.round(subtotal * 0.1); // 10% tax
    const totalPrice = subtotal + deliveryFee + tax;

    const normalizedPaymentMethod = paymentMethod || "cash";

    let buyerUser = null;
    let ownerUser = null;

    if (normalizedPaymentMethod === "wallet") {
      buyerUser = await User.findById(req.user._id);
      ownerUser = await User.findById(restaurant.owner);

      if (!buyerUser || !ownerUser) {
        return res.status(404).json({
          success: false,
          message: "Akun user/owner tidak ditemukan",
        });
      }

      if ((buyerUser.walletBalance || 0) < totalPrice) {
        return res.status(400).json({
          success: false,
          message: "Saldo wallet tidak cukup",
        });
      }
    }

    const order = await Order.create({
      user: req.user._id,
      restaurant: restaurantId,
      items: orderItems,
      subtotal,
      deliveryFee,
      tax,
      totalPrice,
      deliveryAddress: deliveryAddress || {},
      notes: notes || "",
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: normalizedPaymentMethod === "wallet" ? "paid" : "pending",
      ownerEarningCredited: normalizedPaymentMethod === "wallet",
    });

    if (normalizedPaymentMethod === "wallet" && buyerUser && ownerUser) {
      const buyerBefore = buyerUser.walletBalance || 0;
      const ownerBefore = ownerUser.walletBalance || 0;

      buyerUser.walletBalance = buyerBefore - totalPrice;
      ownerUser.walletBalance = ownerBefore + totalPrice;

      await buyerUser.save();
      await ownerUser.save();

      await WalletTransaction.create({
        user: buyerUser._id,
        direction: "out",
        amount: totalPrice,
        balanceBefore: buyerBefore,
        balanceAfter: buyerUser.walletBalance,
        type: "purchase",
        order: order._id,
        counterparty: ownerUser._id,
        actor: buyerUser._id,
        note: `Pembayaran order ${order._id}`,
      });

      await WalletTransaction.create({
        user: ownerUser._id,
        direction: "in",
        amount: totalPrice,
        balanceBefore: ownerBefore,
        balanceAfter: ownerUser.walletBalance,
        type: "sale",
        order: order._id,
        counterparty: buyerUser._id,
        actor: buyerUser._id,
        note: `Pendapatan order ${order._id}`,
      });
    }

    // Hapus cart user
    await Cart.findOneAndDelete({ user: req.user._id });

    res.status(201).json({
      success: true,
      message: "Pesanan berhasil dibuat",
      order: await order.populate("restaurant"),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET MY ORDERS ====================

exports.getMyOrders = async (req, res) => {
  try {
    const { status } = req.query;

    let query = { user: req.user._id };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate("restaurant", "name phone address")
      .populate("items.menu")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: orders.length,
      orders,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET ORDER BY ID ====================

exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate("restaurant")
      .populate("items.menu");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan",
      });
    }

    // Cek user atau owner restaurant
    if (
      order.user.toString() !== req.user._id.toString() &&
      order.restaurant.owner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    res.json({
      success: true,
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET RESTAURANT ORDERS (OWNER) ====================

exports.getRestaurantOrders = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { status } = req.query;

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    // Cek owner
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    let query = { restaurant: restaurantId };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .populate("items.menu")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: orders.length,
      orders,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== UPDATE ORDER STATUS (OWNER) ====================

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status harus diisi",
      });
    }

    const validStatuses = ["pending", "confirmed", "preparing", "ready", "on_delivery", "delivered", "cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid",
      });
    }

    const order = await Order.findById(orderId).populate("restaurant");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan",
      });
    }

    // Cek owner
    if (order.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    // Untuk metode pembayaran non-wallet, pendapatan owner baru masuk wallet saat order delivered.
    if (status === "delivered" && !order.ownerEarningCredited) {
      const ownerUser = await User.findById(order.restaurant.owner);

      if (!ownerUser) {
        return res.status(404).json({
          success: false,
          message: "Owner restoran tidak ditemukan",
        });
      }

      const ownerBefore = ownerUser.walletBalance || 0;
      ownerUser.walletBalance = ownerBefore + order.totalPrice;
      await ownerUser.save();

      await WalletTransaction.create({
        user: ownerUser._id,
        direction: "in",
        amount: order.totalPrice,
        balanceBefore: ownerBefore,
        balanceAfter: ownerUser.walletBalance,
        type: "sale",
        order: order._id,
        counterparty: order.user,
        actor: req.user._id,
        note: `Pendapatan order ${order._id}`,
      });

      order.ownerEarningCredited = true;
    }

    order.status = status;
    await order.save();

    res.json({
      success: true,
      message: "Status pesanan berhasil diperbarui",
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== UPDATE PAYMENT STATUS ====================

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        message: "Payment status harus diisi",
      });
    }

    const validStatuses = ["pending", "paid", "failed"];

    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Payment status tidak valid",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan",
      });
    }

    // Cek user
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    order.paymentStatus = paymentStatus;
    await order.save();

    res.json({
      success: true,
      message: "Status pembayaran berhasil diperbarui",
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== CANCEL ORDER ====================

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan",
      });
    }

    // Cek user
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (order.status !== "pending" && order.status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Pesanan tidak dapat dibatalkan pada status ini",
      });
    }

    // Kembalikan stok
    for (const item of order.items) {
      await Menu.findByIdAndUpdate(item.menu, {
        $inc: { stock: item.qty },
      });
    }

    if (
      order.paymentMethod === "wallet" &&
      order.paymentStatus === "paid" &&
      order.ownerEarningCredited
    ) {
      const buyerUser = await User.findById(order.user);
      const restaurant = await Restaurant.findById(order.restaurant);
      const ownerUser = restaurant ? await User.findById(restaurant.owner) : null;

      if (!buyerUser || !ownerUser) {
        return res.status(404).json({
          success: false,
          message: "Akun user/owner tidak ditemukan untuk proses refund",
        });
      }

      if ((ownerUser.walletBalance || 0) < order.totalPrice) {
        return res.status(400).json({
          success: false,
          message: "Refund gagal karena saldo owner tidak mencukupi",
        });
      }

      const buyerBefore = buyerUser.walletBalance || 0;
      const ownerBefore = ownerUser.walletBalance || 0;

      buyerUser.walletBalance = buyerBefore + order.totalPrice;
      ownerUser.walletBalance = ownerBefore - order.totalPrice;

      await buyerUser.save();
      await ownerUser.save();

      await WalletTransaction.create({
        user: buyerUser._id,
        direction: "in",
        amount: order.totalPrice,
        balanceBefore: buyerBefore,
        balanceAfter: buyerUser.walletBalance,
        type: "refund",
        order: order._id,
        counterparty: ownerUser._id,
        actor: req.user._id,
        note: `Refund order ${order._id}`,
      });

      await WalletTransaction.create({
        user: ownerUser._id,
        direction: "out",
        amount: order.totalPrice,
        balanceBefore: ownerBefore,
        balanceAfter: ownerUser.walletBalance,
        type: "refund",
        order: order._id,
        counterparty: buyerUser._id,
        actor: req.user._id,
        note: `Pengembalian dana order ${order._id}`,
      });

      order.ownerEarningCredited = false;
      order.paymentStatus = "failed";
    }

    order.status = "cancelled";
    await order.save();

    res.json({
      success: true,
      message: "Pesanan berhasil dibatalkan",
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
