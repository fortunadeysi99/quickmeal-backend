const Order = require("../models/Order");
const Menu = require("../models/Menu");
const Cart = require("../models/Cart");
const Restaurant = require("../models/Restaurant");

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
      paymentMethod: paymentMethod || "cash",
    });

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
