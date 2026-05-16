import Product from '../../model/productModel.js';
import * as refundService from './refundService.js';
import * as walletService from '../user/walletService.js';
import { createLogger } from '../../utils/logger.js';
import { sessionOpts } from '../../utils/transactionHelper.js';

const log = createLogger('orderLifecycleService');

const STATE_TRANSITIONS = {
    'Processing':       ['Shipped', 'Cancelled'],
    'Shipped':          ['Out for Delivery', 'Cancelled'],
    'Out for Delivery': ['Delivered', 'Cancelled'],
    'Delivered':        ['Return Requested'],
    'Return Requested': ['Returned', 'Return Rejected'],
    'Return Rejected':  [],
    'Returned':         [],
    'Cancelled':        [],
    'Payment Pending':  ['Processing', 'Payment Failed', 'Expired'],
    'Payment Failed':   ['Processing', 'Expired'],
    'Expired':          []
};

const isValidTransition = (currentStatus, newStatus) => {
    const allowed = STATE_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
};

// ── Polymorphic Audit Log Helper ─────────────────────────────────────────────
/**
 * Append an immutable audit entry to order.lifecycleHistory.
 *
 * @param {object}  order      - Mongoose Order document
 * @param {string}  action     - Action key (e.g. 'ADMIN_CANCELLED_ORDER')
 * @param {*}       actorId    - ObjectId | null  (null for System events)
 * @param {'User'|'Admin'|'System'} actorModel - Actor type
 * @param {string}  fromStatus - Previous status
 * @param {string}  toStatus   - Next status
 * @param {string}  [reason]   - Optional human-readable reason
 * @param {object}  [metadata] - Optional snapshot data
 */
const auditLog = (order, action, actorId, actorModel, fromStatus, toStatus, reason = null, metadata = null) => {
    if (!order.lifecycleHistory) order.lifecycleHistory = [];
    // Only push a valid actorId (ObjectId) or null — never a raw string
    const safeActor = actorId && typeof actorId === 'object' ? actorId : null;
    order.lifecycleHistory.push({
        actor:      safeActor,
        actorModel: actorModel || 'System',
        action,
        fromStatus,
        toStatus,
        reason,
        metadata,
        createdAt:  new Date()
    });
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Restore stock for a single item. Idempotent via stockRestored flag.
 */
const restoreStock = async (item, session = null) => {
    if (item.stockRestored) return false;
    const arrayFilter = item.variantId
        ? { 'v._id': item.variantId }
        : { 'v.size': item.size, 'v.color': item.color };
    await Product.updateOne(
        { _id: item.product },
        { $inc: { 'variants.$[v].stock': item.quantity } },
        { arrayFilters: [arrayFilter], ...sessionOpts(session) }
    );
    item.stockRestored = true;
    return true;
};

/**
 * Orchestrate a wallet refund for the given item IDs.
 * Returns total refund amount credited.
 */
const orchestrateRefund = async (order, itemsToRefundIds, refundType, reason, session = null) => {
    const itemsToRefund = order.items.filter(
        i => itemsToRefundIds.includes(i._id.toString()) && !i.refundProcessed
    );
    if (itemsToRefund.length === 0) return 0;

    const isPrepaid = ['Razorpay', 'Wallet'].includes(order.paymentMethod);
    const hasPaid   = order.paymentStatus === 'Paid';

    if (!isPrepaid || !hasPaid) {
        itemsToRefund.forEach(item => {
            item.refundProcessed   = true;
            item.refundProcessedAt = new Date();
        });
        return 0;
    }

    const refundResult = refundService.calculateRefund({ order, itemsToRefund: itemsToRefundIds, refundType });
    const totalRefund  = refundResult.breakdown.totalRefund;

    if (totalRefund > 0) {
        log.financial('REFUND_CREDIT', totalRefund, order.user, order._id);
        const txn = await walletService.creditWallet(
            order.user,
            totalRefund,
            `Refund for ${refundType === refundService.REFUND_TYPES.FULL_CANCEL ? 'cancelled order' : 'item(s)'} ${order.orderId}`,
            'Refund',
            order._id,
            session
        );
        itemsToRefund.forEach(item => {
            item.refundProcessed      = true;
            item.refundProcessedAt    = new Date();
            if (txn) item.refundTransactionId = txn._id;
        });
        return totalRefund;
    }
    return 0;
};

// ── Exported Lifecycle Functions ─────────────────────────────────────────────

/**
 * Cancel an entire order.
 *
 * @param {object} order
 * @param {ObjectId} actorId  - Real ObjectId of the user or admin
 * @param {'user'|'admin'|'system'} role
 * @param {string} reason
 * @param {mongoose.ClientSession|null} session
 */
export const cancelOrder = async (order, actorId, role, reason, session = null) => {
    if (!['Processing', 'Payment Pending', 'Payment Failed'].includes(order.orderStatus)) {
        throw new Error(`Cannot cancel order in ${order.orderStatus} status`);
    }

    const eligibleItems = order.items.filter(i =>
        ['Processing', 'Payment Pending', 'Payment Failed'].includes(i.itemStatus)
    );
    if (eligibleItems.length === 0) throw new Error('No eligible items to cancel');

    const itemIds = eligibleItems.map(i => i._id.toString());
    const actorModel = role === 'admin' ? 'Admin' : role === 'system' ? 'System' : 'User';

    const refundAmount = await orchestrateRefund(order, itemIds, refundService.REFUND_TYPES.FULL_CANCEL, reason, session);

    for (const item of eligibleItems) {
        const prevItemStatus = item.itemStatus;
        await restoreStock(item, session);
        auditLog(order, 'ITEM_CANCELLED', actorId, actorModel, prevItemStatus, 'Cancelled', reason);
        item.itemStatus   = 'Cancelled';
        item.cancelReason = reason;
    }

    const prevStatus   = order.orderStatus;
    order.orderStatus  = 'Cancelled';
    order.cancelReason = reason;
    if (refundAmount > 0 || order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';

    const action = role === 'admin' ? 'ADMIN_CANCELLED_ORDER' : 'USER_CANCELLED_ORDER';
    auditLog(order, action, actorId, actorModel, prevStatus, 'Cancelled', reason, { refundAmount });
    log.lifecycle(action, order._id, prevStatus, 'Cancelled', { refundAmount });

    await order.save(sessionOpts(session));
    return { success: true, refundAmount };
};

/**
 * Cancel a specific order item.
 */
export const cancelOrderItem = async (order, itemId, actorId, role, reason, session = null) => {
    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found');
    if (!['Processing', 'Payment Pending', 'Payment Failed'].includes(item.itemStatus)) {
        throw new Error(`Cannot cancel item in ${item.itemStatus} status`);
    }

    const actorModel = role === 'admin' ? 'Admin' : 'User';
    const refundAmount = await orchestrateRefund(order, [item._id.toString()], refundService.REFUND_TYPES.PARTIAL_CANCEL, reason, session);

    const prevStatus = item.itemStatus;
    await restoreStock(item, session);
    item.itemStatus   = 'Cancelled';
    item.cancelReason = reason;
    auditLog(order, 'ITEM_CANCELLED', actorId, actorModel, prevStatus, 'Cancelled', reason, { itemId });

    const activeItems = order.items.filter(i => !['Cancelled', 'Returned', 'Expired'].includes(i.itemStatus));
    if (activeItems.length === 0) {
        order.orderStatus = 'Cancelled';
        if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
    }

    await order.save(sessionOpts(session));
    return { success: true, refundAmount };
};

/**
 * Request return for an item (User-initiated).
 */
export const requestItemReturn = async (order, itemId, userId, reason, session = null) => {
    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found');
    if (item.itemStatus !== 'Delivered') throw new Error('Only delivered items can be returned');

    const prevStatus  = item.itemStatus;
    item.itemStatus   = 'Return Requested';
    item.returnReason = reason;
    auditLog(order, 'USER_REQUESTED_RETURN', userId, 'User', prevStatus, 'Return Requested', reason);

    const allPending = order.items.every(i => ['Return Requested', 'Returned', 'Cancelled'].includes(i.itemStatus));
    if (allPending && order.orderStatus !== 'Returned') order.orderStatus = 'Return Requested';

    await order.save(sessionOpts(session));
    return { success: true };
};

/**
 * Handle admin decision on a return request (with inspection workflow).
 *
 * @param {object} order
 * @param {string|ObjectId} itemId
 * @param {ObjectId} adminId  - Real admin ObjectId from req.session or req.admin
 * @param {object} decisionPayload
 * @param {mongoose.ClientSession|null} session
 */
export const handleReturnDecision = async (order, itemId, adminId, decisionPayload, session = null) => {
    const { decision, notes, restockable, inspectionStatus } = decisionPayload;

    const item = order.items.id(itemId);
    if (!item) throw new Error('Item not found');
    if (item.itemStatus !== 'Return Requested') throw new Error('Item is not pending a return request');

    const prevStatus = item.itemStatus;

    item.returnInspection = {
        status:      inspectionStatus || (decision === 'approve' ? 'Approved' : 'Rejected'),
        notes:       notes || '',
        restockable: !!restockable,
        inspectedAt: new Date(),
        inspectedBy: adminId
    };

    if (decision === 'approve') {
        await orchestrateRefund(order, [item._id.toString()], refundService.REFUND_TYPES.PARTIAL_RETURN, 'Return Approved', session);

        if (restockable && !item.inventoryReconciled) {
            await restoreStock(item, session);
            item.inventoryReconciled   = true;
            item.inventoryReconciledAt = new Date();
            auditLog(order, 'INVENTORY_RESTORED', adminId, 'Admin', prevStatus, 'Returned',
                'Stock restored upon return approval', { restockable });
        }

        item.itemStatus = 'Returned';
        auditLog(order, 'ADMIN_APPROVED_RETURN', adminId, 'Admin', prevStatus, 'Returned',
            notes || 'Return approved', { restockable });

    } else if (decision === 'reject') {
        item.itemStatus = 'Delivered'; // Revert to delivered
        auditLog(order, 'ADMIN_REJECTED_RETURN', adminId, 'Admin', prevStatus, 'Delivered',
            notes || 'Return rejected');
    } else {
        throw new Error('Invalid decision');
    }

    const allResolved = order.items.every(i => ['Returned', 'Cancelled'].includes(i.itemStatus));
    if (allResolved && order.orderStatus !== 'Cancelled') {
        order.orderStatus = 'Returned';
        if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
    }

    log.lifecycle(
        decision === 'approve' ? 'RETURN_APPROVED' : 'RETURN_REJECTED',
        order._id, prevStatus, item.itemStatus, { restockable, notes }
    );
    await order.save(sessionOpts(session));
    return { success: true, decision };
};

/**
 * Admin bulk status transition.
 *
 * @param {object} order
 * @param {ObjectId} adminId  - Real admin ObjectId, NOT the string "admin"
 * @param {string} newStatus
 * @param {mongoose.ClientSession|null} session
 */
export const updateOrderStatus = async (order, adminId, newStatus, session = null) => {
    if (!isValidTransition(order.orderStatus, newStatus)) {
        throw new Error(`Invalid status transition from ${order.orderStatus} to ${newStatus}`);
    }

    const prevStatus = order.orderStatus;

    if (newStatus === 'Cancelled') {
        return await cancelOrder(order, adminId, 'admin', 'Admin updated status to Cancelled', session);
    }

    order.orderStatus = newStatus;
    for (const item of order.items) {
        if (!['Cancelled', 'Returned', 'Return Requested'].includes(item.itemStatus)) {
            item.itemStatus = newStatus;
        }
    }

    auditLog(order, 'ADMIN_UPDATED_STATUS', adminId, 'Admin', prevStatus, newStatus,
        'Bulk status update via admin panel');
    await order.save(sessionOpts(session));
    return { success: true };
};

/**
 * System-generated lifecycle event (automated actions — no human actor).
 * Used by cron jobs, payment expiry, cleanup tasks.
 */
export const appendSystemEvent = (order, action, fromStatus, toStatus, reason = null, metadata = null) => {
    auditLog(order, action, null, 'System', fromStatus, toStatus, reason, metadata);
};
