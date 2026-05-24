import multer from "multer";

export const globalErrorHandler = (err, req, res, next) => {
    // Only log full stack traces for unexpected system/programmer errors
    if (!err.isOperational) {
        console.error("🔥 Programmer/System Error Caught:", err);
    }

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

    // 3. Check if it's an AJAX or API request
    const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api');

    if (isAjax) {
        if (err.code === "EBADCSRFTOKEN") {
            return res.status(403).json({
                success: false,
                message: "Your session expired. Please refresh and try again."
            });
        }
        return res.status(err.statusCode || err.status || 500).json({
            success: false,
            message: err.message || "Internal Server Error"
        });
    }

    // 4. Handle CSRF Token Errors for standard requests
    if (err.code === "EBADCSRFTOKEN") {
        return res.status(403).render("error", {
            title: "Security Error",
            message: "Your session expired. Please refresh and try again."
        });
    }

    // 4. For form submissions, redirect back to the previous page with error message
    // If it's a POST/PUT/DELETE request and we have a referrer
    if (req.method !== 'GET') {
        const referer = req.get('Referrer');
        if (referer) {
            try {
                const url = new URL(referer);
                url.searchParams.set('msg', err.message || "Something went wrong");
                // Use relative path to avoid host issues
                return res.redirect(url.pathname + url.search);
            } catch (e) {
                // Ignore URL parsing errors
            }
        }
    }

    // 5. Render appropriate error page based on status code
    const statusCode = err.statusCode || err.status || 500;

    if (statusCode === 404 || err.message?.toLowerCase().includes('not found')) {
      if (req.originalUrl.startsWith('/admin')) {
          return res.status(404).render('admin/error/404', { title: 'Admin - Page Not Found' });
      }
      return res.status(404).render('user/error/404', {
        title: 'Page Not Found — SmartPick'
      });
    }

    res.status(statusCode).render('error', {
      title: 'Something Went Wrong — SmartPick',
      message: err.message || 'Something went wrong on the server.'
    });
};
