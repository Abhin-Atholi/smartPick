// Reusable inline validation logic

const ValidationHelper = {
    // Show an inline error message and highlight the input
    showError(input, message) {
        input.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-100');
        input.classList.remove('border-gray-200', 'focus:border-indigo-500', 'focus:ring-indigo-100', 'border-green-500');

        let errorElement = input.nextElementSibling;
        if (!errorElement || !errorElement.classList.contains('validation-error')) {
            errorElement = document.createElement('p');
            errorElement.className = 'validation-error text-red-500 text-xs font-bold mt-1 animate-in fade-in slide-in-from-top-1';
            input.parentNode.insertBefore(errorElement, input.nextSibling);
        }
        errorElement.textContent = message;
    },

    // Remove the inline error message and restore default input styling
    clearError(input) {
        input.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-100');
        input.classList.add('border-gray-200', 'focus:border-indigo-500', 'focus:ring-indigo-100');

        const errorElement = input.nextElementSibling;
        if (errorElement && errorElement.classList.contains('validation-error')) {
            errorElement.remove();
        }
    },

    // Attach real-time validation listeners to a form
    attachRealTimeValidation(form, validators) {
        Object.keys(validators).forEach(fieldName => {
            const inputs = form.querySelectorAll(`[name="${fieldName}"]`);
            inputs.forEach(input => {
                const validate = () => {
                    const error = validators[fieldName](input.value, form);
                    if (error) {
                        this.showError(input, error);
                    } else {
                        this.clearError(input);
                    }
                };

                input.addEventListener('input', validate);
                input.addEventListener('blur', validate);
            });
        });
    },

    // Validate entire form against validators mapping
    validateForm(form, validators) {
        let isValid = true;
        Object.keys(validators).forEach(fieldName => {
            const inputs = form.querySelectorAll(`[name="${fieldName}"]`);
            inputs.forEach(input => {
                const error = validators[fieldName](input.value, form);
                if (error) {
                    this.showError(input, error);
                    isValid = false;
                } else {
                    this.clearError(input);
                }
            });
        });
        return isValid;
    }
};

const CommonValidators = {
    fullName: (value) => {
        if (!value || value.trim().length === 0) return "Full Name is required";
        if (value.trim().length < 3) return "Full Name must be at least 3 characters";
        return null;
    },
    phone: (value) => {
        if (!value || value.trim().length === 0) return "Phone Number is required";
        if (!/^\d{10}$/.test(value.trim())) return "Phone number must be exactly 10 digits";
        if (!/^[6-9]\d{9}$/.test(value.trim())) return "Must be a valid Indian mobile number";
        return null;
    },
    pincode: (value) => {
        if (!value || value.trim().length === 0) return "Pincode is required";
        if (!/^\d{6}$/.test(value.trim())) return "Pincode must be exactly 6 digits";
        return null;
    },
    requiredString: (name) => (value) => {
        if (!value || value.trim().length === 0) return `${name} is required`;
        return null;
    },
    email: (value) => {
        if (!value || value.trim().length === 0) return "Email is required";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value.trim())) return "Please enter a valid email address";
        return null;
    }
};
