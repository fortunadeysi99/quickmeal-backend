const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");

exports.getMyWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("name role walletBalance");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      wallet: {
        balance: user.walletBalance || 0,
        user: {
          _id: user._id,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getMyWalletHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = { user: req.user._id };
    const total = await WalletTransaction.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    const histories = await WalletTransaction.find(query)
      .populate("counterparty", "name role")
      .populate("actor", "name role")
      .populate("order", "_id totalPrice status")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      success: true,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      histories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getWalletByUserIdAsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ _id: userId, status: "active" }).select("name role walletBalance");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      wallet: {
        balance: user.walletBalance || 0,
        user: {
          _id: user._id,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getWalletHistoryByUserIdAsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findOne({ _id: userId, status: "active" }).select("_id");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = { user: user._id };
    const total = await WalletTransaction.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    const histories = await WalletTransaction.find(query)
      .populate("counterparty", "name role")
      .populate("actor", "name role")
      .populate("order", "_id totalPrice status")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      success: true,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      histories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.adjustWalletAsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, note } = req.body;

    const deltaAmount = Number(amount);
    if (!Number.isFinite(deltaAmount) || deltaAmount === 0) {
      return res.status(400).json({
        success: false,
        message: "amount harus berupa angka dan tidak boleh 0",
      });
    }

    const targetUser = await User.findOne({ _id: userId, status: "active" });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const balanceBefore = targetUser.walletBalance || 0;
    const nextBalance = balanceBefore + deltaAmount;

    if (nextBalance < 0) {
      return res.status(400).json({
        success: false,
        message: "Saldo tidak mencukupi untuk pengurangan",
      });
    }

    targetUser.walletBalance = nextBalance;
    await targetUser.save();

    const transaction = await WalletTransaction.create({
      user: targetUser._id,
      direction: deltaAmount > 0 ? "in" : "out",
      amount: Math.abs(deltaAmount),
      balanceBefore,
      balanceAfter: nextBalance,
      type: "adjustment",
      actor: req.user?._id || null,
      counterparty: req.user?._id || null,
      note: note || "Penyesuaian saldo oleh admin",
    });

    const populatedTransaction = await WalletTransaction.findById(transaction._id)
      .populate("counterparty", "name role")
      .populate("actor", "name role")
      .populate("order", "_id totalPrice status");

    return res.json({
      success: true,
      message: deltaAmount > 0 ? "Saldo berhasil ditambahkan" : "Saldo berhasil dikurangi",
      wallet: {
        userId: targetUser._id,
        name: targetUser.name,
        role: targetUser.role,
        balance: targetUser.walletBalance,
      },
      transaction: populatedTransaction || transaction,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
