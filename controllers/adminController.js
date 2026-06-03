const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");
const Order = require("../models/Order");
const Category = require("../models/Category");

// ==================== OVERVIEW / STATS ====================
exports.getOverview = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const totalOwners = await User.countDocuments({ role: "owner" });
    const totalAdmins = await User.countDocuments({ role: "admin" });
    const totalRestaurants = await Restaurant.countDocuments();
    const totalMenus = await Menu.countDocuments();
    const totalOrders = await Order.countDocuments();

    res.json({
      success: true,
      totals: {
        users: totalUsers,
        owners: totalOwners,
        admins: totalAdmins,
        restaurants: totalRestaurants,
        menus: totalMenus,
        orders: totalOrders,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIST USERS ====================
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").populate("restaurants");

    res.json({ success: true, total: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIST OWNERS ====================
exports.getAllOwners = async (req, res) => {
  try {
    const owners = await User.find({ role: "owner" }).select("-password").populate("restaurants");

    res.json({ success: true, total: owners.length, owners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIST RESTAURANTS ====================
exports.getAllRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find().populate("owner", "name email").populate("menus");

    res.json({ success: true, total: restaurants.length, restaurants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIST MENUS ====================
exports.getAllMenus = async (req, res) => {
  try {
    const menus = await Menu.find().populate("restaurant", "name address");

    res.json({ success: true, total: menus.length, menus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIST ORDERS or ORDERS BY USER ====================
exports.getOrders = async (req, res) => {
  try {
    const {
      userId,
      status,
      paymentStatus,
      restaurantId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    if (userId) filter.user = userId;
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (restaurantId) filter.restaurant = restaurantId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);

    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / pageSize);

    const orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("restaurant", "name address")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    res.json({
      success: true,
      total: totalOrders,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      orders,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== ORDERS BY USER (param) ====================
exports.getOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await Order.find({ user: userId }).populate("restaurant", "name address");

    res.json({ success: true, total: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== ADMIN UPDATE CATEGORY ====================
exports.updateCategoryAsAdmin = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, icon, order } = req.body;

    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({ success: false, message: "Kategori tidak ditemukan" });
    }

    if (name) category.name = name;
    if (description) category.description = description;
    if (icon) category.icon = icon;
    if (order !== undefined) category.order = order;

    await category.save();

    res.json({ success: true, message: "Kategori berhasil diperbarui oleh admin", category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
