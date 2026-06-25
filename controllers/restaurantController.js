const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const Menu = require("../models/Menu");

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
      .populate({
        path: "menus",
        populate: {
          path: "category",
          select: "name",
        },
      })
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
      .populate({
        path: "menus",
        populate: {
          path: "category",
          select: "name",
        },
      })
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
    const {
      category,
      search,
      searchMode,
      owner,
      operatingStatus,
      page = 1,
      limit = 10,
      sort = "latest",
      includeLocationData,
      userLat,
      userLng,
    } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const useLocationData = includeLocationData === true || includeLocationData === "true";
    const parsedUserLat = Number(userLat);
    const parsedUserLng = Number(userLng);
    const hasUserLocation = useLocationData && Number.isFinite(parsedUserLat) && Number.isFinite(parsedUserLng);

    const query = {};

    const escapedSearch = search
      ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : null;
    const searchRegex = escapedSearch ? new RegExp(escapedSearch, "i") : null;

    if (category) {
      query.categories = { $in: [category] };
    }

    if (searchRegex) {
      if (searchMode === "name_only") {
        query.name = searchRegex;
      } else {
        const menuMatches = await Menu.find({
          status: { $ne: "deleted" },
          $or: [
            { name: searchRegex },
            { description: searchRegex },
          ],
        }).select("restaurant");

        const matchedRestaurantIds = [...new Set(menuMatches.map((item) => item.restaurant?.toString()).filter(Boolean))];

        query.$or = [
          { name: searchRegex },
          { description: searchRegex },
          { address: searchRegex },
          { categories: { $elemMatch: { $regex: searchRegex } } },
        ];

        if (matchedRestaurantIds.length > 0) {
          query.$or.push({ _id: { $in: matchedRestaurantIds } });
        }
      }
    }

    if (owner) {
      const owners = await User.find({
        name: { $regex: owner, $options: "i" },
        status: "active",
      }).select("_id");
      query.owner = { $in: owners.map((item) => item._id) };
    }

    if (operatingStatus && ["open", "closed", "busy"].includes(operatingStatus)) {
      query.operatingStatus = operatingStatus;
    }

    const restaurants = await Restaurant.find(query)
      .populate({
        path: "menus",
        populate: {
          path: "category",
          select: "name",
        },
      })
      .populate("owner", "name email phone status createdAt")
      .lean();

    const restaurantsWithDistance = restaurants.map((restaurant) => {
      const latitude = restaurant.location?.latitude;
      const longitude = restaurant.location?.longitude;
      const hasRestaurantLocation = Number.isFinite(latitude) && Number.isFinite(longitude);

      return {
        ...restaurant,
        distanceMeters:
          useLocationData && hasUserLocation && hasRestaurantLocation
            ? calculateDistanceMeters(parsedUserLat, parsedUserLng, latitude, longitude)
            : null,
      };
    });

    const sortedRestaurants = restaurantsWithDistance.sort((left, right) => {
      if (sort === "nearest" && useLocationData && hasUserLocation) {
        if (left.distanceMeters == null && right.distanceMeters == null) return 0;
        if (left.distanceMeters == null) return 1;
        if (right.distanceMeters == null) return -1;
        return left.distanceMeters - right.distanceMeters;
      }

      if (sort === "oldest") {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }

      if (sort === "name_asc") {
        return left.name.localeCompare(right.name);
      }

      if (sort === "name_desc") {
        return right.name.localeCompare(left.name);
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    const total = sortedRestaurants.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const skip = (pageNumber - 1) * pageSize;
    const pagedRestaurants = sortedRestaurants.slice(skip, skip + pageSize);

    res.json({
      success: true,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      hasMore: pageNumber < totalPages,
      restaurants: pagedRestaurants,
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
    const {
      name,
      description,
      address,
      phone,
      categories,
      banner,
      logo,
      removeBanner,
      removeLogo,
      latitude,
      longitude,
    } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    const isAdmin = req.user?.role === "admin";

    // Cek owner/admin
    if (!isAdmin && restaurant.owner.toString() !== req.user._id.toString()) {
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
    if (removeBanner === true) restaurant.banner = null;
    if (removeLogo === true) restaurant.logo = null;

    if (latitude !== undefined || longitude !== undefined) {
      restaurant.location = {
        latitude: latitude !== undefined ? parseFloat(latitude) : restaurant.location?.latitude,
        longitude: longitude !== undefined ? parseFloat(longitude) : restaurant.location?.longitude,
      };
    }

    await restaurant.save();

    res.json({
      success: true,
      message: "Restoran berhasil diperbarui",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateRestaurantStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { operatingStatus } = req.body;

    const allowed = ["open", "closed", "busy"];
    if (!allowed.includes(operatingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status operasional tidak valid",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    const isAdmin = req.user?.role === "admin";

    if (!isAdmin && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses untuk mengubah restoran ini",
      });
    }

    restaurant.operatingStatus = operatingStatus;
    restaurant.isOpen = operatingStatus !== "closed";
    await restaurant.save();

    return res.json({
      success: true,
      message: "Status restoran berhasil diperbarui",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateRestaurantSchedule = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { openingHours } = req.body;

    if (!openingHours || typeof openingHours !== "object") {
      return res.status(400).json({
        success: false,
        message: "Jadwal operasional tidak valid",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restoran tidak ditemukan",
      });
    }

    const isAdmin = req.user?.role === "admin";

    if (!isAdmin && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses untuk mengubah restoran ini",
      });
    }

    restaurant.openingHours = openingHours;
    await restaurant.save();

    return res.json({
      success: true,
      message: "Jadwal restoran berhasil diperbarui",
    });
  } catch (err) {
    return res.status(500).json({
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

    const isAdmin = req.user?.role === "admin";

    // Cek owner/admin
    if (!isAdmin && restaurant.owner.toString() !== req.user._id.toString()) {
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

    const isAdmin = req.user?.role === "admin";

    // Owner hanya boleh hapus restoran miliknya
    if (!isAdmin && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses",
      });
    }

    if (isAdmin) {
      // Saat admin menghapus restoran: seluruh restoran owner ikut dihapus,
      // menu owner ikut dibersihkan, lalu akun owner di-soft-delete.
      const ownerId = restaurant.owner;
      const ownerRestaurants = await Restaurant.find({ owner: ownerId }).select("_id menus");
      const ownerRestaurantIds = ownerRestaurants.map((item) => item._id);
      const ownerMenuIds = ownerRestaurants.flatMap((item) => item.menus || []);

      if (ownerMenuIds.length > 0) {
        await Menu.deleteMany({ _id: { $in: ownerMenuIds } });
      }

      await Restaurant.deleteMany({ _id: { $in: ownerRestaurantIds } });

      await User.findByIdAndUpdate(ownerId, {
        status: "deleted",
        deletedAt: new Date(),
        restaurants: [],
      });

      return res.json({
        success: true,
        message: "Restoran dan owner berhasil dihapus",
      });
    }

    if (restaurant.menus?.length > 0) {
      await Menu.deleteMany({ _id: { $in: restaurant.menus } });
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
