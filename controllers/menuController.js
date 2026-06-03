const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const boyerMoore = require("../utils/boyerMoore");

// ==================== MENU CRUD ====================

exports.createMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const {
      name,
      description,
      category,
      price,
      stock,
      image,
      calories,
      preparationTime,
      spicy,
      vegetarian,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name dan price harus diisi",
      });
    }

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

    const menu = await Menu.create({
      restaurant: restaurantId,
      name,
      description,
      category: category || "Makanan",
      price,
      stock: stock || 0,
      image,
      calories,
      preparationTime,
      spicy: spicy || false,
      vegetarian: vegetarian || false,
    });

    // Tambahkan ke restaurant menus
    restaurant.menus.push(menu._id);
    await restaurant.save();

    res.status(201).json({
      success: true,
      message: "Menu berhasil dibuat",
      menu,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getRestaurantMenus = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { category, page = 1, limit = 20, available } = req.query;

    const query = { restaurant: restaurantId };

    if (category) {
      query.category = category;
    }
    if (available !== undefined) {
      query.isAvailable = available === "true";
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);

    const totalMenus = await Menu.countDocuments(query);
    const totalPages = Math.ceil(totalMenus / pageSize);

    const menus = await Menu.find(query)
      .populate("restaurant", "name phone address")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    res.json({
      success: true,
      total: totalMenus,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      menus,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getMenuById = async (req, res) => {
  try {
    const { menuId } = req.params;

    const menu = await Menu.findById(menuId)
      .populate("restaurant");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    res.json({
      success: true,
      menu,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateMenu = async (req, res) => {
  try {
    const { menuId } = req.params;
    const {
      name,
      description,
      category,
      price,
      stock,
      image,
      calories,
      preparationTime,
      spicy,
      vegetarian,
      isAvailable,
    } = req.body;

    const menu = await Menu.findById(menuId).populate("restaurant");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    // Cek owner
    if (menu.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (name) menu.name = name;
    if (description) menu.description = description;
    if (category) menu.category = category;
    if (price) menu.price = price;
    if (stock !== undefined) menu.stock = stock;
    if (image) menu.image = image;
    if (calories) menu.calories = calories;
    if (preparationTime) menu.preparationTime = preparationTime;
    if (spicy !== undefined) menu.spicy = spicy;
    if (vegetarian !== undefined) menu.vegetarian = vegetarian;
    if (isAvailable !== undefined) menu.isAvailable = isAvailable;

    await menu.save();

    res.json({
      success: true,
      message: "Menu berhasil diperbarui",
      menu,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteMenu = async (req, res) => {
  try {
    const { menuId } = req.params;

    const menu = await Menu.findById(menuId).populate("restaurant");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    // Cek owner
    if (menu.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const restaurantId = menu.restaurant._id;

    await Menu.findByIdAndDelete(menuId);

    // Hapus dari restaurant menus
    await Restaurant.findByIdAndUpdate(restaurantId, {
      $pull: { menus: menuId },
    });

    res.json({
      success: true,
      message: "Menu berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== SEARCH DENGAN BOYER-MOORE ====================

exports.searchMenuByName = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Query pencarian harus diisi",
      });
    }

    // Cari semua menu yang available
    const allMenus = await Menu.find({ isAvailable: true })
      .populate("restaurant");

    // Gunakan Boyer-Moore untuk search
    const searchResults = allMenus.filter((menu) => {
      return boyerMoore(menu.name.toLowerCase(), q.toLowerCase());
    });

    // Group hasil berdasarkan restaurant
    const groupedResults = {};

    searchResults.forEach((menu) => {
      const restaurantId = menu.restaurant._id;
      if (!groupedResults[restaurantId]) {
        groupedResults[restaurantId] = {
          restaurant: {
            _id: menu.restaurant._id,
            name: menu.restaurant.name,
            address: menu.restaurant.address,
            phone: menu.restaurant.phone,
            rating: menu.restaurant.rating,
            location: menu.restaurant.location,
          },
          menus: [],
        };
      }
      groupedResults[restaurantId].menus.push(menu);
    });

    const results = Object.values(groupedResults);

    res.json({
      success: true,
      query: q,
      total: searchResults.length,
      restaurantsFound: results.length,
      results,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
