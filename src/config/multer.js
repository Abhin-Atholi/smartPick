import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

// File Filter (Security: Only allow images)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  // We can't rely just on path.extname here easily since cloudinary will handle it, but we can check originalname and mimetype
  const isImage = file.mimetype.startsWith('image/');
  
  if (isImage) {
    return cb(null, true);
  } else {
    cb(new Error("Only images are allowed!"));
  }
};

/**
 * Reusable utility to create a multer instance that uploads to a specific Cloudinary folder.
 * @param {string} folderName - The folder inside Cloudinary where images will be stored (e.g., 'smartpick/profiles')
 * @returns {multer.Multer}
 */
export const createCloudinaryUpload = (folderName) => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folderName,
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      // You can add transformation options here if needed, e.g. resizing
      // transformation: [{ width: 500, height: 500, crop: 'limit' }]
    },
  });

  return multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // Limit 2MB
    fileFilter: fileFilter,
  });
};

// Kept for backward compatibility in case some routes still expect the default `upload`
// You should slowly migrate them to use `createCloudinaryUpload('folder_name')`
const upload = createCloudinaryUpload('smartpick/profiles');

export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Image size exceeds the 2MB limit.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  } else if (err) {
    if (err.message === "Only images are allowed!") {
      return res.status(400).json({ success: false, message: 'Only valid image formats (JPEG, PNG, WEBP) are allowed.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

export default upload;
