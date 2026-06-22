const Cart = require("../models/Cart");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");

// ==================== GET CART ====================

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: "restaurant",
        select: "name address phone",
      })
      .populate({
        path: "items.menu",
        select: "name price image",
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart kosong",
      });
    }

    res.json({
      success: true,
      cart,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== ADD TO CART ====================

exports.addToCart = async (req, res) => {
  try {
    const { menuId, qty, restaurantId, variantName, variantPrice } = req.body;

    if (!menuId || !qty || !restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Menu ID, qty, dan restaurant ID harus diisi",
      });
    }

    const menu = await Menu.findById(menuId);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    if (!menu.isAvailable) {
      return res.status(400).json({
        success: false,
        message: "Menu tidak tersedia",
      });
    }

    if (menu.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Stok tidak cukup. Tersedia: ${menu.stock}`,
      });
    }

    const normalizedVariantName = String(variantName || "").trim();
    const hasVariant = normalizedVariantName.length > 0;
    const selectedVariant = hasVariant
      ? (menu.variants || []).find((variant) => String(variant.name || "").trim() === normalizedVariantName)
      : null;

    if (hasVariant && !selectedVariant) {
      return res.status(400).json({
        success: false,
        message: "Varian menu tidak valid",
      });
    }

    const unitPrice = hasVariant
      ? Number(selectedVariant?.price || variantPrice || menu.price)
      : menu.price;

    let cart = await Cart.findOne({ user: req.user._id });

    // Jika belum ada cart
    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        restaurant: restaurantId,
        items: [
          {
            menu: menuId,
            name: hasVariant ? `${menu.name} (${normalizedVariantName})` : menu.name,
            price: unitPrice,
            image: menu.image,
            variantName: hasVariant ? normalizedVariantName : null,
            variantPrice: hasVariant ? unitPrice : null,
            qty,
            subtotal: unitPrice * qty,
          },
        ],
        totalItems: qty,
        subtotal: unitPrice * qty,
      });
    } else {
      // Jika cart dari restaurant berbeda
      if (cart.restaurant.toString() !== restaurantId) {
        return res.status(400).json({
          success: false,
          message: "Anda hanya bisa memesan dari satu restoran sekaligus. Hapus cart sebelumnya",
        });
      }

      // Cek apakah menu sudah ada di cart
      const existingItem = cart.items.findIndex(
        (item) =>
          item.menu.toString() === menuId &&
          String(item.variantName || "") === (hasVariant ? normalizedVariantName : "")
      );

      if (existingItem > -1) {
        // Update qty
        cart.items[existingItem].qty += qty;
        cart.items[existingItem].subtotal = cart.items[existingItem].price * cart.items[existingItem].qty;
      } else {
        // Tambah item baru
        cart.items.push({
          menu: menuId,
          name: hasVariant ? `${menu.name} (${normalizedVariantName})` : menu.name,
          price: unitPrice,
          image: menu.image,
          variantName: hasVariant ? normalizedVariantName : null,
          variantPrice: hasVariant ? unitPrice : null,
          qty,
          subtotal: unitPrice * qty,
        });
      }

      // Hitung total
      cart.totalItems = cart.items.reduce((acc, item) => acc + item.qty, 0);
      cart.subtotal = cart.items.reduce((acc, item) => acc + item.subtotal, 0);

      await cart.save();
    }

    await cart.populate([
      {
        path: "restaurant",
        select: "name address phone",
      },
      {
        path: "items.menu",
        select: "name price image",
      },
    ]);

    res.json({
      success: true,
      message: "Item berhasil ditambahkan ke cart",
      cart,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== UPDATE CART ITEM ====================

exports.updateCartItem = async (req, res) => {
  try {
    const { menuId, qty, variantName } = req.body;
    const normalizedVariantName = String(variantName || "").trim();

    if (!menuId || qty === undefined) {
      return res.status(400).json({
        success: false,
        message: "Menu ID dan qty harus diisi",
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart tidak ditemukan",
      });
    }

    const itemIndex = cart.items.findIndex((item) => {
      return (
        item.menu.toString() === menuId &&
        String(item.variantName || "").trim() === normalizedVariantName
      );
    });

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item tidak ada di cart",
      });
    }

    if (qty === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const menu = await Menu.findById(menuId);

      if (menu.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Stok tidak cukup. Tersedia: ${menu.stock}`,
        });
      }

      cart.items[itemIndex].qty = qty;
      cart.items[itemIndex].subtotal = cart.items[itemIndex].price * qty;
    }

    cart.totalItems = cart.items.reduce((acc, item) => acc + item.qty, 0);
    cart.subtotal = cart.items.reduce((acc, item) => acc + item.subtotal, 0);

    await cart.save();

    await cart.populate([
      {
        path: "restaurant",
        select: "name address phone",
      },
      {
        path: "items.menu",
        select: "name price image",
      },
    ]);

    res.json({
      success: true,
      message: "Cart berhasil diperbarui",
      cart,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== REMOVE FROM CART ====================

exports.removeFromCart = async (req, res) => {
  try {
    const { menuId } = req.params;
    const normalizedVariantName = String(req.query.variantName || "").trim();

    if (!menuId) {
      return res.status(400).json({
        success: false,
        message: "Menu ID harus diisi",
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart tidak ditemukan",
      });
    }

    if (normalizedVariantName.length > 0) {
      cart.items = cart.items.filter((item) => {
        const sameMenu = item.menu.toString() === menuId;
        const sameVariant = String(item.variantName || "").trim() === normalizedVariantName;
        return !(sameMenu && sameVariant);
      });
    } else {
      cart.items = cart.items.filter((item) => item.menu.toString() !== menuId);
    }

    if (cart.items.length === 0) {
      await Cart.deleteOne({ _id: cart._id });
      return res.json({
        success: true,
        message: "Cart berhasil dihapus",
      });
    }

    cart.totalItems = cart.items.reduce((acc, item) => acc + item.qty, 0);
    cart.subtotal = cart.items.reduce((acc, item) => acc + item.subtotal, 0);

    await cart.save();

    await cart.populate([
      {
        path: "restaurant",
        select: "name address phone",
      },
      {
        path: "items.menu",
        select: "name price image",
      },
    ]);

    res.json({
      success: true,
      message: "Item berhasil dihapus dari cart",
      cart,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ==================== CLEAR CART ====================

exports.clearCart = async (req, res) => {
  try {
    await Cart.deleteOne({ user: req.user._id });

    res.json({
      success: true,
      message: "Cart berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
