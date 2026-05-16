// ─── ValidationHelper ────────────────────────────────────────────────────────
const ValidationHelper = {
    showError(input, message) {
        input.classList.remove('border-gray-200', 'border-green-400',
            'focus:border-indigo-500', 'focus:ring-indigo-100',
            'focus:border-green-400', 'focus:ring-green-100');
        input.classList.add('border-red-400', 'focus:border-red-400', 'focus:ring-red-100');

        let err = input.parentNode.querySelector('.validation-error');
        if (!err) {
            err = document.createElement('p');
            err.className = 'validation-error text-red-500 text-[11px] font-bold mt-1 flex items-center gap-1';
            // insert right after input (before any pincode-status elements)
            input.insertAdjacentElement('afterend', err);
        }
        err.innerHTML = `<span class="text-red-400">✕</span> ${message}`;
    },

    showSuccess(input) {
        input.classList.remove('border-gray-200', 'border-red-400',
            'focus:border-red-400', 'focus:ring-red-100',
            'focus:border-indigo-500', 'focus:ring-indigo-100');
        input.classList.add('border-green-400', 'focus:border-green-400', 'focus:ring-green-100');

        const err = input.parentNode.querySelector('.validation-error');
        if (err) err.remove();
    },

    clearError(input) {
        input.classList.remove('border-red-400', 'border-green-400',
            'focus:border-red-400', 'focus:ring-red-100',
            'focus:border-green-400', 'focus:ring-green-100');
        input.classList.add('border-gray-200', 'focus:border-indigo-500', 'focus:ring-indigo-100');

        const err = input.parentNode.querySelector('.validation-error');
        if (err) err.remove();
    },

    attachRealTimeValidation(form, validators) {
        Object.keys(validators).forEach(fieldName => {
            form.querySelectorAll(`[name="${fieldName}"]`).forEach(input => {
                const run = () => {
                    const error = validators[fieldName](input.value, form);
                    if (error) {
                        this.showError(input, error);
                    } else if (input.value.trim().length > 0) {
                        this.showSuccess(input);
                    } else {
                        this.clearError(input);
                    }
                };
                input.addEventListener('input', run);
                input.addEventListener('blur', run);
            });
        });
    },

    validateForm(form, validators) {
        let isValid = true;
        Object.keys(validators).forEach(fieldName => {
            form.querySelectorAll(`[name="${fieldName}"]`).forEach(input => {
                const error = validators[fieldName](input.value, form);
                if (error) {
                    this.showError(input, error);
                    isValid = false;
                } else {
                    this.showSuccess(input);
                }
            });
        });
        // Scroll to first error
        if (!isValid) {
            const first = form.querySelector('.border-red-400');
            if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return isValid;
    }
};

// ─── CommonValidators ─────────────────────────────────────────────────────────
const CommonValidators = {
    fullName: (value) => {
        if (!value || value.trim().length === 0) return 'Full Name is required';
        if (value.trim().length < 3) return 'Full Name must be at least 3 characters';
        if (value.trim().length > 50) return 'Full Name cannot exceed 50 characters';
        if (!/^(?!\d+$)[a-zA-Z\s'-]+$/.test(value.trim()))
            return 'Enter a valid name (letters only, no numbers or symbols)';
        return null;
    },
    phone: (value) => {
        if (!value || value.trim().length === 0) return 'Phone Number is required';
        if (!/^(?!([0-9])\1{9})[6-9][0-9]{9}$/.test(value.trim()))
            return 'Enter a valid 10-digit Indian number (no repeating digits)';
        return null;
    },
    pincode: (value) => {
        if (!value || value.trim().length === 0) return 'Pincode is required';
        if (!/^[0-9]{6}$/.test(value.trim())) return 'Pincode must be exactly 6 digits';
        return null;
    },
    email: (value) => {
        if (!value || value.trim().length === 0) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
            return 'Please enter a valid email address';
        return null;
    },
    requiredString: (name, min = 2, max = 100) => (value) => {
        if (!value || value.trim().length === 0) return `${name} is required`;
        if (value.trim().length < min) return `${name} must be at least ${min} characters`;
        if (value.trim().length > max) return `${name} cannot exceed ${max} characters`;
        if (/^\d+$/.test(value.trim())) return `${name} cannot be numbers only`;
        return null;
    }
};
