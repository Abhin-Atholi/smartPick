import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PaymentRecoveryService
 * ─────────────────────────────────────────────────────────────────────────────
 * THE single authority for restoring an expired Razorpay order back to cart.
 *
 * Safety guarantees:
 *  - Idempotent: order.cartRestored flag prevents any duplicate restoration.
 *  - Stock-safe: quantities are capped to current live stock at restore time.
 *  - Merge-safe: existing cart items for the same variant are merged, not duped.
 *  - COD-safe: only Razorpay orders are ever restored.
 *  - Concurrent-safe: cron + JIT may both call this; only first call proceeds.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class PaymentRecoveryService {

    /**
     * Safely restores an expired Razorpay order's items back to the user's cart.
     * Guaranteed idempotent — safe to call from both JIT and background cron.
     *
     * @param {Object} order - Mongoose order document (must be populated with items.product if available)
     * @returns {Object} { success, message, summary }
     *   summary = { restoredItems, partialRestores, skippedItems, wasPartial }
     */
    async restoreExpiredOrderToCart(order) {
        const tag = `[PaymentRecovery | ${order.orderId}]`;

        try {
            // ── Guard 1: Idempotency ────────────────────────────────────────
            if (order.cartRestored) {
                console.log(`${tag} SKIPPED — already restored on ${order.cartRestoredAt}`);
                return {
                    success: true,
                    message: 'Cart already restored',
                    summary: order.cartRestorationSummary || { restoredItems: 0, partialRestores: 0, skippedItems: 0, wasPartial: false }
                };
            }

            // ── Guard 2: Only restore Expired Razorpay orders ──────────────
            if (order.paymentMethod !== 'Razorpay') {
                console.log(`${tag} SKIPPED — paymentMethod is ${order.paymentMethod}, not Razorpay.`);
                return { success: false, message: `Cart restoration skipped: paymentMethod=${order.paymentMethod}` };
            }

            if (order.paymentStatus !== 'Expired') {
                console.log(`${tag} SKIPPED — paymentStatus is ${order.paymentStatus}, not Expired.`);
                return { success: false, message: `Cannot restore non-expired order. paymentStatus=${order.paymentStatus}` };
            }

            if (order.orderStatus !== 'Expired') {
                console.log(`${tag} SKIPPED — orderStatus is ${order.orderStatus}, not Expired.`);
                return { success: false, message: `Cannot restore non-expired order. orderStatus=${order.orderStatus}` };
            }

            // ── Fetch or create cart ────────────────────────────────────────
            let cart = await Cart.findOne({ user: order.user });
            if (!cart) {
                cart = new Cart({ user: order.user, items: [] });
            }

            // ── Restoration counters ────────────────────────────────────────
            let restoredItems   = 0;
            let partialRestores = 0;
            let skippedItems    = 0;

            // ── Process each order item ────────────────────────────────────
            for (const orderItem of order.items) {

                // Skip non-active item statuses (cancelled/returned items)
                const skipStatuses = ['Cancelled', 'Returned', 'Return Pending', 'Return Rejected'];
                if (skipStatuses.includes(orderItem.itemStatus)) {
                    console.log(`${tag} VARIANT_SKIPPED — itemStatus=${orderItem.itemStatus} for product ${orderItem.product}`);
                    skippedItems++;
                    continue;
                }

                // Fetch FRESH product data (not the populated snapshot from the order)
                const productId = orderItem.product?._id || orderItem.product;
                const product = await Product.findById(productId).lean();

                if (!product || !product.isActive || product.isDeleted) {
                    console.log(`${tag} VARIANT_SKIPPED — product ${productId} inactive/deleted.`);
                    skippedItems++;
                    continue;
                }

                // Locate the variant and its CURRENT live stock
                const liveStockResult = this._getLiveStock(product, orderItem);

                if (!liveStockResult.found) {
                    console.log(`${tag} VARIANT_SKIPPED — variant ${orderItem.color}/${orderItem.size} not found in product.`);
                    skippedItems++;
                    continue;
                }

                const liveStock = liveStockResult.stock;

                if (liveStock <= 0) {
                    console.log(`${tag} VARIANT_SKIPPED — variant ${orderItem.color}/${orderItem.size} is out of stock.`);
                    skippedItems++;
                    continue;
                }

                // Cap quantity to live stock — NEVER exceed available inventory
                const requestedQty = orderItem.quantity;
                const restoredQty  = Math.min(requestedQty, liveStock);

                if (restoredQty < requestedQty) {
                    console.log(`${tag} PARTIAL_QTY_RESTORED — ordered=${requestedQty}, restored=${restoredQty} (stock=${liveStock}) for ${orderItem.color}/${orderItem.size}`);
                    partialRestores++;
                } else {
                    console.log(`${tag} CART_RESTORED — qty=${restoredQty} for ${orderItem.color}/${orderItem.size}`);
                }

                // Merge into cart (no duplicate rows)
                this._mergeCartItem(cart, {
                    product:   productId,
                    variantId: orderItem.variantId || null,
                    color:     orderItem.color,
                    size:      orderItem.size,
                    quantity:  restoredQty,
                    price:     orderItem.price,
                    totalPrice: orderItem.price * restoredQty
                });

                restoredItems++;
            }

            // ── Save cart ───────────────────────────────────────────────────
            await cart.save();

            // ── Build restoration summary ────────────────────────────────────
            const wasPartial = partialRestores > 0 || skippedItems > 0;
            const summary = { restoredItems, partialRestores, skippedItems, wasPartial };

            // ── Mark order as restored (idempotency lock) ────────────────────
            order.cartRestored       = true;
            order.cartRestoredAt     = new Date();
            order.cartRestorationSummary = summary;

            // ── Lifecycle audit entry ────────────────────────────────────────
            if (!order.lifecycleHistory) order.lifecycleHistory = [];
            order.lifecycleHistory.push({
                actorModel: 'System',
                action:     'SYSTEM_RESTORED_CART_AFTER_EXPIRY',
                fromStatus: 'Expired',
                toStatus:   'Expired',
                reason:     `PAYMENT_RECOVERY: restored=${restoredItems}, partial=${partialRestores}, skipped=${skippedItems}`,
                metadata:   summary,
                createdAt:  new Date()
            });

            await order.save();

            const msg = wasPartial
                ? `Partially restored ${restoredItems} item(s) (${partialRestores} with reduced qty, ${skippedItems} skipped).`
                : `Restored ${restoredItems} item(s) to cart.`;

            console.log(`${tag} COMPLETE — ${msg}`);
            return { success: true, message: msg, summary };

        } catch (error) {
            console.error(`[PaymentRecovery] Error restoring order ${order?.orderId}:`, error);
            return { success: false, message: 'Internal error during cart restoration', summary: null };
        }
    }

    /**
     * Merges an item into the cart.
     * If the exact variant (product + color + size) already exists, increments quantity.
     * Never creates a duplicate row.
     *
     * @private
     */
    _mergeCartItem(cart, item) {
        const normalize = str => String(str || '').trim().toLowerCase();
        const existingIdx = cart.items.findIndex(ci =>
            ci.product.toString() === item.product.toString() &&
            normalize(ci.color) === normalize(item.color) &&
            normalize(ci.size) === normalize(item.size)
        );

        if (existingIdx > -1) {
            // Merge — accumulate quantity and recalculate totalPrice
            const existing = cart.items[existingIdx];
            existing.quantity  += item.quantity;
            existing.totalPrice = existing.price * existing.quantity;
        } else {
            // New entry
            cart.items.push({
                product:    item.product,
                variantId:  item.variantId,
                color:      item.color,
                size:       item.size,
                quantity:   item.quantity,
                price:      item.price,
                totalPrice: item.totalPrice
            });
        }
    }

    /**
     * Finds the current live stock for an order item within a product's variants.
     * Uses variants array as the single source of truth for stock.
     *
     * @private
     * @returns {{ found: boolean, stock: number }}
     */
    _getLiveStock(product, orderItem) {
        if (!product.variants?.length) {
            return { found: false, stock: 0 };
        }

        let variant = null;

        // Primary lookup → variantId
        if (orderItem.variantId) {
            variant = product.variants.find(
                v => v._id.toString() === orderItem.variantId.toString()
            );
        }

        // Fallback lookup → color + size
        if (!variant) {
            const normalize = str =>
                String(str || '').trim().toLowerCase();

            variant = product.variants.find(v =>
                normalize(v.color) === normalize(orderItem.color) &&
                normalize(v.size) === normalize(orderItem.size)
            );
        }

        if (!variant) {
            return { found: false, stock: 0 };
        }

        return {
            found: true,
            stock: variant.stock ?? 0
        };
    }
}

export default new PaymentRecoveryService();
