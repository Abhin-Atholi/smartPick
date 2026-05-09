import mongoose from "mongoose";
import crypto from "crypto";

// your userSchema...
export const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  profileImage: { type: String },
  profileImageId: { type: String, default: null },
  role: { type: String, enum: ["admin", "user"], default: "user", index: true },
  phone: { type: String },
  status: { type: String, enum: ["active", "blocked"], default: "active", index: true },


  isVerified: { type: Boolean, default: false },

  authProvider: { type: String, enum: ["local", "google"], default: "local" },
  googleId: { type: String, default: null },
  pendingEmail: { type: String, default: null },

  password: {
    type: String,
    required: function () {
      return this.authProvider === "local";
    },
  },

  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralRewardClaimed: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-generate a unique referral code before saving a new user
userSchema.pre('save', function (next) {
  if (this.isNew && !this.referralCode) {
    // 'SP' + 4 random bytes → e.g. 'SPAB12CD'
    this.referralCode = 'SP' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});


export default mongoose.model("User", userSchema);
