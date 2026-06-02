const Category = require("../models/Category");
const Restaurant = require("../models/Restaurant");

// ==================== CREATE CATEGORY ====================

exports.createCategory = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { name, description, icon, order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori harus diisi",
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

    const category = await Category.create({
      restaurant: restaurantId,
      name,
      description,
      icon,
      order: order || 0,
    });

    res.status(201).json({
      success: true,
      message: "Kategori berhasil dibuat",
      category,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET RESTAURANT CATEGORIES ====================

exports.getCategories = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const categories = await Category.find({ restaurant: restaurantId })
      .populate("menus", "name price image")
      .sort({ order: 1 });

    res.json({
      success: true,
      total: categories.length,
      categories,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET CATEGORY BY ID ====================

exports.getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId)
      .populate("menus");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== UPDATE CATEGORY ====================

exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, icon, order } = req.body;

    const category = await Category.findById(categoryId).populate("restaurant");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    // Cek owner
    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (name) category.name = name;
    if (description) category.description = description;
    if (icon) category.icon = icon;
    if (order !== undefined) category.order = order;

    await category.save();

    res.json({
      success: true,
      message: "Kategori berhasil diperbarui",
      category,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== DELETE CATEGORY ====================

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId).populate("restaurant");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    // Cek owner
    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    await Category.findByIdAndDelete(categoryId);

    res.json({
      success: true,
      message: "Kategori berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== ADD MENU TO CATEGORY ====================

exports.addMenuToCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { menuId } = req.body;

    if (!menuId) {
      return res.status(400).json({
        success: false,
        message: "Menu ID harus diisi",
      });
    }

    const category = await Category.findById(categoryId).populate("restaurant");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    // Cek owner
    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (category.menus.includes(menuId)) {
      return res.status(400).json({
        success: false,
        message: "Menu sudah ada di kategori ini",
      });
    }

    category.menus.push(menuId);
    await category.save();

    res.json({
      success: true,
      message: "Menu berhasil ditambahkan ke kategori",
      category,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== REMOVE MENU FROM CATEGORY ====================

exports.removeMenuFromCategory = async (req, res) => {
  try {
    const { categoryId, menuId } = req.params;

    const category = await Category.findById(categoryId).populate("restaurant");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    // Cek owner
    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    category.menus = category.menus.filter(
      (id) => id.toString() !== menuId
    );
    await category.save();

    res.json({
      success: true,
      message: "Menu berhasil dihapus dari kategori",
      category,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
