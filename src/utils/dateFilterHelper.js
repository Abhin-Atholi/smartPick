/**
 * Helper to generate date ranges for filtering analytics
 */

export const getDateRange = (filter, customFrom, customTo) => {
    const now = new Date();
    const startDate = new Date();
    const endDate = new Date();

    // Default: Reset endDate to end of today
    endDate.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'Daily':
            startDate.setHours(0, 0, 0, 0);
            break;

        case 'Weekly':
            // Get current day (0 is Sunday)
            const day = now.getDay();
            // diff = distance to Monday (Monday is 1)
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            break;

        case 'Monthly':
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            break;

        case 'Yearly':
            startDate.setMonth(0);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            break;

        case 'Custom':
            if (customFrom && customTo) {
                const start = new Date(customFrom);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customTo);
                end.setHours(23, 59, 59, 999);
                return { startDate: start, endDate: end };
            }
            // Fallback if custom dates are missing
            startDate.setHours(0, 0, 0, 0);
            break;

        default:
            // Default to Monthly
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            break;
    }

    return { startDate, endDate };
};

/**
 * Helper to get the previous period's date range for growth comparison
 */
export const getPreviousDateRange = (filter, startDate, endDate) => {
    const diff = endDate - startDate;
    const prevEndDate = new Date(startDate.getTime() - 1);
    const prevStartDate = new Date(prevEndDate.getTime() - diff);

    return { startDate: prevStartDate, endDate: prevEndDate };
};

/**
 * Returns the appropriate MongoDB aggregation grouping format based on the date range
 */
export const getGroupByFormat = (filter, startDate, endDate) => {
    const diffInMs = endDate - startDate;
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (filter === 'Daily' || diffInDays <= 1) {
        return "%H:00"; // Hourly
    } else if (filter === 'Weekly' || (diffInDays > 1 && diffInDays <= 31)) {
        return "%Y-%m-%d"; // Daily
    } else if (filter === 'Monthly' || (diffInDays > 31 && diffInDays <= 365)) {
        return "%Y-%m-%d"; // Daily (or maybe weekly if range is too large)
    } else {
        return "%Y-%m"; // Monthly
    }
};

