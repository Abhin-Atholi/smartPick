import * as orderService from '../../services/admin/order.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { generateInvoice } from '../../utils/invoiceGenerator.js';
import { formatAdminOrderForDisplay } from '../../services/common/adminOrderPresentation.service.js';

export const getOrders = asyncHandler(async (req, res) => {
    const { page = 1, search = '', status = 'All', dateFrom = '', dateTo = '', sort = 'newest' } = req.query;
    const data = await orderService.getAllOrders({ page: parseInt(page), limit: 10, search, status, dateFrom, dateTo, sort });
    const formattedOrders = data.orders.map(order => formatAdminOrderForDisplay(order));
    
    res.render('admin/orders/orders', {
        title: 'Orders — Admin | SmartPick',
        ...data,
        orders: data.orders, // keep original for backward compatibility if needed, though we will replace rendering with formattedOrders
        formattedOrders,
        filters: { search, status, dateFrom, dateTo, sort },
        activePath: "/admin/orders"
    });
});

export const getOrderDetails = asyncHandler(async (req, res) => {
    const order = await orderService.getOrderByIdAdmin(req.params.id);
    if (!order) return res.status(404).render('error', { message: 'Order not found' });
    const formattedOrder = formatAdminOrderForDisplay(order);
    res.render('admin/orders/orderDetails', {
        title: `Order ${formattedOrder.orderId} — Admin | SmartPick`,
        order,
        formattedOrder,
        activePath: "/admin/orders"
    });
});

export const updateStatus = asyncHandler(async (req, res) => {
    const adminId = req.admin?._id || req.session?.admin?._id;
    const result = await orderService.updateOrderStatus(req.params.id, req.body.newStatus, adminId);
    res.json(result);
});

export const cancelItem = asyncHandler(async (req, res) => {
    const adminId = req.admin?._id || req.session?.admin?._id;
    const result = await orderService.cancelOrderItem(req.params.id, req.body.itemId, adminId);
    res.json(result);
});

export const getReturnRequests = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const status = req.query.status || 'Return Requested';
    const search = req.query.search || '';

    const data = await orderService.getReturnRequests({ page, limit: 10, status, search });
    
    // Dynamic import to avoid circular dependencies if any, or just import at the top
    const { formatAdminReturnItemForDisplay } = await import('../../services/common/adminOrderPresentation.service.js');
    const formattedItems = data.returnItems.map(item => formatAdminReturnItemForDisplay(item));

    res.render('admin/orders/returnRequests', {
        title: 'Return Management — Admin | SmartPick',
        ...data,
        formattedItems,
        filters: { status, search },
        activePath: "/admin/orders"
    });
});

export const handleReturn = asyncHandler(async (req, res) => {
    const adminId = req.admin?._id || req.session?.admin?._id;
    const { itemId, decision, notes, restockable, inspectionStatus } = req.body;
    const decisionPayload = { decision, notes, restockable, inspectionStatus };
    const result = await orderService.handleReturnDecision(req.params.id, itemId, decisionPayload, adminId);
    res.json(result);
});

export const downloadInvoice = asyncHandler(async (req, res) => {
    const order = await orderService.getOrderByIdAdmin(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    generateInvoice(order, res, 'attachment');
});

export const viewInvoice = asyncHandler(async (req, res) => {
    const order = await orderService.getOrderByIdAdmin(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    generateInvoice(order, res, 'inline');
});

