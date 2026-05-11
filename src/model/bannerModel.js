import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: "Homepage Banner",
    },
    imageUrl: {
      type: String,
      required: true,
    },
    /**
     * Cloudinary public_id — needed to delete/replace the asset on Cloudinary.
     * Derived from the Cloudinary URL path after the upload version segment.
     */
    publicId: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Banner = mongoose.model("Banner", bannerSchema);
export default Banner;
