import mongoose from "mongoose"

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



}, { timestamps: true });

export default mongoose.model("User", userSchema);
