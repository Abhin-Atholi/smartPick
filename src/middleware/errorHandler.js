import multer from "multer";

export const globalErrorHandler = (err, req, res, next) => {
    console.error("Global Error Caught:", err);

    // 1. Handle Multer Errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'File size exceeds the limit.' });
        }
        return res.status(400).json({ success: false, message: err.message });
    }

    // 2. Handle Custom Validation/File Errors
    if (err.message === "Only images are allowed!") {
        return res.status(400).json({ success: false, message: 'Only valid image formats are allowed.' });
    }

    // 3. Prevent crashing for unknown errors and send JSON if it's an API request
    const isAjax = req.xhr || req.headers.accept?.includes('application/json');

    if (isAjax) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || "Internal Server Error"
        });
    }

    // 4. Default fallback for normal page loads
    res.status(err.status || 500).send("Something went wrong on the server.");
};
