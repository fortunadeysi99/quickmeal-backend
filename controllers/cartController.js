const Cart = require("../models/Cart");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");

async function syncCartPrices(cart) {
  const menuIds = [...new Set(cart.items.map((item) => String(item.menu?._id || item.menu)))];
  const menus = await Menu.find({ _id: { $in: menuIds } });
  const menuMap = new Map(menus.map((menu) => [String(menu._id), menu]));

  let subtotal = 0;
  let totalDiscount = 0;

  cart.items.forEach((item) => {
    const menu = menuMap.get(String(item.menu?._id || item.menu));
    if (!menu) return;

    const variantName = String(item.variantName || "").trim();
    const variant = variantName
      ? (menu.variants || []).find(
          (candidate) => String(candidate.name || "").trim() === variantName,
        )
      : null;
    const originalPrice = Number(variant?.price ?? menu.price);
    const discountPrice = variant?.discountPrice ?? menu.discountPrice;
    const effectivePrice = Number(discountPrice ?? originalPrice);
    const itemDiscount = Math.max(originalPrice - effectivePrice, 0);

    item.price = effectivePrice;
    item.originalPrice = originalPrice;
    item.discountPrice = discountPrice == null ? null : Number(discountPrice);
    item.discountAmount = itemDiscount;
    item.image = menu.image;
    item.name = variantName ? `${menu.name} (${variantName})` : menu.name;
    item.variantPrice = variant ? effectivePrice : null;
    item.subtotal = effectivePrice * item.qty;
    subtotal += item.subtotal;
    totalDiscount += itemDiscount * item.qty;
  });

  cart.subtotal = subtotal;
  cart.totalDiscount = totalDiscount;
  return cart;
}

// ==================== GET CART ====================

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: "restaurant",
        select: "name address phone operatingStatus isOpen",
      })
      .populate({
        path: "items.menu",
        select: "name price discountPrice image isAvailable",
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart kosong",
      });
    }

    await syncCartPrices(cart);
    await cart.save();

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
      ? Number(selectedVariant?.discountPrice ?? selectedVariant?.price ?? variantPrice ?? menu.price)
      : Number(menu.discountPrice ?? menu.price);

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
            originalPrice: hasVariant ? Number(selectedVariant.price) : Number(menu.price),
            discountPrice: hasVariant
              ? selectedVariant.discountPrice ?? null
              : menu.discountPrice ?? null,
            discountAmount: hasVariant
              ? Math.max(Number(selectedVariant.price) - unitPrice, 0)
              : Math.max(Number(menu.price) - unitPrice, 0),
            image: menu.image,
            variantName: hasVariant ? normalizedVariantName : null,
            variantPrice: hasVariant ? unitPrice : null,
            qty,
            subtotal: unitPrice * qty,
          },
        ],
        totalItems: qty,
        subtotal: unitPrice * qty,
        totalDiscount: hasVariant
          ? Math.max(Number(selectedVariant.price) - unitPrice, 0) * qty
          : Math.max(Number(menu.price) - unitPrice, 0) * qty,
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
        cart.items[existingItem].price = unitPrice;
        cart.items[existingItem].originalPrice = hasVariant ? Number(selectedVariant.price) : Number(menu.price);
        cart.items[existingItem].discountPrice = hasVariant
          ? selectedVariant.discountPrice ?? null
          : menu.discountPrice ?? null;
        cart.items[existingItem].discountAmount = hasVariant
          ? Math.max(Number(selectedVariant.price) - unitPrice, 0)
          : Math.max(Number(menu.price) - unitPrice, 0);
        cart.items[existingItem].subtotal = cart.items[existingItem].price * cart.items[existingItem].qty;
      } else {
        // Tambah item baru
        cart.items.push({
          menu: menuId,
          name: hasVariant ? `${menu.name} (${normalizedVariantName})` : menu.name,
          price: unitPrice,
          originalPrice: hasVariant ? Number(selectedVariant.price) : Number(menu.price),
          discountPrice: hasVariant
            ? selectedVariant.discountPrice ?? null
            : menu.discountPrice ?? null,
          discountAmount: hasVariant
            ? Math.max(Number(selectedVariant.price) - unitPrice, 0)
            : Math.max(Number(menu.price) - unitPrice, 0),
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
      cart.totalDiscount = cart.items.reduce(
        (acc, item) => acc + Number(item.discountAmount || 0) * item.qty,
        0,
      );

        await syncCartPrices(cart);

      await cart.save();
    }

    await cart.populate([
      {
        path: "restaurant",
        select: "name address phone operatingStatus isOpen",
      },
      {
        path: "items.menu",
        select: "name price discountPrice image isAvailable",
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
        select: "name address phone operatingStatus isOpen",
      },
      {
        path: "items.menu",
        select: "name price image isAvailable",
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
        select: "name address phone operatingStatus isOpen",
      },
      {
        path: "items.menu",
        select: "name price image isAvailable",
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
