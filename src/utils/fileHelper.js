import fs from "fs";
import path from "path";

export const deleteLocalFile = (relativePath) => {
  if (!relativePath) return;
  // process.cwd() ensures we start from the root of the project
  const fullPath = path.join(process.cwd(), "src", "public", relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};