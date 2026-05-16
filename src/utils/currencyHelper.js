/**
 * Formats a number as Indian Rupees (INR) with standard localization.
 * @param {Number} amount - The amount to format
 * @returns {String} The formatted string, e.g., "₹1,299.00" or "₹1,299"
 */
export const formatCurrency = (amount) => {
    const validAmount = isNaN(amount) ? 0 : Number(amount);
    return '₹' + validAmount.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: validAmount % 1 === 0 ? 0 : 2
    });
};
