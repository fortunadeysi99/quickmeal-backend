const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const generateToken = require("../utils/generateToken");
const { upsertUserDevice } = require("../services/mobileDeviceService");

// ==================== REGISTER ====================

exports.registerUser = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Data tidak boleh kosong",
      });
    }

    const { name, email, password, deviceId, deviceToken, platform } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, dan password harus diisi",
      });
    }

    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Email tidak valid",
      });
    }

    const exists = await User.findOne({ email, status: "active" });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "user",
      status: "active"
    });

    if (deviceId || deviceToken) {
      try {
        await upsertUserDevice(user, { deviceId, deviceToken, platform });
      } catch (deviceErr) {
        console.error("Gagal menyimpan device saat register user:", deviceErr.message);
      }
    }

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Registrasi user berhasil",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.registerOwner = async (req, res) => {
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
      password,
      restaurantName,
      restaurantAddress,
      restaurantPhone,
      longitude,
      latitude,
      deviceId,
      deviceToken,
      platform,
    } = req.body;

    if (!name || !email || !password || !restaurantName || !restaurantAddress || !restaurantPhone) {
      return res.status(400).json({
        success: false,
        message: "Semua data harus diisi",
      });
    }

    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Email tidak valid",
      });
    }

    const exists = await User.findOne({ email, status: "active" });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const owner = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "owner",
      status: "active"
    });

    if (deviceId || deviceToken) {
      try {
        await upsertUserDevice(owner, { deviceId, deviceToken, platform });
      } catch (deviceErr) {
        console.error("Gagal menyimpan device saat register owner:", deviceErr.message);
      }
    }

    const restaurant = await Restaurant.create({
      owner: owner._id,
      name: restaurantName,
      address: restaurantAddress,
      phone: restaurantPhone,
      operatingStatus: "closed",
      isOpen: false,
      location: {
        longitude,
        latitude
      }
    });

    // Tambahkan restaurant ke list restaurants milik owner
    owner.restaurants.push(restaurant._id);
    await owner.save();

    const token = generateToken(owner._id);

    res.status(201).json({
      success: true,
      message: "Registrasi owner berhasil",
      token,
      user: {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
        role: owner.role
      },
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== LOGIN ====================

exports.login = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Data tidak boleh kosong",
      });
    }

    const { email, password, deviceId, deviceToken, platform } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password harus diisi",
      });
    }

    const user = await User.findOne({
      email,
      status: "active",
    }).populate("restaurants");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const token = generateToken(user._id);

    if (deviceId || deviceToken) {
      try {
        await upsertUserDevice(user, { deviceId, deviceToken, platform });
      } catch (deviceErr) {
        console.error("Gagal menyimpan device saat login:", deviceErr.message);
      }
    }

    res.json({
      success: true,
      message: "Login berhasil",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        restaurants: user.restaurants || [],
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== GET CURRENT USER ====================

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user._id, status: "active" })
      .select("-password")
      .populate("restaurants");

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
