const Order = require("../models/Order");
const Menu = require("../models/Menu");
const Cart = require("../models/Cart");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const { sendPushToUser } = require("../services/pushNotificationService");

function getOrderStatusLabel(status) {
  const map = {
    pending: "menunggu konfirmasi",
    confirmed: "dikonfirmasi",
    preparing: "diproses",
    ready: "siap",
    on_delivery: "dalam pengantaran",
    delivered: "selesai",
    completed: "selesai",
    cancelled: "dibatalkan",
  };

  return map[status] || status;
}

function normalizeOrderStatus(status) {
  if (!status) return status;
  const normalized = String(status).trim().toLowerCase();
  return normalized === "completed" ? "delivered" : normalized;
}

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

    const restaurantStatus = restaurant.operatingStatus || (restaurant.isOpen === false ? "closed" : "open");
    if (restaurantStatus !== "open") {
      return res.status(400).json({
        success: false,
        message:
          restaurantStatus === "busy"
            ? "Restoran sedang sibuk dan belum bisa menerima pesanan"
            : "Restoran sedang tutup dan belum bisa menerima pesanan",
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

    // Sinkron dengan aplikasi: sementara ongkir dan pajak tidak dipakai.
    const deliveryFee = 0;
    const tax = 0;
    const totalPrice = subtotal;

    const normalizedPaymentMethod = paymentMethod || "cash";

    const userProfile = await User.findById(req.user._id);
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const selectedDeliveryAddress =
      deliveryAddress && typeof deliveryAddress === "object" ? deliveryAddress : null;
    const profilePrimaryAddress =
      Array.isArray(userProfile.deliveryAddresses) && userProfile.deliveryAddresses.length > 0
        ? userProfile.deliveryAddresses.find((item) => item.isPrimary) || userProfile.deliveryAddresses[0]
        : null;
    const profileDeliveryAddress = profilePrimaryAddress || userProfile.deliveryAddress || null;

    const normalizedDeliveryAddress = {
      street:
        selectedDeliveryAddress?.street ||
        selectedDeliveryAddress?.address ||
        profileDeliveryAddress?.address ||
        userProfile.address ||
        "",
      city: selectedDeliveryAddress?.city || "",
      postalCode: selectedDeliveryAddress?.postalCode || "",
      latitude:
        selectedDeliveryAddress?.latitude ??
        profileDeliveryAddress?.latitude ??
        undefined,
      longitude:
        selectedDeliveryAddress?.longitude ??
        profileDeliveryAddress?.longitude ??
        undefined,
    };

    if (!normalizedDeliveryAddress.street) {
      return res.status(400).json({
        success: false,
        message: "Alamat pengiriman belum tersedia. Simpan alamat pengiriman terlebih dahulu.",
      });
    }

    let buyerUser = null;
    let ownerUser = null;

    if (normalizedPaymentMethod === "wallet") {
      buyerUser = userProfile;
      ownerUser = await User.findById(restaurant.owner);

      if (!buyerUser || !ownerUser) {
        return res.status(404).json({
          success: false,
          message: "Akun user/owner tidak ditemukan",
        });
      }

      if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Total pembayaran tidak valid",
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
      deliveryAddress: normalizedDeliveryAddress,
      notes: notes || "",
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: normalizedPaymentMethod === "wallet" ? "paid" : "pending",
      ownerEarningCredited: false,
    });

    if (normalizedPaymentMethod === "wallet" && buyerUser && ownerUser) {
      const buyerBefore = buyerUser.walletBalance || 0;

      buyerUser.walletBalance = buyerBefore - totalPrice;

      await buyerUser.save();

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
    }

    // Hapus cart user
    await Cart.findOneAndDelete({ user: req.user._id });

    try {
      await sendPushToUser({
        userId: restaurant.owner,
        title: "Pesanan Baru",
        body: `Ada pesanan baru #${order._id.toString().slice(-6)} untuk restoran Anda`,
        data: {
          type: "ORDER_CREATED",
          screen: "ORDER_DETAIL",
          route: `order_detail/${order._id}`,
          orderId: order._id,
          restaurantId: restaurant._id,
        },
      });
    } catch (notifyErr) {
      console.error("Gagal kirim notif ke owner:", notifyErr.message);
    }

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

    const normalizedStatus = normalizeOrderStatus(status);
    if (normalizedStatus) {
      query.status = normalizedStatus;
    }

    const orders = await Order.find(query)
      .populate("restaurant", "name phone address logo banner")
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

// ==================== GET ORDERS BY USER ID (ADMIN) ====================

exports.getOrdersByUserIdAsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query = { user: userId };

    const normalizedStatus = normalizeOrderStatus(status);
    if (normalizedStatus) {
      query.status = normalizedStatus;
    }

    const orders = await Order.find(query)
      .populate("restaurant", "name phone address logo banner")
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
      .populate("restaurant", "name phone address logo banner owner")
      .populate("user", "name email phone")
      .populate("items.menu");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan",
      });
    }

    // Cek user atau owner restaurant
    const orderUserId = order.user && order.user._id
      ? order.user._id.toString()
      : order.user.toString();

    if (
      req.user.role !== "admin" &&
      orderUserId !== req.user._id.toString() &&
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

    // Cek owner/admin
    if (req.user.role !== "admin" && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    let query = { restaurant: restaurantId };

    const normalizedStatus = normalizeOrderStatus(status);
    if (normalizedStatus) {
      query.status = normalizedStatus;
    }

    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .populate("restaurant", "name phone address logo banner")
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

// ==================== GET OWNER ORDERS (ALL OWNED RESTAURANTS) ====================

exports.getOwnerOrders = async (req, res) => {
  try {
    const { status, restaurantId } = req.query;

    const ownerRestaurants = await Restaurant.find({ owner: req.user._id }).select("_id");
    const ownerRestaurantIds = ownerRestaurants.map((item) => item._id.toString());

    if (ownerRestaurantIds.length === 0) {
      return res.json({
        success: true,
        total: 0,
        orders: [],
      });
    }

    if (restaurantId && !ownerRestaurantIds.includes(String(restaurantId))) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke restoran ini",
      });
    }

    const query = {
      restaurant: restaurantId ? restaurantId : { $in: ownerRestaurantIds },
    };

    const normalizedStatus = normalizeOrderStatus(status);
    if (normalizedStatus) {
      query.status = normalizedStatus;
    }

    const orders = await Order.find(query)
      .populate("user", "name email phone")
      .populate("restaurant", "name phone address logo banner")
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
    const requestedStatus = req.body.status;
    const status = normalizeOrderStatus(requestedStatus);

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

    // Cek owner/admin
    if (req.user.role !== "admin" && order.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const currentStatus = order.status;
    if (currentStatus === status) {
      return res.json({
        success: true,
        message: "Status pesanan tidak berubah",
        order,
      });
    }

    const allowedTransitions = {
      pending: ["confirmed", "preparing", "delivered", "cancelled"],
      confirmed: ["preparing", "ready", "delivered", "cancelled"],
      preparing: ["ready", "on_delivery", "delivered", "cancelled"],
      ready: ["on_delivery", "delivered", "cancelled"],
      on_delivery: ["delivered", "cancelled"],
      delivered: [],
      cancelled: [],
    };

    const nextStatuses = allowedTransitions[currentStatus] || [];
    if (!nextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Transisi status tidak valid: ${currentStatus} -> ${status}`,
      });
    }

    const now = new Date();
    if (status === "preparing" && !order.processingStartedAt) {
      order.processingStartedAt = now;
    }
    if (status === "cancelled") {
      order.cancelledAt = now;
    }
    if (status === "delivered") {
      order.completedAt = now;
    }

    // Pendapatan owner masuk saat pesanan sudah siap (atau status sesudahnya bila transisi langsung).
    const shouldCreditOwner = ["ready", "on_delivery", "delivered"].includes(status);
    if (shouldCreditOwner && !order.ownerEarningCredited) {
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
        note: `Pendapatan order ${order._id} (pesanan siap)`,
      });

      order.ownerEarningCredited = true;
    }

    order.status = status;
    await order.save();

    try {
      const statusLabel = getOrderStatusLabel(status);
      await sendPushToUser({
        userId: order.user,
        title: "Status Pesanan Diperbarui",
        body: `Pesanan #${order._id.toString().slice(-6)} sekarang ${statusLabel}`,
        data: {
          type: "ORDER_STATUS_UPDATED",
          screen: "ORDER_DETAIL",
          route: `order_detail/${order._id}`,
          orderId: order._id,
          status,
        },
      });
    } catch (notifyErr) {
      console.error("Gagal kirim notif ke user:", notifyErr.message);
    }

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

    if (order.paymentMethod === "wallet" && order.paymentStatus === "paid") {
      const buyerUser = await User.findById(order.user);
      const restaurant = await Restaurant.findById(order.restaurant);
      const ownerUser = restaurant ? await User.findById(restaurant.owner) : null;

      if (!buyerUser) {
        return res.status(404).json({
          success: false,
          message: "Akun user tidak ditemukan untuk proses refund",
        });
      }

      const buyerBefore = buyerUser.walletBalance || 0;

      buyerUser.walletBalance = buyerBefore + order.totalPrice;

      await buyerUser.save();

      await WalletTransaction.create({
        user: buyerUser._id,
        direction: "in",
        amount: order.totalPrice,
        balanceBefore: buyerBefore,
        balanceAfter: buyerUser.walletBalance,
        type: "refund",
        order: order._id,
        counterparty: ownerUser?._id,
        actor: req.user._id,
        note: `Refund order ${order._id}`,
      });

      if (order.ownerEarningCredited) {
        if (!ownerUser) {
          return res.status(404).json({
            success: false,
            message: "Akun owner tidak ditemukan untuk proses refund",
          });
        }

        if ((ownerUser.walletBalance || 0) < order.totalPrice) {
          return res.status(400).json({
            success: false,
            message: "Refund gagal karena saldo owner tidak mencukupi",
          });
        }

        const ownerBefore = ownerUser.walletBalance || 0;
        ownerUser.walletBalance = ownerBefore - order.totalPrice;
        await ownerUser.save();

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
      }

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
