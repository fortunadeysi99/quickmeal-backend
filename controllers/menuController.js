const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const Category = require("../models/Category");
const boyerMoore = require("../utils/boyerMoore");

function canManageRestaurant(reqUser, ownerId) {
  if (!reqUser) return false;
  if (reqUser.role === "admin") return true;
  return ownerId.toString() === reqUser._id.toString();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function collectMatchedFields(menu, restaurant, queryLower) {
  const matched = [];
  const pushIfMatch = (label, value) => {
    if (!value) return;
    const normalized = String(value).toLowerCase();
    if (boyerMoore(normalized, queryLower)) {
      matched.push(label);
    }
  };

  pushIfMatch("restaurant_name", restaurant?.name);
  pushIfMatch("restaurant_description", restaurant?.description);
  pushIfMatch("menu_name", menu?.name);
  pushIfMatch("menu_description", menu?.description);
  pushIfMatch("category", menu?.category?.name);

  if (Array.isArray(menu?.variants)) {
    menu.variants.forEach((variant) => {
      pushIfMatch("variant", variant?.name);
    });
  }

  return [...new Set(matched)];
}

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
  return Category.findOne({
    _id: categoryId,
    restaurant: restaurantId,
    status: { $ne: "deleted" },
  });
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

    if (!canManageRestaurant(req.user, restaurant.owner)) {
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
    const { category, page = 1, limit = 20, available, status } = req.query;

    const query = { restaurant: restaurantId };

    if (status === "deleted") {
      query.status = "deleted";
    } else if (status !== "all") {
      query.status = { $ne: "deleted" };
    }

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
    const { status } = req.query;

    const menuFilter = { _id: menuId };
    if (status === "deleted") {
      menuFilter.status = "deleted";
    } else if (status !== "all") {
      menuFilter.status = { $ne: "deleted" };
    }

    const menu = await Menu.findOne(menuFilter)
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

    const menu = await Menu.findOne({
      _id: menuId,
      status: { $ne: "deleted" },
    })
      .populate("restaurant")
      .populate("category", "name");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    if (!canManageRestaurant(req.user, menu.restaurant.owner)) {
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

    const menu = await Menu.findOne({
      _id: menuId,
      status: { $ne: "deleted" },
    }).populate("restaurant");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    if (!canManageRestaurant(req.user, menu.restaurant.owner)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const restaurantId = menu.restaurant._id;

    menu.status = "deleted";
    menu.deletedAt = new Date();
    await menu.save();

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
    const {
      q,
      category,
      userLat,
      userLng,
      maxDistance,
      menuLimit = 3,
      status = "all"
    } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Query pencarian harus diisi",
      });
    }

    const limitPerRestaurant = Math.max(parseInt(menuLimit, 10) || 3, 1);
    const userLatitude = Number(userLat);
    const userLongitude = Number(userLng);
    const hasUserLocation = Number.isFinite(userLatitude) && Number.isFinite(userLongitude);
    const maxDistanceMeters = Number.isFinite(Number(maxDistance))
      ? Math.max(Number(maxDistance), 0)
      : null;

    const menuQuery = {
      isAvailable: true,
    };

    if (status === "deleted") {
      menuQuery.status = "deleted";
    } else if (status !== "all") {
      menuQuery.status = { $ne: "deleted" };
    }

    const allMenus = await Menu.find(menuQuery)
      .populate("restaurant")
      .populate("category", "name");

    const queryLower = q.toLowerCase();
    const groupedResults = {};

    allMenus.forEach((menu) => {
      const restaurant = menu.restaurant;
      if (!restaurant) return;

      if (category) {
        const categoryName = menu.category?.name?.toLowerCase() || "";
        if (!boyerMoore(categoryName, String(category).toLowerCase())) {
          return;
        }
      }

      const matchedFields = collectMatchedFields(menu, restaurant, queryLower);
      if (matchedFields.length === 0) return;

      const restaurantId = String(restaurant._id);

      if (!groupedResults[restaurantId]) {
        let distanceMeters = null;
        const restaurantLat = Number(restaurant.location?.latitude);
        const restaurantLng = Number(restaurant.location?.longitude);
        const canMeasureDistance =
          hasUserLocation && Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng);

        if (canMeasureDistance) {
          distanceMeters = Math.round(
            haversineMeters(userLatitude, userLongitude, restaurantLat, restaurantLng)
          );

          if (maxDistanceMeters !== null && distanceMeters > maxDistanceMeters) {
            return;
          }
        }

        groupedResults[restaurantId] = {
          restaurant: {
            _id: restaurant._id,
            name: restaurant.name,
            description: restaurant.description || "",
            address: restaurant.address,
            phone: restaurant.phone,
            logo: restaurant.logo || null,
            banner: restaurant.banner || null,
            rating: restaurant.rating,
            location: restaurant.location,
            distanceMeters,
          },
          menus: [],
          totalMatchedMenus: 0,
          matchedOn: new Set(),
        };
      }

      const restaurantBucket = groupedResults[restaurantId];

      if (restaurantBucket.menus.length < limitPerRestaurant) {
        restaurantBucket.menus.push(menu);
      }

      restaurantBucket.totalMatchedMenus += 1;
      matchedFields.forEach((field) => restaurantBucket.matchedOn.add(field));
    });

    const results = Object.values(groupedResults)
      .map((item) => ({
        ...item,
        hasMoreMenus: item.totalMatchedMenus > item.menus.length,
        matchedOn: Array.from(item.matchedOn),
      }))
      .sort((a, b) => {
        const distanceA = a.restaurant.distanceMeters;
        const distanceB = b.restaurant.distanceMeters;

        if (distanceA != null && distanceB != null) {
          if (distanceA !== distanceB) return distanceA - distanceB;
        } else if (distanceA != null) {
          return -1;
        } else if (distanceB != null) {
          return 1;
        }

        return b.totalMatchedMenus - a.totalMatchedMenus;
      });

    const totalMenusMatched = results.reduce((acc, item) => acc + item.totalMatchedMenus, 0);

    return res.json({
      success: true,
      query: q,
      total: totalMenusMatched,
      restaurantsFound: results.length,
      appliedFilters: {
        category: category || null,
        maxDistance: maxDistanceMeters,
        menuLimit: limitPerRestaurant,
      },
      results,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
