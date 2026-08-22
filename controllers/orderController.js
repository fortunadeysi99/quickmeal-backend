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

function calculateDistanceMeters(fromLat, fromLng, toLat, toLng) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latDiff = toRadians(toLat - fromLat);
  const lngDiff = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function startOfToday(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfWeekMonday(date = new Date()) {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildDayRange(date = new Date()) {
  const start = startOfToday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// ==================== HOME DASHBOARD BY ROLE ====================

exports.getHomeDashboard = async (req, res) => {
  try {
    const role = req.user?.role;
    const now = new Date();

    if (!role || !["user", "owner", "admin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Role tidak memiliki akses dashboard",
      });
    }

    if (role === "user") {
      const parsedLat = Number(req.query.userLat);
      const parsedLng = Number(req.query.userLng);
      const userLat = Number.isFinite(parsedLat) ? parsedLat : null;
      const userLng = Number.isFinite(parsedLng) ? parsedLng : null;
      const hasLocation = Number.isFinite(userLat) && Number.isFinite(userLng);

      const restaurants = await Restaurant.find({})
        .select("name address logo banner location operatingStatus isOpen createdAt")
        .lean();

      const nearestRestaurants = restaurants
        .map((restaurant) => {
          const latitude = restaurant.location?.latitude;
          const longitude = restaurant.location?.longitude;
          const hasRestaurantLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

          return {
            _id: restaurant._id,
            name: restaurant.name,
            address: restaurant.address,
            logo: restaurant.logo || null,
            banner: restaurant.banner || null,
            operatingStatus: restaurant.operatingStatus || (restaurant.isOpen === false ? "closed" : "open"),
            distanceMeters:
              hasLocation && hasRestaurantLocation
                ? calculateDistanceMeters(userLat, userLng, latitude, longitude)
                : null,
            createdAt: restaurant.createdAt,
          };
        })
        .sort((left, right) => {
          if (left.distanceMeters == null && right.distanceMeters == null) {
            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          }
          if (left.distanceMeters == null) return 1;
          if (right.distanceMeters == null) return -1;
          return left.distanceMeters - right.distanceMeters;
        })
        .slice(0, 5);

      const popularAggregated = await Order.aggregate([
        {
          $match: {
            user: { $ne: req.user._id },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: "$restaurant",
            totalOrders: { $sum: 1 },
            totalQty: { $sum: { $sum: "$items.qty" } },
          },
        },
        { $sort: { totalOrders: -1, totalQty: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "restaurants",
            localField: "_id",
            foreignField: "_id",
            as: "restaurant",
          },
        },
        { $unwind: "$restaurant" },
        {
          $project: {
            _id: "$restaurant._id",
            name: "$restaurant.name",
            address: "$restaurant.address",
            logo: "$restaurant.logo",
            banner: "$restaurant.banner",
            operatingStatus: "$restaurant.operatingStatus",
            totalOrders: 1,
            totalQty: 1,
          },
        },
      ]);

      const popularTopMenus = await Order.aggregate([
        {
          $match: {
            user: { $ne: req.user._id },
            status: { $ne: "cancelled" },
          },
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              restaurant: "$restaurant",
              menu: "$items.menu",
            },
            menuQty: { $sum: "$items.qty" },
          },
        },
        {
          $lookup: {
            from: "menus",
            localField: "_id.menu",
            foreignField: "_id",
            as: "menu",
          },
        },
        {
          $unwind: {
            path: "$menu",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            restaurantId: "$_id.restaurant",
            menuQty: 1,
            menuName: "$menu.name",
            menuImage: "$menu.image",
            menuPrice: "$menu.price",
          },
        },
        { $sort: { restaurantId: 1, menuQty: -1 } },
        {
          $group: {
            _id: "$restaurantId",
            topMenus: {
              $push: {
                name: "$menuName",
                image: "$menuImage",
                price: "$menuPrice",
                qty: "$menuQty",
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            topMenus: { $slice: ["$topMenus", 5] },
          },
        },
      ]);

      const topMenuByRestaurant = new Map(
        popularTopMenus.map((item) => [item._id.toString(), item])
      );

      const popularRestaurants = popularAggregated.map((restaurant) => {
        const key = restaurant._id?.toString();
        const topMenu = key ? topMenuByRestaurant.get(key) : null;
        const topMenus = topMenu?.topMenus || [];
        const firstTopMenu = topMenus[0] || null;

        return {
          ...restaurant,
          topMenuName: firstTopMenu?.name || null,
          topMenuQty: firstTopMenu?.qty || null,
          topMenuImage: firstTopMenu?.image || null,
          topMenuPrice: firstTopMenu?.price || null,
          topMenus,
        };
      });

      const { start: todayStart, end: tomorrowStart } = buildDayRange(now);

      const activeTodayOrders = await Order.find({
        user: req.user._id,
        createdAt: { $gte: todayStart, $lt: tomorrowStart },
        status: { $in: ["pending", "confirmed", "preparing", "ready", "on_delivery"] },
      })
        .populate("restaurant", "name address phone logo banner")
        .populate("items.menu")
        .sort({ createdAt: -1 })
        .lean();

      return res.json({
        success: true,
        role,
        generatedAt: now,
        userDashboard: {
          nearestRestaurants,
          popularRestaurants,
          todayActiveOrders: activeTodayOrders,
        },
      });
    }

    if (role === "owner") {
      const ownerRestaurants = await Restaurant.find({ owner: req.user._id }).select("_id").lean();
      const ownerRestaurantIds = ownerRestaurants.map((item) => item._id);

      if (ownerRestaurantIds.length === 0) {
        return res.json({
          success: true,
          role,
          generatedAt: now,
          ownerDashboard: {
            today: {
              totalOrders: 0,
              waitingOrders: 0,
              processingOrders: 0,
              completedOrders: 0,
            },
            latestOrders: [],
          },
        });
      }

      const { start: todayStart, end: tomorrowStart } = buildDayRange(now);

      const [totalToday, waitingToday, processingToday, completedToday, latestOrders] = await Promise.all([
        Order.countDocuments({
          restaurant: { $in: ownerRestaurantIds },
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
        }),
        Order.countDocuments({
          restaurant: { $in: ownerRestaurantIds },
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
          status: { $in: ["pending", "confirmed"] },
        }),
        Order.countDocuments({
          restaurant: { $in: ownerRestaurantIds },
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
          status: { $in: ["preparing", "ready", "on_delivery"] },
        }),
        Order.countDocuments({
          restaurant: { $in: ownerRestaurantIds },
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
          status: "delivered",
        }),
        Order.find({ restaurant: { $in: ownerRestaurantIds } })
          .populate("user", "name email phone")
          .populate("restaurant", "name address logo banner")
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);

      return res.json({
        success: true,
        role,
        generatedAt: now,
        ownerDashboard: {
          today: {
            totalOrders: totalToday,
            waitingOrders: waitingToday,
            processingOrders: processingToday,
            completedOrders: completedToday,
          },
          latestOrders,
        },
      });
    }

    const weekStart = startOfWeekMonday(now);

    const [
      usersThisWeek,
      restaurantsThisWeek,
      ordersThisWeek,
      latestUsers,
      latestRestaurants,
    ] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: weekStart }, status: { $ne: "deleted" } }),
      Restaurant.countDocuments({ createdAt: { $gte: weekStart } }),
      Order.countDocuments({ createdAt: { $gte: weekStart } }),
      User.find({ status: { $ne: "deleted" } })
        .select("name email role createdAt avatar")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Restaurant.find({})
        .select("name address phone logo banner operatingStatus createdAt owner")
        .populate("owner", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const latestRestaurantsWithOwner = latestRestaurants.map((restaurant) => ({
      ...restaurant,
      ownerName: restaurant?.owner?.name || null,
    }));

    return res.json({
      success: true,
      role,
      generatedAt: now,
      adminDashboard: {
        thisWeek: {
          users: usersThisWeek,
          restaurants: restaurantsThisWeek,
          orders: ordersThisWeek,
        },
        latestUsers,
        latestRestaurants: latestRestaurantsWithOwner,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

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
    let payableSubtotal = 0;
    let totalDiscount = 0;
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

      const normalizedVariantName = String(item.variantName || "").trim();
      const selectedVariant = normalizedVariantName
        ? (menu.variants || []).find(
            (variant) => String(variant.name || "").trim() === normalizedVariantName,
          )
        : null;

      if (normalizedVariantName && !selectedVariant) {
        return res.status(400).json({
          success: false,
          message: `Varian menu ${menu.name} tidak valid`,
        });
      }

      const unitPrice = selectedVariant
        ? Number(selectedVariant.discountPrice ?? selectedVariant.price)
        : Number(menu.discountPrice ?? menu.price);
      const originalPrice = selectedVariant
        ? Number(selectedVariant.price)
        : Number(menu.price);
      const discountPrice = selectedVariant?.discountPrice ?? menu.discountPrice ?? null;
      const discountAmount = Math.max(originalPrice - unitPrice, 0);
      const itemSubtotal = unitPrice * item.qty;
      subtotal += originalPrice * item.qty;
      payableSubtotal += itemSubtotal;
      totalDiscount += discountAmount * item.qty;

      orderItems.push({
        menu: menu._id,
        name: normalizedVariantName ? `${menu.name} (${normalizedVariantName})` : menu.name,
        price: unitPrice,
        originalPrice,
        discountPrice,
        discountAmount,
        variantName: normalizedVariantName || null,
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
    const totalPrice = payableSubtotal;

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
      totalDiscount,
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
