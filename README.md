# SmartPick — Full-Featured Modern E-Commerce Platform 🛒⚡

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v5.0-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-brightgreen.svg)](https://www.mongodb.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Integration-blue.svg)](https://razorpay.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Image%20CDN-orange.svg)](https://cloudinary.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](#license)

**SmartPick** is a production-ready, full-stack E-Commerce application built using **Node.js, Express, MongoDB, EJS, and Tailwind/Vanilla CSS**. It provides a smooth shopping experience for users alongside a feature-packed Admin Dashboard for managing products, inventory, coupons, categories, sales reports, and customer orders.

---

## 🌟 Key Features

### 👤 Customer Storefront
- **Authentication & Security:**
  - Secure Signup & Login with OTP email verification (Nodemailer).
  - One-click Google OAuth 2.0 Social Login (Passport.js).
  - Forgot & Reset Password flows.
  - Double CSRF protection (`csrf-csrf`) & Security Headers (`helmet`).
- **Product Discovery & Catalog:**
  - Dynamic Search, Category & Subcategory filtering, Price Range slider, Sorting (price, popularity, rating, alphabetical).
  - Interactive Product Details view with image zoom, crop previews, size variant selection (XS–XXL), and stock indicators.
- **Cart & Wishlist Management:**
  - Dynamic Cart updates with maximum per-user item caps and real-time stock availability checks.
  - Wishlist management with one-click "Move to Cart".
- **Checkout & Multi-Payment Gateway:**
  - Saved Address management (Add/Edit/Delete multiple delivery locations).
  - Coupon redemption engine with minimum purchase validation & maximum discount caps.
  - Flexible Payment Options:
    - 💳 **Razorpay Integration** (Online Payments, Signature Verification, Webhook support & Retry mechanism for failed payments).
    - 💼 **SmartPick Digital Wallet** (Instant seamless checkout using in-app wallet balance).
    - 💵 **Cash on Delivery (COD)** (Configurable maximum order threshold).
- **Order Management & Invoicing:**
  - Real-time order tracking (Pending, Processing, Shipped, Delivered, Cancelled, Return Requested, Returned).
  - **Item-Level Cancellations & Returns** with reason specification.
  - Automated **Wallet Refunds** upon return approval or payment cancellation.
  - **PDF Invoice Generation** powered by `pdfkit`.
- **User Wallet & Referrals:**
  - Digital Wallet with complete debit/credit transaction history and reference tracking.

---

### 🛡️ Admin Management Dashboard
- **Sales Analytics & Insights:**
  - Real-time revenue, orders, and category performance charts.
  - Filter analytics by Daily, Weekly, Monthly, or Custom date ranges.
  - Export comprehensive Sales Reports in **PDF** (`pdfkit`) and **Excel** (`exceljs`) formats.
- **Inventory & Multi-Variant Product Catalog:**
  - Add/Edit products with interactive **Cloudinary** image upload and client-side image cropping.
  - Manage stock levels, size variants, base prices, and product-specific discount offers.
  - Unlist / Soft-delete products without breaking historical order data.
- **Category & Subcategory Management:**
  - Create and curate categories/subcategories with custom banners/icons.
  - Apply Category-level percentage discount offers automatically mapped across all child products.
- **Order Lifecycle & Return Request Desk:**
  - Centralized order management dashboard to update order progress.
  - Review item-level return requests with Approve/Reject workflows (auto-initiating digital wallet refunds).
- **Promotions & Coupon Engine:**
  - Create flat-rate or percentage-based promo coupons.
  - Set usage limits per user, minimum cart values, and expiration dates.
- **User & Banner Management:**
  - Block / Unblock customer accounts with active session termination.
  - Homepage Banner slider management.

---

## 🛠️ Technology Stack

| Layer | Technology / Library |
| :--- | :--- |
| **Backend Framework** | Node.js, Express.js (v5.x) |
| **Database & ODM** | MongoDB, Mongoose |
| **Session & Store** | Express-Session, Connect-Mongo |
| **Templating Engine** | EJS (Embedded JavaScript) with `express-ejs-layouts` |
| **Authentication** | Passport.js (Google OAuth 2.0), Bcrypt, Nodemailer (OTP) |
| **Security & Middleware** | Helmet, CSRF-CSRF (Double CSRF protection), Express Rate Limit, No-Cache |
| **Payment Gateways** | Razorpay SDK, Custom In-App Digital Wallet |
| **Media Hosting** | Cloudinary API + Multer |
| **Report & PDF Generation** | PDFKit (PDF Invoices & Reports), ExcelJS (Excel Sales Data) |
| **Background Tasks** | Node-Cron (Automated inventory release for unpaid orders) |
| **Validation** | Joi Schema Validator |

---

## 📂 Project Architecture

```
smartPick/
├── public/                 # Static assets (CSS, client JS, images, icons)
├── src/
│   ├── config/             # DB connection, Passport, Cloudinary, Env checks
│   ├── controllers/        # Request handlers split into /user and /admin
│   │   ├── admin/
│   │   └── user/
│   ├── middleware/         # Auth, CSRF, Rate Limiting, Error handling
│   ├── model/              # MongoDB Mongoose schemas (User, Product, Order, Wallet, Coupon, etc.)
│   ├── routes/             # Express routes (/admin, /user)
│   ├── services/           # Business logic (Order processing, Stock cleanup tasks)
│   ├── utils/              # PDF generator, Nodemailer helper, Cloudinary uploader
│   ├── validators/         # Joi validation schemas
│   └── views/              # EJS templates
│       ├── admin/          # Admin portal views (Dashboard, Products, Orders, Reports, etc.)
│       ├── layout/         # Shared layouts
│       └── user/           # Customer storefront views
├── app.js                  # Express app setup & server entry point
├── package.json            # Dependencies and scripts
└── .env                    # Environment variables
```

---

## 🔒 Security & Performance Features

- **Double CSRF Protection:** Prevents cross-site request forgery attacks across all state-mutating requests (`POST`/`PUT`/`DELETE`).
- **Rate Limiting & Helmet:** Mitigates brute-force attacks and sets HTTP security headers.
- **Automated Inventory Cleanup:** Background cron job cleans up reserved stock for abandoned/failed Razorpay payments after expiration.
- **Gzip Compression:** Utilizes `compression` middleware for faster web page loads.

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB instance (Local or MongoDB Atlas)
- Cloudinary account for image storage
- Razorpay developer account for payment gateway keys

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/smartPick.git
   cd smartPick
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your credentials:

   ```env
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/smartpick
   SESSION_SECRET=your_super_secret_session_key

   # Google OAuth 2.0
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

   # Cloudinary Setup
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret

   # Razorpay Gateway
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret

   # Nodemailer (OTP Mailer)
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   ```

4. **Run the Application:**
   - **Development Mode (with Nodemon):**
     ```bash
     npm run dev
     ```
   - **Production Mode:**
     ```bash
     npm start
     ```

5. **Access the Application:**
   - User Storefront: `http://localhost:3000`
   - Admin Portal: `http://localhost:3000/admin/login`

---

## 📄 License

This project is open-source and available under the [ISC License](LICENSE).
