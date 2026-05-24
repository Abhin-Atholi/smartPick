import * as dashboardService from "../../services/admin/dashboard.service.js";
import Order from "../../model/orderModel.js";

// Renders the dashboard page template (which will fetch data via AJAX)
export const renderDashboard = async (req, res) => {
    try {
        const inventoryAlerts = await dashboardService.getInventoryAlerts();
        
        res.render("admin/dashboard/dashboard", { 
            title: "Admin Dashboard",
            inventoryAlerts,
            activePath: "/admin/dashboard"
        });
    } catch (error) {
        if (!error.isOperational) console.error("Error rendering dashboard:", error);
        res.status(500).send("Internal Server Error");
    }
};

// API Endpoint to fetch dashboard data dynamically based on filters
export const getDashboardData = async (req, res) => {
    try {
        const { filter, customFrom, customTo } = req.query;
        const data = await dashboardService.getDashboardData(filter || 'Monthly', customFrom, customTo);
        res.json({ success: true, data });
    } catch (error) {
        if (!error.isOperational) console.error("Error fetching dashboard data:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


