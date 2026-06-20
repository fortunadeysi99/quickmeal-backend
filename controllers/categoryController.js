const Category = require("../models/Category");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");

function normalizedName(value) {
  return String(value || "").trim();
}

exports.createCategory = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const name = normalizedName(req.body.name);

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

    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const existing = await Category.findOne({ restaurant: restaurantId, name });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Kategori dengan nama tersebut sudah ada",
      });
    }

    const category = await Category.create({
      restaurant: restaurantId,
      name,
    });

    return res.status(201).json({
      success: true,
      message: "Kategori berhasil dibuat",
      category,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const categories = await Category.find({ restaurant: restaurantId }).sort({ name: 1 });

    const categoriesWithUsage = await Promise.all(
      categories.map(async (category) => {
        const menuCount = await Menu.countDocuments({ category: category._id });
        return {
          ...category.toObject(),
          menuCount,
        };
      })
    );

    return res.json({
      success: true,
      total: categoriesWithUsage.length,
      categories: categoriesWithUsage,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    const menuCount = await Menu.countDocuments({ category: category._id });

    return res.json({
      success: true,
      category: {
        ...category.toObject(),
        menuCount,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const name = normalizedName(req.body.name);

    const category = await Category.findById(categoryId).populate("restaurant");
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori harus diisi",
      });
    }

    const duplicate = await Category.findOne({
      restaurant: category.restaurant._id,
      name,
      _id: { $ne: category._id },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Kategori dengan nama tersebut sudah ada",
      });
    }

    category.name = name;
    await category.save();

    return res.json({
      success: true,
      message: "Kategori berhasil diperbarui",
      category,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

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

    if (category.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    const usedByMenu = await Menu.exists({ category: category._id });
    if (usedByMenu) {
      return res.status(409).json({
        success: false,
        message: "Kategori tidak bisa dihapus karena masih dipakai oleh menu",
      });
    }

    await Category.findByIdAndDelete(categoryId);

    return res.json({
      success: true,
      message: "Kategori berhasil dihapus",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
