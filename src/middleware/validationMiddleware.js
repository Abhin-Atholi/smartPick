export const validateRequest = (schema) => {
    return (req, res, next) => {
        // Handle parsing of stringified JSON objects (commonly from FormData)
        const parsedBody = { ...req.body };
        
        for (const key in parsedBody) {
            if (typeof parsedBody[key] === 'string') {
                try {
                    // Try parsing arrays and objects
                    if (parsedBody[key].startsWith('[') || parsedBody[key].startsWith('{')) {
                        parsedBody[key] = JSON.parse(parsedBody[key]);
                    }
                } catch (e) {
                    // Ignore, let Joi catch the type mismatch if it's invalid
                }
            }
        }

        // Validate the payload
        const { error, value } = schema.validate(parsedBody, { abortEarly: false, stripUnknown: true });

        if (error) {
            const errors = {};
            error.details.forEach((err) => {
                // If it's a deeply nested error (e.g., colorOptions[0].images), build a structured error or dot notation
                const key = err.path.join('.');
                errors[key] = err.message;
            });

            return res.status(400).json({
                success: false,
                errors: errors
            });
        }

        // Replace the body with validated, sanitized, and parsed values
        req.body = value;
        next();
    };
};
