import * as orderService from '../../services/admin/orderService.js';
import { generateInvoice } from '../../utils/invoiceGenerator.js';

export const getOrders = async (req, res, next) => {
    try {
        const { page = 1, search = '', status = 'All', dateFrom = '', dateTo = '', sort = 'newest' } = req.query;
        const data = await orderService.getAllOrders({ page: parseInt(page), limit: 10, search, status, dateFrom, dateTo, sort });
        res.render('admin/orders', {
            title: 'Orders — Admin | SmartPick',
            ...data,
            filters: { search, status, dateFrom, dateTo, sort }
        });
    } catch (err) {
        console.error('Admin getOrders error:', err);
        next(err);
    }
};

export const getOrderDetails = async (req, res, next) => {
    try {
        const order = await orderService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).render('error', { message: 'Order not found' });
        res.render('admin/orderDetails', {
            title: `Order ${order.orderId || order._id} — Admin | SmartPick`,
            order
        });
    } catch (err) {
        console.error('Admin getOrderDetails error:', err);
        next(err);
    }
};

export const updateStatus = async (req, res) => {
    try {
        const result = await orderService.updateOrderStatus(req.params.id, req.body.newStatus);
        res.json(result);
    } catch (err) {
        console.error('Admin updateStatus error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const cancelItem = async (req, res) => {
    try {
        const result = await orderService.cancelOrderItem(req.params.id, req.body.itemId);
        res.json(result);
    } catch (err) {
        console.error('Admin cancelItem error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const getReturnRequests = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const data = await orderService.getReturnRequests({ page, limit: 10 });
        res.render('admin/returnRequests', {
            title: 'Return Requests — Admin | SmartPick',
            ...data
        });
    } catch (err) {
        console.error('Admin getReturnRequests error:', err);
        next(err);
    }
};

export const handleReturn = async (req, res) => {
    try {
        const { itemId, decision } = req.body;   // decision: 'approve' | 'reject'
        const result = await orderService.handleReturnDecision(req.params.id, itemId, decision);
        res.json(result);
    } catch (err) {
        console.error('Admin handleReturn error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

export const downloadInvoice = async (req, res, next) => {
    try {
        const order = await orderService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        generateInvoice(order, res, 'attachment');
    } catch (err) {
        console.error('Admin downloadInvoice error:', err);
        next(err);
    }
};

export const viewInvoice = async (req, res, next) => {
    try {
        const order = await orderService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        generateInvoice(order, res, 'inline');
    } catch (err) {
        console.error('Admin viewInvoice error:', err);
        next(err);
    }
};
