import mongoose from "mongoose"

export const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    pincode: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String, required: true },      // City / District
    locality: { type: String, required: true },  // Locality / Town
    house: { type: String, required: true },     // House no, building, company
    area: { type: String, required: true },      // Area, colony, street...
    country: { type: String, default: "India" },
  },
  { timestamps: true }
);

// your userSchema...
export const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  profileImage: { type: String },
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
  pendingEmail: { type: String, default: null },

  password: {
    type: String,
    required: function () {
      return this.authProvider === "local";
    },
  },

  // ✅ ADD THIS
  addresses: { type: [addressSchema], default: [] },

}, { timestamps: true });

export default mongoose.model("User", userSchema);
