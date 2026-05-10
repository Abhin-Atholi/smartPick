export const GST_PERCENT = 5; // Configurable GST percentage

export const calculateTaxableAmount = (subtotal, couponDiscount = 0) => {
    return Math.max(0, subtotal - couponDiscount);
};

export const calculateTax = (taxableAmount) => {
    return Math.round((taxableAmount * GST_PERCENT) / 100);
};

export const calculateRefundTax = (itemPrice, totalOrderTax, totalOrderTaxableAmount) => {
    if (totalOrderTaxableAmount <= 0 || totalOrderTax <= 0) return 0;
    // Refund tax proportional to the item's contribution to the taxable amount
    return Math.round((itemPrice / totalOrderTaxableAmount) * totalOrderTax);
};
