## 🍽️ QuickMeal Backend - API Documentation

Aplikasi pemesanan makanan berbasis mobile dengan implementasi algoritma **Boyer-Moore** untuk pencarian menu.

### 📋 Struktur Proyek

```
controllers/
  ├── authController.js        # Registrasi, login, autentikasi
  ├── userController.js        # Profil user, wishlist, admin
  ├── restaurantController.js  # CRUD restoran, kategori, lokasi
  ├── menuController.js        # CRUD menu, search Boyer-Moore
  ├── orderController.js       # Pemesanan, tracking
  ├── cartController.js        # Shopping cart
  └── categoryController.js    # Kategori menu

models/
  ├── User.js          # User (admin, owner, user)
  ├── Restaurant.js    # Restoran dengan lokasi Google Maps
  ├── Menu.js          # Menu dengan stock
  ├── Order.js         # Pesanan dengan payment
  ├── Cart.js          # Shopping cart
  ├── Category.js      # Kategori menu
  ├── Payment.js       # Tracking pembayaran
  └── Review.js        # Review/rating

routes/
  ├── authRoutes.js
  ├── userRoutes.js
  ├── restaurantRoutes.js
  ├── menuRoutes.js
  ├── orderRoutes.js
  ├── cartRoutes.js
  └── categoryRoutes.js

middleware/
  ├── authMiddleware.js   # JWT protection
  └── roleMiddleware.js   # Role-based access

utils/
  ├── boyerMoore.js       # Boyer-Moore algorithm
  └── generateToken.js    # JWT token generation
```

---

## 🔐 Authentication Endpoints

### Register User
```
POST /api/auth/register-user
Content-Type: application/json

{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "password123",
  "phone": "081234567890",
  "address": "Jl. Main St"
}

Response: { token, user }
```

### Register Owner
```
POST /api/auth/register-owner
Content-Type: application/json

{
  "name": "Restaurant Owner",
  "email": "owner@example.com",
  "password": "password123",
  "phone": "081234567890",
  "address": "Jl. Owner St",
  "restaurantName": "My Restaurant",
  "restaurantAddress": "Jl. Restaurant St",
  "restaurantPhone": "081111111111"
}

Response: { token, user, restaurant }
```

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response: { token, user }
```

### Get Current User
```
GET /api/auth/me
Authorization: Bearer {token}

Response: { user }
```

---

## 👤 User Endpoints

### Get Profile
```
GET /api/users/profile
Authorization: Bearer {token}

Response: { user }
```

### Update Profile
```
PUT /api/users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "New Name",
  "email": "newemail@example.com",
  "phone": "081234567890",
  "address": "New Address",
  "avatar": "url_to_avatar"
}

Response: { message, user }
```

### Change Password
```
PUT /api/users/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "oldPassword": "password123",
  "newPassword": "newpassword456"
}

Response: { message }
```

### Wishlist - Add
```
POST /api/users/wishlist
Authorization: Bearer {token}
Content-Type: application/json

{
  "menuId": "menu_id_here"
}

Response: { message }
```

### Wishlist - Get
```
GET /api/users/wishlist
Authorization: Bearer {token}

Response: { wishlist }
```

### Wishlist - Remove
```
DELETE /api/users/wishlist/{menuId}
Authorization: Bearer {token}

Response: { message }
```

---

## 🏪 Restaurant Endpoints

### Get All Restaurants
```
GET /api/restaurants?category=Indonesian&search=Nasi
```

### Get Restaurant Detail
```
GET /api/restaurants/{restaurantId}
```

---

## 🔎 Advanced Search (Boyer-Moore)

Endpoint ini dipakai untuk halaman pencarian user/admin/owner dengan pencocokan berbasis Boyer-Moore pada beberapa field sekaligus:

- nama restoran
- deskripsi restoran
- nama menu
- deskripsi menu
- nama kategori
- nama varian

### Endpoint
```
GET /api/menus/search?q={keyword}&category={opsional}&userLat={opsional}&userLng={opsional}&maxDistance={opsional-meter}&menuLimit={opsional}
```

### Contoh Request
```
GET /api/menus/search?q=ayam&category=nusantara&userLat=-6.2000&userLng=106.8166&maxDistance=5000&menuLimit=3
```

### Contoh Response (ringkas)
```json
{
  "success": true,
  "query": "ayam",
  "total": 7,
  "restaurantsFound": 2,
  "appliedFilters": {
    "category": "nusantara",
    "maxDistance": 5000,
    "menuLimit": 3
  },
  "results": [
    {
      "restaurant": {
        "_id": "665abc...",
        "name": "Ayam Bakar Sari",
        "description": "Spesialis ayam bakar madu",
        "address": "Jakarta Selatan",
        "logo": "https://...",
        "location": { "latitude": -6.21, "longitude": 106.81 },
        "distanceMeters": 843
      },
      "menus": [
        { "_id": "m1", "name": "Ayam Bakar Madu", "price": 28000 },
        { "_id": "m2", "name": "Ayam Goreng Lengkuas", "price": 25000 }
      ],
      "totalMatchedMenus": 5,
      "hasMoreMenus": true,
      "matchedOn": ["restaurant_name", "menu_name", "menu_description", "variant"]
    }
  ]
}
```

### Contoh Perhitungan Manual Boyer-Moore

Kasus:

- text: `ayam bakar madu`
- pattern: `madu`

Langkah:

1. Buat tabel bad-character dari pattern `madu`:
`m -> 0, a -> 1, d -> 2, u -> 3`
2. Align pattern di text dari kiri, bandingkan dari karakter paling kanan pattern (`u`).
3. Jika mismatch, geser sejauh `max(1, j - lastIndex(charMismatch))`.
4. Ulangi sampai semua karakter pattern cocok.

Simulasi ringkas:

- Shift awal `s=0`, bandingkan kanan pattern `u` dengan text posisi `3` (`m`) -> mismatch.
- `j=3`, `lastIndex('m')=0`, geser `max(1, 3-0)=3`, jadi `s=3`.
- Ulangi, posisi `s=3`, kanan pattern `u` bandingkan text posisi `6` (`k`) -> mismatch.
- `lastIndex('k')=-1`, geser `max(1, 3-(-1))=4`, jadi `s=7`.
- Posisi `s=7`, substring text mulai `7` adalah `madu` -> cocok seluruh karakter.
- Hasil: pattern ditemukan.

Dengan pendekatan ini, pencarian menghindari perbandingan karakter satu per satu dari kiri seperti metode naive.

### Create Restaurant (Owner)
```
POST /api/restaurants
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "My Restaurant",
  "description": "Best restaurant in town",
  "address": "Jl. Main St No. 123",
  "phone": "081234567890",
  "categories": ["Indonesian", "Fast Food"]
}

Response: { message, restaurant }
```

### Get My Restaurants (Owner)
```
GET /api/restaurants/owner/my-restaurants
Authorization: Bearer {token}

Response: { restaurants }
```

### Update Restaurant (Owner)
```
PUT /api/restaurants/{restaurantId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Updated Name",
  "banner": "url_to_banner",
  "logo": "url_to_logo",
  "openingHours": {
    "monday": { "open": "08:00", "close": "22:00" },
    ...
  }
}

Response: { message, restaurant }
```

### Update Location (Owner)
```
PUT /api/restaurants/{restaurantId}/location
Authorization: Bearer {token}
Content-Type: application/json

{
  "latitude": -6.2088,
  "longitude": 106.8456
}

Response: { message, restaurant }
```

### Add Categories (Owner)
```
POST /api/restaurants/{restaurantId}/categories
Authorization: Bearer {token}
Content-Type: application/json

{
  "categories": ["Makanan", "Minuman", "Dessert"]
}

Response: { message, categories }
```

### Remove Category (Owner)
```
DELETE /api/restaurants/{restaurantId}/categories/{category}
Authorization: Bearer {token}

Response: { message, categories }
```

### Delete Restaurant (Owner)
```
DELETE /api/restaurants/{restaurantId}
Authorization: Bearer {token}

Response: { message }
```

---

## 🍲 Menu Endpoints

### Get Restaurant Menus
```
GET /api/menus/restaurant/{restaurantId}?category=Makanan
```

### Get Menu Detail
```
GET /api/menus/{menuId}
```

### Create Menu (Owner)
```
POST /api/menus/restaurant/{restaurantId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Nasi Goreng",
  "description": "Nasi goreng spesial dengan telur",
  "category": "Makanan",
  "price": 25000,
  "stock": 50,
  "image": "url_to_image",
  "calories": 450,
  "preparationTime": 15,
  "spicy": true,
  "vegetarian": false
}

Response: { message, menu }
```

### Update Menu (Owner)
```
PUT /api/menus/{menuId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "price": 30000,
  "stock": 45,
  "isAvailable": true
}

Response: { message, menu }
```

### Delete Menu (Owner)
```
DELETE /api/menus/{menuId}
Authorization: Bearer {token}

Response: { message }
```

### Search Menu (Boyer-Moore) ⭐
```
GET /api/menus/search?q=nasi

Response: {
  success: true,
  query: "nasi",
  total: 5,
  restaurantsFound: 2,
  results: [
    {
      restaurant: { _id, name, address, phone, rating, location },
      menus: [ menu1, menu2, ... ]
    },
    ...
  ]
}
```

---

## 🛒 Cart Endpoints

### Get Cart
```
GET /api/cart
Authorization: Bearer {token}

Response: { cart }
```

### Add to Cart
```
POST /api/cart/add
Authorization: Bearer {token}
Content-Type: application/json

{
  "menuId": "menu_id",
  "restaurantId": "restaurant_id",
  "qty": 2
}

Response: { message, cart }
```

### Update Cart Item
```
PUT /api/cart/update
Authorization: Bearer {token}
Content-Type: application/json

{
  "menuId": "menu_id",
  "qty": 5
}

Response: { message, cart }
```

### Remove from Cart
```
DELETE /api/cart/{menuId}
Authorization: Bearer {token}

Response: { message, cart }
```

### Clear Cart
```
DELETE /api/cart
Authorization: Bearer {token}

Response: { message }
```

---

## 📦 Order Endpoints

### Create Order
```
POST /api/orders
Authorization: Bearer {token}
Content-Type: application/json

{
  "restaurantId": "restaurant_id",
  "items": [
    { "menuId": "menu_id_1", "qty": 2 },
    { "menuId": "menu_id_2", "qty": 1 }
  ],
  "deliveryAddress": {
    "street": "Jl. Main St No. 123",
    "city": "Jakarta",
    "postalCode": "12345",
    "latitude": -6.2088,
    "longitude": 106.8456
  },
  "notes": "No onions please",
  "paymentMethod": "cash"
}

Response: { message, order }
```

### Get My Orders (User)
```
GET /api/orders/my-orders?status=pending
Authorization: Bearer {token}

Response: { orders }
```

### Get Order Detail
```
GET /api/orders/{orderId}
Authorization: Bearer {token}

Response: { order }
```

### Get Restaurant Orders (Owner)
```
GET /api/orders/restaurant/{restaurantId}?status=preparing
Authorization: Bearer {token}

Response: { orders }
```

### Update Order Status (Owner)
```
PUT /api/orders/{orderId}/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "preparing"  // pending, confirmed, preparing, ready, on_delivery, delivered, cancelled
}

Response: { message, order }
```

### Update Payment Status (User)
```
PUT /api/orders/{orderId}/payment-status
Authorization: Bearer {token}
Content-Type: application/json

{
  "paymentStatus": "paid"  // pending, paid, failed
}

Response: { message, order }
```

### Cancel Order (User)
```
PUT /api/orders/{orderId}/cancel
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Changed my mind"
}

Response: { message, order }
```

---

## 📂 Category Endpoints

### Get Categories (Public)
```
GET /api/categories/restaurant/{restaurantId}

Response: { categories }
```

### Get Category Detail
```
GET /api/categories/{categoryId}

Response: { category }
```

### Create Category (Owner)
```
POST /api/categories/restaurant/{restaurantId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Makanan Utama",
  "description": "Menu makanan utama",
  "icon": "url_to_icon",
  "order": 1
}

Response: { message, category }
```

### Update Category (Owner)
```
PUT /api/categories/{categoryId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Updated Name",
  "order": 2
}

Response: { message, category }
```

### Delete Category (Owner)
```
DELETE /api/categories/{categoryId}
Authorization: Bearer {token}

Response: { message }
```

### Add Menu to Category (Owner)
```
POST /api/categories/{categoryId}/menus
Authorization: Bearer {token}
Content-Type: application/json

{
  "menuId": "menu_id"
}

Response: { message, category }
```

### Remove Menu from Category (Owner)
```
DELETE /api/categories/{categoryId}/menus/{menuId}
Authorization: Bearer {token}

Response: { message, category }
```

---

## 🔍 Boyer-Moore Search Algorithm

Pencarian menu menggunakan algoritma **Boyer-Moore** untuk performa optimal:

```javascript
// Algoritma Boyer-Moore
- Mulai dari kanan pattern
- Gunakan bad character table untuk skip positions
- Waktu kompleksitas: O(n/m) best case, O(n*m) worst case
- Sangat efisien untuk pattern panjang
```

**Contoh Search:**
```
Query: "nasi"
Hasil: 
- Restaurant 1: Nasi Goreng, Nasi Kuning, Nasi Liwet
- Restaurant 2: Nasi Bakar
- Restaurant 3: Nasi Padang
```

---

## 👥 Role-Based Access Control (RBAC)

### Admin
- Lihat semua user
- Hapus user

### Owner
- CRUD Restoran
- CRUD Menu
- CRUD Kategori
- Update status pesanan
- Lihat pesanan restoran

### User
- CRUD Cart
- CRUD Order
- Search menu
- Wishlist
- Update payment status
- Cancel order

---

## 📊 Status Pesanan (Order Status)

1. **pending** - Menunggu konfirmasi
2. **confirmed** - Dikonfirmasi owner
3. **preparing** - Sedang disiapkan
4. **ready** - Siap diambil/dikirim
5. **on_delivery** - Dalam pengiriman
6. **delivered** - Sudah diterima
7. **cancelled** - Dibatalkan

---

## 💳 Payment Methods

1. **cash** - Pembayaran tunai
2. **card** - Kartu kredit/debit
3. **wallet** - E-wallet
4. **bank_transfer** - Transfer bank

---

## 📧 Environment Variables (.env)

```
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/quickmeal
JWT_SECRET=your_secret_key_here
PORT=5000
```

---

## 🚀 How to Run

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production
npm start
```

---

## 📱 Frontend Integration Tips

1. **Store token** di localStorage/secure storage
2. **Include token** di setiap request: `Authorization: Bearer {token}`
3. **Handle responses** dengan success flag
4. **Implement cart** sebelum order (better UX)
5. **Real-time updates** dapat menggunakan WebSocket untuk order status

---

## 🐛 Error Handling

Semua response mengikuti format:
```json
{
  "success": true/false,
  "message": "Description",
  "data": { ... }
}
```

HTTP Status Codes:
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

**Created**: 2026-06-02
**Version**: 1.0.0
**Algorithm**: Boyer-Moore String Matching
