import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (folderName) => {
    return async (req, res, next) => {
        if (!req.files || req.files.length === 0) {
            return next();
        }

        try {
            const uploadPromises = req.files.map((file) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: folderName },
                        (error, result) => {
                            if (error) {
                                return reject(error);
                            }
                            // Emulate multer-storage-cloudinary path
                            file.path = result.secure_url; 
                            file.filename = result.public_id;
                            resolve(result);
                        }
                    );
                    streamifier.createReadStream(file.buffer).pipe(uploadStream);
                });
            });

            await Promise.all(uploadPromises);
            next();
        } catch (error) {
            console.error("Cloudinary upload error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to upload images. Please try again."
            });
        }
    };
};
