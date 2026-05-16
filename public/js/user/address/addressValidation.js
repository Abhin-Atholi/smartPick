const AddressValidators = {
    fullName: (value) => {
        if (!value || value.trim().length === 0) return "Full Name is required";
        if (value.trim().length < 3) return "Full Name must be at least 3 characters";
        if (value.trim().length > 50) return "Full Name cannot exceed 50 characters";
        if (!/^(?!\d+$)(?!.*(?:[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])\1)[a-zA-Z\s'-]+$/.test(value)) {
            return "Enter a valid name without numbers or invalid symbols";
        }
        return null;
    },
    phone: (value) => {
        if (!value || value.trim().length === 0) return "Phone Number is required";
        if (!/^(?!([0-9])\1{9})[6-9][0-9]{9}$/.test(value.trim())) {
            return "Enter a valid 10-digit Indian phone number without repeating digits";
        }
        return null;
    },
    pincode: (value) => {
        if (!value || value.trim().length === 0) return "Pincode is required";
        if (!/^[0-9]{6}$/.test(value.trim())) return "Pincode must be exactly 6 digits";
        return null;
    },
    state: (value) => {
        if (!value || value.trim().length === 0) return "State is required";
        if (value.trim().length < 2) return "State must be at least 2 characters";
        if (!/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/.test(value.trim())) {
            return "Enter a valid state name";
        }
        return null;
    },
    city: (value) => {
        if (!value || value.trim().length === 0) return "City is required";
        if (value.trim().length < 2) return "City must be at least 2 characters";
        if (!/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/.test(value.trim())) {
            return "Enter a valid city name";
        }
        return null;
    },
    locality: (value) => {
        if (!value || value.trim().length === 0) return "Locality is required";
        if (value.trim().length < 2) return "Locality must be at least 2 characters";
        if (!/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/.test(value.trim())) {
            return "Enter a valid locality without junk characters";
        }
        return null;
    },
    house: (value) => {
        if (!value || value.trim().length === 0) return "House/Building is required";
        if (!/^(?!^[^a-zA-Z0-9]+$)[a-zA-Z0-9\s,/'#-]+$/.test(value.trim())) {
            return "Enter a valid House/Building details";
        }
        return null;
    },
    area: (value) => {
        if (!value || value.trim().length === 0) return "Area/Street is required";
        if (!/^(?!^[^a-zA-Z0-9]+$)[a-zA-Z0-9\s,/'#-]+$/.test(value.trim())) {
            return "Enter a valid Area/Street details";
        }
        return null;
    }
};

window.AddressValidators = AddressValidators;
