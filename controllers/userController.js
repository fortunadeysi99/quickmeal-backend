const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const bcrypt = require("bcryptjs");
const { upsertUserDevice, unregisterUserDevice } = require("../services/mobileDeviceService");
const { sendPushToUser, getFirebaseDiagnostics } = require("../services/pushNotificationService");

const VALID_ROLES = ["admin", "owner", "user"];

// ==================== PROFILE ====================

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("wishlist")
      .populate("restaurants");

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Data tidak boleh kosong",
      });
    }

    const {
      name,
      email,
      phone,
      address,
      avatar,
      deliveryAddress,
      deliveryAddresses,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (avatar) user.avatar = avatar;

    if (deliveryAddress !== undefined) {
      if (deliveryAddress === null) {
        user.deliveryAddress = undefined;
      } else if (typeof deliveryAddress === "object") {
        const parsedLatitude =
          deliveryAddress.latitude !== undefined && deliveryAddress.latitude !== null
            ? Number(deliveryAddress.latitude)
            : undefined;
        const parsedLongitude =
          deliveryAddress.longitude !== undefined && deliveryAddress.longitude !== null
            ? Number(deliveryAddress.longitude)
            : undefined;

        user.deliveryAddress = {
          address: deliveryAddress.address || user.address || "",
          latitude: Number.isFinite(parsedLatitude) ? parsedLatitude : undefined,
          longitude: Number.isFinite(parsedLongitude) ? parsedLongitude : undefined,
          notes: deliveryAddress.notes || "",
        };
      }
    }

    if (deliveryAddresses !== undefined) {
      if (deliveryAddresses === null) {
        user.deliveryAddresses = [];
      } else if (Array.isArray(deliveryAddresses)) {
        const sanitizedAddresses = deliveryAddresses
          .map((item) => {
            if (!item || typeof item !== "object") return null;

            const parsedLatitude =
              item.latitude !== undefined && item.latitude !== null
                ? Number(item.latitude)
                : undefined;
            const parsedLongitude =
              item.longitude !== undefined && item.longitude !== null
                ? Number(item.longitude)
                : undefined;

            return {
              label: item.label || "Alamat",
              address: item.address || "",
              latitude: Number.isFinite(parsedLatitude) ? parsedLatitude : undefined,
              longitude: Number.isFinite(parsedLongitude) ? parsedLongitude : undefined,
              notes: item.notes || "",
              isPrimary: item.isPrimary === true,
            };
          })
          .filter((item) => item && item.address)
          .slice(0, 10);

        if (sanitizedAddresses.length > 0) {
          const primaryIndex = sanitizedAddresses.findIndex((item) => item.isPrimary);
          const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;
          user.deliveryAddresses = sanitizedAddresses.map((item, index) => ({
            ...item,
            isPrimary: index === resolvedPrimaryIndex,
          }));

          const primaryAddress = user.deliveryAddresses[resolvedPrimaryIndex];
          user.deliveryAddress = {
            address: primaryAddress.address,
            latitude: primaryAddress.latitude,
            longitude: primaryAddress.longitude,
            notes: primaryAddress.notes,
          };
        } else {
          user.deliveryAddresses = [];
        }
      }
    }

    if (user.deliveryAddress && (!Array.isArray(user.deliveryAddresses) || user.deliveryAddresses.length === 0)) {
      user.deliveryAddresses = [
        {
          label: "Utama",
          address: user.deliveryAddress.address || user.address || "",
          latitude: user.deliveryAddress.latitude,
          longitude: user.deliveryAddress.longitude,
          notes: user.deliveryAddress.notes || "",
          isPrimary: true,
        },
      ];
    }

    if (email && email !== user.email) {
      if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Email tidak valid",
        });
      }

      const emailExists = await User.findOne({ email, status: "active" });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email sudah digunakan",
        });
      }

      user.email = email;
    }

    await user.save();

    res.json({
      success: true,
      message: "Profil berhasil diperbarui",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        deliveryAddress: user.deliveryAddress,
        deliveryAddresses: user.deliveryAddresses,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Password lama dan baru harus diisi",
      });
    }

    const user = await User.findById(req.user._id);

    const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Password lama tidak sesuai",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password berhasil diubah",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.registerMobileDevice = async (req, res) => {
  try {
    const { deviceId, deviceToken, platform } = req.body || {};

    if (!deviceId && !deviceToken) {
      return res.status(400).json({
        success: false,
        message: "deviceId atau deviceToken harus diisi",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    await upsertUserDevice(user, { deviceId, deviceToken, platform });

    res.json({
      success: true,
      message: "Perangkat berhasil didaftarkan",
      totalDevices: Array.isArray(user.mobileDevices) ? user.mobileDevices.length : 0,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.unregisterMobileDevice = async (req, res) => {
  try {
    const { deviceId, deviceToken } = req.body || {};

    if (!deviceId && !deviceToken) {
      return res.status(400).json({
        success: false,
        message: "deviceId atau deviceToken harus diisi",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    await unregisterUserDevice(user, { deviceId, deviceToken });

    res.json({
      success: true,
      message: "Perangkat berhasil dihapus",
      totalDevices: Array.isArray(user.mobileDevices) ? user.mobileDevices.length : 0,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.sendTestNotificationToCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("name mobileDevices");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const defaultTitle = "QuickMeal Test Notification";
    const defaultBody = "Jika pesan ini muncul, push notification sudah berjalan.";
    const {
      title = defaultTitle,
      body = defaultBody,
      data = {},
    } = req.body || {};

    const pushResult = await sendPushToUser({
      userId: user._id,
      title,
      body,
      data: {
        type: "TEST_NOTIFICATION",
        timestamp: Date.now(),
        ...data,
      },
    });

    const devices = Array.isArray(user.mobileDevices) ? user.mobileDevices : [];
    const deviceWithTokenCount = devices.filter((item) => item && item.deviceToken).length;

    res.status(pushResult.success ? 200 : 400).json({
      success: pushResult.success,
      message: pushResult.success
        ? "Test notifikasi berhasil dikirim"
        : "Test notifikasi gagal dikirim",
      error: pushResult.success
        ? null
        : {
            reason: pushResult.reason || null,
            message:
              pushResult.reason === "fcm-not-configured"
                ? "Firebase belum bisa diinisialisasi di server"
                : pushResult.reason === "no-device"
                  ? "Tidak ada perangkat terdaftar"
                  : pushResult.reason === "no-token"
                    ? "Tidak ada token FCM yang valid"
                    : "Gagal mengirim notifikasi",
            details: pushResult.error?.message || null,
          },
      diagnostics: {
        totalDevices: devices.length,
        devicesWithToken: deviceWithTokenCount,
      },
      firebase:
        req.user?.role === "admin"
          ? getFirebaseDiagnostics()
          : undefined,
      pushResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getFirebaseEnvStatus = async (req, res) => {
  try {
    const diagnostics = getFirebaseDiagnostics();

    res.json({
      success: true,
      message: "Status Firebase berhasil diambil",
      firebase: diagnostics,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== WISHLIST ====================

exports.addToWishlist = async (req, res) => {
  try {
    const { menuId } = req.body;

    if (!menuId) {
      return res.status(400).json({
        success: false,
        message: "Menu ID harus diisi",
      });
    }

    const user = await User.findById(req.user._id);

    if (user.wishlist.includes(menuId)) {
      return res.status(400).json({
        success: false,
        message: "Menu sudah ada di wishlist",
      });
    }

    user.wishlist.push(menuId);
    await user.save();

    res.json({
      success: true,
      message: "Menu berhasil ditambahkan ke wishlist",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { menuId } = req.params;

    if (!menuId) {
      return res.status(400).json({
        success: false,
        message: "Menu ID harus diisi",
      });
    }

    const user = await User.findById(req.user._id);

    user.wishlist = user.wishlist.filter((id) => id.toString() !== menuId);
    await user.save();

    res.json({
      success: true,
      message: "Menu berhasil dihapus dari wishlist",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "wishlist",
      match: { status: "active" }
    });

    res.json({
      success: true,
      wishlist: user.wishlist,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET ALL USERS (ADMIN) ====================

exports.getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      50
    );
    const role = req.query.role;
    const search = (req.query.search || "").trim();

    const query = { status: "active" };

    if (role && VALID_ROLES.includes(role)) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const users = await User.find(query)
      .select("-password")
      .populate("restaurants")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages,
      users,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ _id: userId, status: "active" })
      .select("-password")
      .populate("restaurants")
      .populate({
        path: "wishlist",
        match: { status: "active" }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.createUserByAdmin = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "user",
      phone,
      address,
      avatar,
      restaurantName,
      restaurantAddress,
      restaurantPhone,
      latitude,
      longitude,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi",
      });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Email tidak valid",
      });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role tidak valid",
      });
    }

    if (
      role === "owner" &&
      (!restaurantName || !restaurantAddress || !restaurantPhone)
    ) {
      return res.status(400).json({
        success: false,
        message: "Data restoran owner wajib diisi",
      });
    }

    const exists = await User.findOne({ email: email.toLowerCase(), status: "active" });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email sudah digunakan",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phone,
      address,
      avatar,
      status: "active"
    });

    if (role === "owner") {
      const restaurant = await Restaurant.create({
        owner: newUser._id,
        name: restaurantName,
        address: restaurantAddress,
        phone: restaurantPhone,
        operatingStatus: "closed",
        isOpen: false,
        location: {
          latitude,
          longitude,
        },
      });

      newUser.restaurants.push(restaurant._id);
      await newUser.save();
    }

    const user = await User.findById(newUser._id)
      .select("-password")
      .populate("restaurants");

    res.status(201).json({
      success: true,
      message: "User berhasil dibuat",
      user,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateUserByAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      name,
      email,
      role,
      password,
      phone,
      address,
      avatar,
      restaurantName,
      restaurantAddress,
      restaurantPhone,
      latitude,
      longitude,
    } = req.body;

    const user = await User.findOne({ _id: userId, status: "active" });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role tidak valid",
      });
    }

    if (email && email !== user.email) {
      if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Email tidak valid",
        });
      }

      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId },
        status: "active"
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email sudah digunakan",
        });
      }

      user.email = email.toLowerCase();
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (avatar !== undefined) user.avatar = avatar;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    const effectiveRole = role || user.role;

    if (effectiveRole === "owner") {
      if (!restaurantName || !restaurantAddress || !restaurantPhone) {
        return res.status(400).json({
          success: false,
          message: "Data restoran owner wajib diisi",
        });
      }

      let ownerRestaurant = null;

      if (Array.isArray(user.restaurants) && user.restaurants.length > 0) {
        ownerRestaurant = await Restaurant.findById(user.restaurants[0]);
      }

      if (!ownerRestaurant) {
        ownerRestaurant = await Restaurant.findOne({ owner: user._id });
      }

      if (ownerRestaurant) {
        ownerRestaurant.name = restaurantName;
        ownerRestaurant.address = restaurantAddress;
        ownerRestaurant.phone = restaurantPhone;
        ownerRestaurant.location = {
          latitude,
          longitude,
        };
        await ownerRestaurant.save();
      } else {
        const createdRestaurant = await Restaurant.create({
          owner: user._id,
          name: restaurantName,
          address: restaurantAddress,
          phone: restaurantPhone,
          operatingStatus: "closed",
          isOpen: false,
          location: {
            latitude,
            longitude,
          },
        });
        user.restaurants = [createdRestaurant._id];
      }
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate("restaurants");

    res.json({
      success: true,
      message: "User berhasil diperbarui",
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== DELETE USER (ADMIN) ====================

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ _id: userId, status: "active" });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    user.status = "deleted";
    user.deletedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "User berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
