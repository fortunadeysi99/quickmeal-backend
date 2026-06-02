const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const Menu = require("../models/Menu");

// ==================== RESTAURANT CRUD ====================

exports.createRestaurant = async (req, res) => {
  try {
    const { name, description, address, phone, categories } = req.body;

    if (!name || !address || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, address, dan phone harus diisi",
      });
    }

    const restaurant = await Restaurant.create({
      owner: req.user._id,
      name,
      description,
      address,
      phone,
      categories: categories || [],
    });

    // Tambahkan ke restaurant list user
    await User.findByIdAndUpdate(req.user._id, {
      $push: { restaurants: restaurant._id },
    });

    res.status(201).json({
      success: true,
      message: "Restoran berhasil dibuat",
      restaurant,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getMyRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ owner: req.user._id })
      .populate("menus")
      .populate("owner", "name email phone");

    res.json({
      success: true,
      total: restaurants.length,
      restaurants,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getRestaurantById = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await Restaurant.findById(restaurantId)
      .populate("menus")
      .populate("owner", "name email phone");

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    res.json({
      success: true,
      restaurant,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getAllRestaurants = async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = { isOpen: true };

    if (category) {
      query.categories = { $in: [category] };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const restaurants = await Restaurant.find(query)
      .populate("menus")
      .populate("owner", "name");

    res.json({
      success: true,
      total: restaurants.length,
      restaurants,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { name, description, address, phone, categories, banner, logo, openingHours } = req.body;

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
        message: "Anda tidak memiliki akses untuk mengubah restoran ini",
      });
    }

    if (name) restaurant.name = name;
    if (description) restaurant.description = description;
    if (address) restaurant.address = address;
    if (phone) restaurant.phone = phone;
    if (categories) restaurant.categories = categories;
    if (banner) restaurant.banner = banner;
    if (logo) restaurant.logo = logo;
    if (openingHours) restaurant.openingHours = openingHours;

    await restaurant.save();

    res.json({
      success: true,
      message: "Restoran berhasil diperbarui",
      restaurant,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== LOKASI RESTORAN ====================

exports.updateRestaurantLocation = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude dan longitude harus diisi",
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

    restaurant.location = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    };

    await restaurant.save();

    res.json({
      success: true,
      message: "Lokasi restoran berhasil diperbarui",
      restaurant,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;

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

    await Restaurant.findByIdAndDelete(restaurantId);

    // Hapus dari user
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { restaurants: restaurantId },
    });

    res.json({
      success: true,
      message: "Restoran berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== KATEGORI RESTORAN ====================

exports.addCategories = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { categories } = req.body;

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: "Categories harus berupa array",
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

    // Tambahkan kategori (hindari duplikat)
    const newCategories = categories.filter(
      (cat) => !restaurant.categories.includes(cat)
    );

    restaurant.categories.push(...newCategories);
    await restaurant.save();

    res.json({
      success: true,
      message: "Kategori berhasil ditambahkan",
      categories: restaurant.categories,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.removeCategory = async (req, res) => {
  try {
    const { restaurantId, category } = req.params;

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

    restaurant.categories = restaurant.categories.filter(
      (cat) => cat !== category
    );
    await restaurant.save();

    res.json({
      success: true,
      message: "Kategori berhasil dihapus",
      categories: restaurant.categories,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
