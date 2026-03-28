import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.js";

// Keep this around just in case there are still local files
export const deleteLocalFile = (relativePath) => {
  if (!relativePath) return;
  // process.cwd() ensures we start from the root of the project
  const fullPath = path.join(process.cwd(), "public", relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

/**
 * Delete a file from Cloudinary using its public ID
 * @param {string} publicId - The public ID of the image on Cloudinary
 */
export const deleteCloudinaryFile = async (publicId) => {
  try {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId);
    console.log(`Successfully deleted image from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error(`Failed to delete image from Cloudinary: ${publicId}`, error);
  }
};