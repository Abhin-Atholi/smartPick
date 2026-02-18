const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: "" },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },

    // optional: mark default address
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },

    role: { type: String, enum: ["admin", "user"], default: "user", index: true },
    phone: { type: String },

    status: { type: String, enum: ["active", "blocked"], default: "active", index: true },

    isVerified: { type: Boolean, default: false },

    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    otpLastSentAt: { type: Date, default: null },
    otpPurpose: { type: String, enum: ["verify", "reset_password"], default: null },

    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, default: null },

    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      },
    },

    // ✅ ADD THIS
    addresses: { type: [addressSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("user", userSchema);
