import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    pincode: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String, required: true },
    locality: { type: String, required: true },
    house: { type: String, required: true },
    area: { type: String, required: true },
    country: { type: String, default: "India" },
  },
  { timestamps: true }
);

export default mongoose.model("Address", addressSchema);
