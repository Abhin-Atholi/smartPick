export const GST_PERCENT = 5; // Configurable GST percentage

export const calculateTaxableAmount = (subtotal, couponDiscount = 0) => {
    return Math.max(0, subtotal - couponDiscount);
};

export const calculateTax = (taxableAmount) => {
    return Math.round((taxableAmount * GST_PERCENT) / 100);
};

