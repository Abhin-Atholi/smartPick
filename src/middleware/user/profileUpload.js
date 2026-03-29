import upload from "../../config/multer.js";

export const profileUploadMiddleware = (req, res, next) => {
  upload.single("profileImage")(req, res, (err) => {
    if (err) {
      if (err.message === "File too large") {
        return res.status(400).json({ success: false, message: "Image size must be less than 2MB." });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};
