// Auth specific validation using ValidationHelper
const AuthValidators = {
    name: (value) => {
        if (!value || value.trim().length === 0) return 'Name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        if (value.trim().length > 50) return 'Name cannot exceed 50 characters';
        if (!/^(?!\s)(?!.*\s{2,})[a-zA-Z\s]+(?<!\s)$/.test(value))
            return 'Enter a valid name (alphabets only, no consecutive spaces)';
        return null;
    },
    email: (value) => {
        if (!value || value.trim().length === 0) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
            return 'Please enter a valid email address';
        return null;
    },
    password: (value) => {
        if (!value || value.trim().length === 0) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (!/(?=.*[a-z])/.test(value)) return 'Password must contain at least 1 lowercase letter';
        if (!/(?=.*[A-Z])/.test(value)) return 'Password must contain at least 1 uppercase letter';
        if (!/(?=.*\d)/.test(value)) return 'Password must contain at least 1 number';
        if (!/(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",./<>?])/.test(value)) return 'Password must contain at least 1 special character';
        if (/\s/.test(value)) return 'Password cannot contain spaces';
        return null;
    },
    confirmPassword: (value, form) => {
        if (!value || value.length === 0) return 'Confirm Password is required';
        const passwordInput = form.querySelector('[name="password"]') || form.querySelector('[name="newPassword"]');
        if (passwordInput && value !== passwordInput.value) {
            return 'Passwords do not match';
        }
        return null;
    }
};

const setupPasswordStrengthMeter = (form) => {
    const passwordInput = form.querySelector('[name="password"]') || form.querySelector('[name="newPassword"]');
    if (!passwordInput) return;

    // Create strength meter UI if it doesn't exist
    let meterContainer = form.querySelector('.password-meter-container');
    if (!meterContainer) {
        meterContainer = document.createElement('div');
        meterContainer.className = 'password-meter-container mt-2 text-sm';
        meterContainer.innerHTML = `
            <div class="flex h-1 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
                <div class="meter-bar h-full bg-gray-300 w-0 transition-all duration-500 ease-out"></div>
            </div>
            <div class="text-[11px] font-semibold meter-text text-gray-400 mb-1 tracking-wide uppercase transition-colors">Password Strength</div>
        `;
        passwordInput.insertAdjacentElement('afterend', meterContainer);
    }

    const regexChecks = {
        length: /.{8,}/,
        upper: /(?=.*[A-Z])/,
        lower: /(?=.*[a-z])/,
        num: /(?=.*\d)/,
        spec: /(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",./<>?])/,
        space: /^[^\s]+$/
    };
    
    const meterBar = meterContainer.querySelector('.meter-bar');
    const meterText = meterContainer.querySelector('.meter-text');

    passwordInput.addEventListener('input', (e) => {
        const val = e.target.value;
        let score = 0;
        
        // Specifically check spaces
        const hasNoSpace = val.length === 0 || regexChecks.space.test(val);
        
        if (val.length > 0) {
            if (hasNoSpace) score++;
            Object.keys(regexChecks).forEach(key => {
                if (key === 'space') return;
                if (regexChecks[key].test(val)) {
                    score++;
                }
            });
        }

        // Update meter
        if (val.length === 0) {
            meterBar.style.width = '0%';
            meterText.innerText = 'Password Strength';
            meterText.className = 'text-[11px] font-semibold meter-text text-gray-400 mb-3 tracking-wide uppercase transition-colors';
        } else if (score <= 2) {
            meterBar.style.width = '33%';
            meterBar.className = 'meter-bar h-full bg-rose-500 transition-all duration-500 ease-out';
            meterText.innerText = 'Weak';
            meterText.className = 'text-[11px] font-semibold meter-text text-rose-500 mb-3 tracking-wide uppercase transition-colors';
        } else if (score <= 4) {
            meterBar.style.width = '66%';
            meterBar.className = 'meter-bar h-full bg-amber-500 transition-all duration-500 ease-out';
            meterText.innerText = 'Medium';
            meterText.className = 'text-[11px] font-semibold meter-text text-amber-500 mb-3 tracking-wide uppercase transition-colors';
        } else if (score === 6 && hasNoSpace) {
            meterBar.style.width = '100%';
            meterBar.className = 'meter-bar h-full bg-emerald-500 transition-all duration-500 ease-out';
            meterText.innerText = 'Strong';
            meterText.className = 'text-[11px] font-semibold meter-text text-emerald-500 mb-3 tracking-wide uppercase transition-colors';
        } else {
            meterBar.style.width = '80%';
            meterBar.className = 'meter-bar h-full bg-amber-500 transition-all duration-500 ease-out';
            meterText.innerText = 'Almost there...';
            meterText.className = 'text-[11px] font-semibold meter-text text-amber-500 mb-3 tracking-wide uppercase transition-colors';
        }
    });
};

const setupCapsLockDetection = (form) => {
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        let warning = form.querySelector('.caps-lock-warning');
        if (!warning) {
            warning = document.createElement('p');
            warning.className = 'caps-lock-warning text-yellow-600 text-xs font-semibold mt-1 hidden';
            warning.innerHTML = '⚠️ Caps Lock is ON';
            input.insertAdjacentElement('afterend', warning);
        }
        
        input.addEventListener('keyup', (e) => {
            if (e.getModifierState && e.getModifierState('CapsLock')) {
                warning.classList.remove('hidden');
            } else {
                warning.classList.add('hidden');
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.getModifierState && e.getModifierState('CapsLock')) {
                warning.classList.remove('hidden');
            } else {
                warning.classList.add('hidden');
            }
        });
    });
};

// Debounce for email check
let emailCheckTimeout = null;
const setupEmailUniquenessCheck = (form) => {
    const emailInput = form.querySelector('[name="email"]');
    if (!emailInput) return;

    let emailMsgContainer = document.createElement('div');
    emailMsgContainer.className = 'email-availability-msg text-xs font-semibold mt-1';
    emailInput.insertAdjacentElement('afterend', emailMsgContainer);

    emailInput.addEventListener('input', () => {
        clearTimeout(emailCheckTimeout);
        emailMsgContainer.innerHTML = '';
        
        const email = emailInput.value.trim();
        const err = AuthValidators.email(email);
        if (err || email.length === 0) return; // Wait until valid format

        emailMsgContainer.innerHTML = '<span class="text-blue-500">Checking availability...</span>';
        
        emailCheckTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/auth/check-email?email=${encodeURIComponent(email)}`, {
                    credentials: 'same-origin'
                });
                const data = await res.json();
                if (data.available) {
                    emailMsgContainer.innerHTML = '<span class="text-green-500">✔ Email available</span>';
                } else {
                    emailMsgContainer.innerHTML = '<span class="text-red-500">✕ Email already exists</span>';
                    // Force input to invalid state
                    ValidationHelper.showError(emailInput, 'Email already exists');
                }
            } catch (err) {
                emailMsgContainer.innerHTML = ''; // Silent fail, let backend handle it
            }
        }, 500); // 500ms debounce
    });
};

// Setup Form Submission
const setupFormSubmit = (form, formType) => {
    const btn = form.querySelector('button[type="submit"]');
    
    form.addEventListener('submit', (e) => {
        let validatorsToUse = {};
        if (formType === 'register') {
            validatorsToUse = { name: AuthValidators.name, email: AuthValidators.email, password: AuthValidators.password, confirmPassword: AuthValidators.confirmPassword };
        } else if (formType === 'login') {
            validatorsToUse = { email: AuthValidators.email, password: (v) => (!v ? 'Password is required' : null) };
        } else if (formType === 'reset') {
            validatorsToUse = { 
                otp: (v) => {
                    if (!v || v.trim().length === 0) return 'OTP is required';
                    if (!/^\d{6}$/.test(v.trim())) return 'OTP must be exactly 6 digits';
                    return null;
                },
                password: AuthValidators.password, 
                confirmPassword: AuthValidators.confirmPassword 
            };
        } else if (formType === 'forgot') {
            validatorsToUse = { email: AuthValidators.email };
        } else if (formType === 'verify') {
            validatorsToUse = {
                otp: (v) => {
                    if (!v || v.trim().length === 0) return 'OTP is required';
                    if (!/^\d{6}$/.test(v.trim())) return 'OTP must be exactly 6 digits';
                    return null;
                }
            };
        } else if (formType === 'resend') {
            validatorsToUse = {};
        }
        
        const isValid = ValidationHelper.validateForm(form, validatorsToUse);
        
        // Extra check for email availability message in register
        if (formType === 'register') {
            const emailInput = form.querySelector('[name="email"]');
            if (emailInput && emailInput.classList.contains('border-red-400')) {
                e.preventDefault();
                return;
            }
        }
        
        if (!isValid) {
            e.preventDefault();
            return;
        }

        // Show global loader ONLY after validation passes
        if (window.Loader) {
            let msg = 'Please wait...';
            if (formType === 'register') msg = 'Creating your account...';
            else if (formType === 'login') msg = 'Signing you in...';
            else if (formType === 'reset') msg = 'Resetting your password...';
            else if (formType === 'forgot') msg = 'Sending OTP...';
            else if (formType === 'verify') msg = 'Verifying OTP...';
            else if (formType === 'resend') msg = 'Resending OTP...';
            window.Loader.show(msg);
        }

        // Disable button, show spinner
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
            const originalText = btn.innerHTML;
            btn.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline-block" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;
            
            // Re-enable if page loads from bfcache
            window.addEventListener('pageshow', () => {
                btn.disabled = false;
                btn.classList.remove('opacity-70', 'cursor-not-allowed');
                btn.innerHTML = originalText;
            });
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const resetForm = document.getElementById('resetPasswordForm');
    const updatePasswordForm = document.getElementById('updatePasswordForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    const verifyOtpForm = document.getElementById('verifyOtpForm');
    const resendOtpForm = document.getElementById('resendOtpForm');
    const resendResetOtpForm = document.getElementById('resendResetOtpForm');

    if (registerForm) {
        ValidationHelper.attachRealTimeValidation(registerForm, {
            name: AuthValidators.name,
            email: AuthValidators.email,
            password: AuthValidators.password,
            confirmPassword: AuthValidators.confirmPassword
        });
        setupPasswordStrengthMeter(registerForm);
        setupCapsLockDetection(registerForm);
        setupEmailUniquenessCheck(registerForm);
        setupFormSubmit(registerForm, 'register');
    }

    if (loginForm) {
        ValidationHelper.attachRealTimeValidation(loginForm, {
            email: AuthValidators.email,
            password: (v) => (!v ? 'Password is required' : null)
        });
        setupCapsLockDetection(loginForm);
        setupFormSubmit(loginForm, 'login');
    }

    if (resetForm) {
        ValidationHelper.attachRealTimeValidation(resetForm, {
            otp: (v) => {
                if (!v || v.trim().length === 0) return 'OTP is required';
                if (!/^\d{6}$/.test(v.trim())) return 'OTP must be exactly 6 digits';
                return null;
            },
            password: AuthValidators.password,
            confirmPassword: AuthValidators.confirmPassword
        });
        setupPasswordStrengthMeter(resetForm);
        setupCapsLockDetection(resetForm);
        setupFormSubmit(resetForm, 'reset');
    }

    if (forgotForm) {
        ValidationHelper.attachRealTimeValidation(forgotForm, {
            email: AuthValidators.email
        });
        setupFormSubmit(forgotForm, 'forgot');
    }

    if (verifyOtpForm) {
        ValidationHelper.attachRealTimeValidation(verifyOtpForm, {
            otp: (v) => {
                if (!v || v.trim().length === 0) return 'OTP is required';
                if (!/^\d{6}$/.test(v.trim())) return 'OTP must be exactly 6 digits';
                return null;
            }
        });
        setupFormSubmit(verifyOtpForm, 'verify');
    }

    if (resendOtpForm) {
        setupFormSubmit(resendOtpForm, 'resend');
    }

    if (resendResetOtpForm) {
        setupFormSubmit(resendResetOtpForm, 'resend');
    }

    if (updatePasswordForm) {
        ValidationHelper.attachRealTimeValidation(updatePasswordForm, {
            currentPassword: (v) => (!v ? 'Current password is required' : null),
            newPassword: AuthValidators.password,
            confirmPassword: AuthValidators.confirmPassword
        });
        setupPasswordStrengthMeter(updatePasswordForm);
        setupCapsLockDetection(updatePasswordForm);
        // We handle submission manually in security.ejs with axios
    }
});
