const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const Category = require("../models/Category");
const boyerMoore = require("../utils/boyerMoore");

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];

  return variants
    .map((variant) => ({
      name: String(variant?.name || "").trim(),
      price: Number(variant?.price || 0),
    }))
    .filter((variant) => variant.name && Number.isFinite(variant.price) && variant.price >= 0);
}

async function resolveCategoryForRestaurant(restaurantId, categoryId) {
  if (!categoryId) return null;
  return Category.findOne({ _id: categoryId, restaurant: restaurantId });
}

// ==================== MENU CRUD ====================

exports.createMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const {
      name,
      description,
      categoryId,
      category,
      price,
      image,
      variants,
      isAvailable,
    } = req.body;

    if (!name || price === undefined || price === null) {
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

    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const selectedCategory = await resolveCategoryForRestaurant(
      restaurantId,
      categoryId || category
    );

    if (!selectedCategory) {
      return res.status(400).json({
        success: false,
        message: "Kategori tidak valid untuk restoran ini",
      });
    }

    const menu = await Menu.create({
      restaurant: restaurantId,
      name,
      description,
      category: selectedCategory._id,
      price,
      image,
      variants: normalizeVariants(variants),
      isAvailable: isAvailable !== undefined ? !!isAvailable : true,
    });

    restaurant.menus.push(menu._id);
    await restaurant.save();

    const populatedMenu = await Menu.findById(menu._id).populate("category", "name");

    return res.status(201).json({
      success: true,
      message: "Menu berhasil dibuat",
      menu: populatedMenu,
    });
  } catch (err) {
    return res.status(500).json({
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

    if (category) query.category = category;
    if (available !== undefined) query.isAvailable = available === "true";

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);

    const totalMenus = await Menu.countDocuments(query);
    const totalPages = Math.ceil(totalMenus / pageSize);

    const menus = await Menu.find(query)
      .populate("restaurant", "name phone address")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      success: true,
      total: totalMenus,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      menus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getMenuById = async (req, res) => {
  try {
    const { menuId } = req.params;

    const menu = await Menu.findById(menuId)
      .populate("restaurant")
      .populate("category", "name");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      menu,
    });
  } catch (err) {
    return res.status(500).json({
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
      categoryId,
      category,
      price,
      image,
      variants,
      isAvailable,
    } = req.body;

    const menu = await Menu.findById(menuId)
      .populate("restaurant")
      .populate("category", "name");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    if (menu.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (categoryId || category) {
      const selectedCategory = await resolveCategoryForRestaurant(
        menu.restaurant._id,
        categoryId || category
      );

      if (!selectedCategory) {
        return res.status(400).json({
          success: false,
          message: "Kategori tidak valid untuk restoran ini",
        });
      }

      menu.category = selectedCategory._id;
    }

    if (name !== undefined) menu.name = name;
    if (description !== undefined) menu.description = description;
    if (price !== undefined) menu.price = price;
    if (image !== undefined) menu.image = image;
    if (variants !== undefined) menu.variants = normalizeVariants(variants);
    if (isAvailable !== undefined) menu.isAvailable = !!isAvailable;

    await menu.save();

    const refreshedMenu = await Menu.findById(menu._id).populate("category", "name");

    return res.json({
      success: true,
      message: "Menu berhasil diperbarui",
      menu: refreshedMenu,
    });
  } catch (err) {
    return res.status(500).json({
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

    if (menu.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const restaurantId = menu.restaurant._id;

    await Menu.findByIdAndDelete(menuId);

    await Restaurant.findByIdAndUpdate(restaurantId, {
      $pull: { menus: menuId },
    });

    return res.json({
      success: true,
      message: "Menu berhasil dihapus",
    });
  } catch (err) {
    return res.status(500).json({
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

    const allMenus = await Menu.find({ isAvailable: true })
      .populate("restaurant")
      .populate("category", "name");

    const searchResults = allMenus.filter((menu) => {
      return boyerMoore(menu.name.toLowerCase(), q.toLowerCase());
    });

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

    return res.json({
      success: true,
      query: q,
      total: searchResults.length,
      restaurantsFound: results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
