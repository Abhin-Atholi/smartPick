import * as orderService from '../../services/user/orderService.js';
import * as cartService from '../../services/user/cartService.js';
import Address from '../../model/addressModel.js';
import { generateInvoice } from '../../utils/invoiceGenerator.js';

export const loadCheckout = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect('/login');

        // Fetch addresses
        const addresses = await Address.find({ userId });
        
        // Fetch cart (use a high limit to get all items for checkout)
        const cartData = await cartService.getCart(userId, 1, 100);

        if (!cartData || cartData.items.length === 0) {
            return res.redirect('/cart'); // Don't allow checkout with empty cart
        }

        // Calculate totals and check stock
        let subtotal = 0;
        let hasStockIssue = false;
        const cartItemsWithStock = cartData.items
            .filter(i => i.product.isActive && !i.product.isDeleted)
            .map(item => {
                const variant = item.product.variants.find(v => v.size === item.size && v.color && v.color.name === item.color);
                const availableStock = variant ? variant.stock : 0;
                const isLowStock = availableStock > 0 && availableStock < item.quantity;
                const isOutOfStock = availableStock === 0;
                const stockIssue = isLowStock || isOutOfStock;
                if (stockIssue) hasStockIssue = true;
                if (!stockIssue) subtotal += item.totalPrice;
                return { ...item, availableStock, isLowStock, isOutOfStock, stockIssue };
            });

        const shippingFee = subtotal > 999 ? 0 : 50;
        const totalAmount = subtotal + shippingFee;

        res.render('user/checkout', {
            title: "Checkout — SmartPick",
            activePath: "/checkout",
            addresses,
            cartItems: cartItemsWithStock,
            subtotal,
            shippingFee,
            totalAmount,
            hasStockIssue
        });
    } catch (err) {
        console.error("loadCheckout error:", err);
        next(err);
    }
};

export const placeOrder = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to place an order" });
        }

        const { addressId, paymentMethod } = req.body;

        if (!addressId) {
            return res.status(400).json({ success: false, message: "Please select a shipping address" });
        }
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: "Please select a payment method" });
        }

        const result = await orderService.placeOrder(userId, addressId, paymentMethod);

        if (result.success) {
            res.json({ success: true, message: "Order placed successfully", orderId: result.orderId });
        } else {
            res.status(400).json({ success: false, message: result.message, affectedItems: result.affectedItems || [] });
        }
    } catch (err) {
        console.error("placeOrder error:", err.message);
        console.error(err.stack);
        res.status(500).json({ success: false, message: err.message || "An error occurred while placing your order" });
    }
};

export const loadOrderSuccess = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect('/login');

        const orderId = req.query.orderId || null;

        res.render('user/orders/success', {
            title: "Order Successful — SmartPick",
            activePath: "/checkout",
            orderId
        });
    } catch (err) {
        console.error("loadOrderSuccess error:", err);
        next(err);
    }
};

export const getOrders = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect('/login');

        const page   = parseInt(req.query.page) || 1;
        const filter = req.query.status || 'All';
        const limit  = 5;
        const search = { q: req.query.q || '', date: req.query.date || '' };

        const orderData = await orderService.getOrders(userId, page, limit, filter, search);

        res.render('user/orders/index', {
            title: "My Orders — SmartPick",
            activePath: "/orders",
            orders: orderData.orders,
            currentPage: orderData.currentPage,
            totalPages: orderData.totalPages,
            totalOrders: orderData.totalOrders,
            filter,
            search   // forward back to view so inputs stay filled
        });
    } catch (err) {
        console.error("getOrders error:", err);
        next(err);
    }
};

export const cancelOrder = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId, reason, itemId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        let result;
        if (itemId) {
            result = await orderService.cancelOrderItem(userId, orderId, itemId, reason);
        } else {
            result = await orderService.cancelOrder(userId, orderId, reason);
        }

        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (err) {
        console.error("cancelOrder error:", err);
        res.status(500).json({ success: false, message: "An error occurred during cancellation" });
    }
};

export const returnOrder = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId, reason, itemId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }
        if (!reason) {
            return res.status(400).json({ success: false, message: "Return reason is required" });
        }

        let result;
        if (itemId) {
            result = await orderService.returnOrderItem(userId, orderId, itemId, reason);
        } else {
            result = await orderService.returnOrder(userId, orderId, reason);
        }

        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (err) {
        console.error("returnOrder error:", err);
        res.status(500).json({ success: false, message: "An error occurred during return request" });
    }
};

export const getOrderDetails = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect('/login');

        const { id } = req.params;
        const order = await orderService.getOrderById(userId, id);

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        res.render('user/orders/details', {
            title: `Order ${order.orderId || '#' + id.slice(-6).toUpperCase()} — SmartPick`,
            activePath: '/orders',
            order
        });
    } catch (err) {
        console.error('getOrderDetails error:', err);
        next(err);
    }
};

// ── Shared helper for both invoice routes ────────────────────────────────────
const serveInvoice = async (req, res, next, disposition) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect('/login');

        const { id } = req.params;
        const order = await orderService.getOrderById(userId, id);

        if (!order) {
            return res.status(404).json({ message: 'Order not found or access denied' });
        }

        generateInvoice(order, res, disposition);
    } catch (err) {
        console.error('Invoice error:', err);
        next(err);
    }
};

export const viewInvoice = (req, res, next) =>
    serveInvoice(req, res, next, 'inline');

export const downloadInvoice = (req, res, next) =>
    serveInvoice(req, res, next, 'attachment');
