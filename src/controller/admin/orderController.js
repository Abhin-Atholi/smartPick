import * as orderService from '../../services/admin/orderService.js';
import { generateInvoice } from '../../utils/invoiceGenerator.js';

export const getOrders = async (req, res, next) => {
    try {
        const { page = 1, search = '', status = 'All', dateFrom = '', dateTo = '', sort = 'newest' } = req.query;
        const data = await orderService.getAllOrders({
            page: parseInt(page), limit: 10, search, status, dateFrom, dateTo, sort
        });
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
        const { newStatus } = req.body;
        const result = await orderService.updateOrderStatus(req.params.id, newStatus);
        res.json(result);
    } catch (err) {
        console.error('Admin updateStatus error:', err);
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
