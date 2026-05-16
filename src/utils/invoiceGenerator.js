/**
 * invoiceGenerator.js — SmartPick Hybrid Invoice
 *
 * Architecture:
 *  - Consumes ONLY the DTO from invoicePresentationService.buildInvoiceData()
 *  - Never reads raw order fields directly
 *  - Modular render functions for stable layout management
 *  - Automatic page-break safety for long orders
 */

import PDFDocument from 'pdfkit';
import { buildInvoiceData } from '../services/common/invoicePresentationService.js';

// ── Palette ──────────────────────────────────────────────────────────────────
const INDIGO   = '#4f46e5';
const INDIGO_L = '#e0e7ff';
const DARK     = '#111827';
const MID      = '#374151';
const LIGHT    = '#6b7280';
const BORDER   = '#e5e7eb';
const BG_ROW   = '#f9fafb';
const BG_DARK  = '#f3f4f6';
const GREEN    = '#16a34a';
const GREEN_L  = '#dcfce7';
const RED      = '#dc2626';
const RED_L    = '#fee2e2';
const AMBER    = '#d97706';
const AMBER_L  = '#fef3c7';
const WHITE    = '#ffffff';

// ── Layout Constants ─────────────────────────────────────────────────────────
const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const MARGIN  = 44;
const COL_W   = PAGE_W - MARGIN * 2;
const FOOTER_H = 60;   // reserved space at bottom of every page
const SAFE_BOTTOM = PAGE_H - MARGIN - FOOTER_H;

// ── State object (mutated during render) ─────────────────────────────────────
let doc, y, inv;

// ── Helpers ───────────────────────────────────────────────────────────────────
const mv = (delta) => { y += delta; };
const cx = (right = false) => right ? PAGE_W - MARGIN : MARGIN;
const halfW = () => COL_W / 2 - 8;

function ensureSpace(needed) {
    if (y + needed > SAFE_BOTTOM) {
        doc.addPage();
        y = MARGIN;
        renderMiniHeader();
    }
}

function hRule(color = BORDER, weight = 0.5) {
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y)
        .strokeColor(color).lineWidth(weight).stroke();
}

function roundRect(x, yy, w, h, r, fill) {
    doc.save().fillColor(fill)
        .roundedRect(x, yy, w, h, r).fill().restore();
}

function badge(text, x, yy, fill, textColor) {
    const tw = doc.fontSize(7).widthOfString(text) + 10;
    roundRect(x, yy, tw, 14, 3, fill);
    doc.fillColor(textColor).font('Helvetica-Bold').fontSize(7)
        .text(text, x, yy + 3.5, { width: tw, align: 'center' });
    return tw;
}

function sectionTitle(title) {
    ensureSpace(36);
    mv(14);
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(9)
        .text(title.toUpperCase(), MARGIN, y, { characterSpacing: 1.2 });
    mv(14);
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y)
        .strokeColor(INDIGO).lineWidth(1).stroke();
    mv(8);
}

function labelValue(label, value, labelX, valueX, width, bold = false, color = DARK) {
    doc.fillColor(LIGHT).font('Helvetica').fontSize(8)
        .text(label, labelX, y, { width });
    doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(value, valueX, y, { width, align: 'right' });
    mv(15);
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function renderMiniHeader() {
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(8)
        .text('SmartPick', MARGIN, y)
        .fillColor(LIGHT).font('Helvetica').fontSize(7)
        .text(`Invoice ${inv.orderMeta.invoiceId} — Continued`, MARGIN + 60, y);
    mv(16);
    hRule(INDIGO, 0.5);
    mv(10);
}

// ── SECTION 1: Header ────────────────────────────────────────────────────────
function renderHeader() {
    // Indigo background banner
    roundRect(0, 0, PAGE_W, 88, 0, INDIGO);

    // Logo circle
    roundRect(MARGIN, 22, 40, 40, 20, '#ffffff22');
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(22)
        .text('S', MARGIN, 32, { width: 40, align: 'center' });

    // Brand name
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(18)
        .text('SmartPick', MARGIN + 50, 28);
    doc.fillColor('#c7d2fe').font('Helvetica').fontSize(8.5)
        .text(inv.branding.tagline, MARGIN + 50, 49);

    // INVOICE title (right side)
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26)
        .text('INVOICE', 0, 20, { align: 'right', width: PAGE_W - MARGIN });
    doc.fillColor('#c7d2fe').font('Helvetica').fontSize(9)
        .text(`#${inv.orderMeta.invoiceId}`, 0, 50, { align: 'right', width: PAGE_W - MARGIN });
    doc.fillColor('#c7d2fe').font('Helvetica').fontSize(8)
        .text(`Downloaded: ${inv.orderMeta.downloadedAt}`, 0, 63, { align: 'right', width: PAGE_W - MARGIN });

    y = 100;

    // ── 4-box order meta strip ───────────────────────────────────────────────
    roundRect(MARGIN, y, COL_W, 50, 6, BG_ROW);
    const boxW = COL_W / 4;
    const metaBoxes = [
        { label: 'Order ID',       value: inv.orderMeta.orderId },
        { label: 'Order Date',     value: inv.orderMeta.orderDate },
        { label: 'Payment',        value: inv.orderMeta.paymentMethod },
        { label: 'Status',         value: inv.orderMeta.paymentStatus, colored: true }
    ];

    metaBoxes.forEach((box, i) => {
        const bx = MARGIN + i * boxW + 10;
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
            .text(box.label.toUpperCase(), bx, y + 8, { width: boxW - 20, characterSpacing: 0.5 });
        if (box.colored) {
            const sc = inv.payment.isPaid ? GREEN : AMBER;
            const sl = inv.payment.isPaid ? GREEN_L : AMBER_L;
            roundRect(bx, y + 22, boxW - 20, 18, 4, sl);
            doc.fillColor(sc).font('Helvetica-Bold').fontSize(8.5)
                .text(box.value, bx, y + 27, { width: boxW - 20, align: 'center' });
        } else {
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
                .text(box.value, bx, y + 24, { width: boxW - 20 });
        }
    });

    y += 64;
}

// ── SECTION 2: Addresses ──────────────────────────────────────────────────────
function renderAddresses() {
    sectionTitle('Billing & Delivery');

    const half = halfW();
    const rightX = MARGIN + half + 16;

    // Left: Customer
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
        .text('BILL TO', MARGIN, y, { characterSpacing: 0.8 });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
        .text(inv.customer.name, MARGIN, y + 13, { width: half });
    let ly = y + 28;
    if (inv.customer.email) {
        doc.fillColor(MID).font('Helvetica').fontSize(8.5)
            .text(inv.customer.email, MARGIN, ly, { width: half }); ly += 13;
    }
    if (inv.customer.phone) {
        doc.fillColor(MID).font('Helvetica').fontSize(8.5)
            .text(inv.customer.phone, MARGIN, ly, { width: half }); ly += 13;
    }
    inv.customer.address.forEach(line => {
        doc.fillColor(MID).font('Helvetica').fontSize(8.5)
            .text(line, MARGIN, ly, { width: half }); ly += 13;
    });

    // Right: Company
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
        .text('FROM', rightX, y, { width: half, characterSpacing: 0.8 });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
        .text(inv.company.name, rightX, y + 13, { width: half });
    let ry = y + 28;
    inv.company.address.forEach(line => {
        doc.fillColor(MID).font('Helvetica').fontSize(8.5)
            .text(line, rightX, ry, { width: half }); ry += 13;
    });
    doc.fillColor(MID).font('Helvetica').fontSize(8.5)
        .text(inv.company.email, rightX, ry, { width: half }); ry += 13;
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
        .text(`GSTIN: ${inv.company.gstin}`, rightX, ry, { width: half });

    y = Math.max(ly, ry) + 14;
    hRule();
}

// ── SECTION 3: Items Table ────────────────────────────────────────────────────
function renderItemsTable() {
    sectionTitle('Order Items');

    // Table columns
    const C = {
        product: MARGIN,
        variant: MARGIN + 170,
        qty:     MARGIN + 280,
        unit:    MARGIN + 315,
        coupon:  MARGIN + 365,
        gst:     MARGIN + 410,
        total:   MARGIN + 450,
    };
    const tableR = PAGE_W - MARGIN;

    // Header row
    ensureSpace(24);
    roundRect(MARGIN, y, COL_W, 22, 3, DARK);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5);
    doc.text('PRODUCT',  C.product + 4, y + 7, { width: 162 });
    doc.text('VARIANT',  C.variant + 4, y + 7, { width: 90 });
    doc.text('QTY',      C.qty,         y + 7, { width: 30, align: 'center' });
    doc.text('UNIT',     C.unit,        y + 7, { width: 45, align: 'right' });
    doc.text('COUPON',   C.coupon,      y + 7, { width: 40, align: 'right' });
    doc.text('GST',      C.gst,         y + 7, { width: 35, align: 'right' });
    doc.text('PAID',     C.total + 4,   y + 7, { width: tableR - C.total - 8, align: 'right' });
    mv(22);

    // Item rows
    inv.items.forEach((item, idx) => {
        const rowH = item.returnRejected ? 52 : 44;
        ensureSpace(rowH + 2);

        const isCancelled = item.itemStatus === 'Cancelled';
        const isReturned  = item.itemStatus === 'Returned' || item.itemStatus === 'Return Requested';
        const rowBg = idx % 2 === 0 ? WHITE : BG_ROW;

        roundRect(MARGIN, y, COL_W, rowH, 0, rowBg);

        // Dim stripe for inactive items
        if (item.isInactive) {
            roundRect(MARGIN, y, 3, rowH, 0, isCancelled ? RED : AMBER);
        }

        // Product name
        doc.fillColor(item.isInactive ? LIGHT : DARK)
            .font('Helvetica-Bold').fontSize(8.5)
            .text(item.productName, C.product + 8, y + 6, { width: 160, ellipsis: true });

        // Variant
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
            .text(`${item.size} / ${item.color}`, C.variant + 4, y + 8, { width: 90 });

        // Qty
        doc.fillColor(item.isInactive ? LIGHT : MID).font('Helvetica').fontSize(9)
            .text(String(item.quantity), C.qty, y + 8, { width: 30, align: 'center' });

        // Unit price
        doc.fillColor(item.isInactive ? LIGHT : MID).font('Helvetica').fontSize(8.5)
            .text(item.fmt.unitFinalPaid, C.unit, y + 8, { width: 45, align: 'right' });

        // Coupon allocated
        doc.fillColor(item.couponAllocated > 0 ? INDIGO : LIGHT).font('Helvetica').fontSize(8.5)
            .text(item.couponAllocated > 0 ? `-${item.fmt.couponAllocated}` : '—', C.coupon, y + 8, { width: 40, align: 'right' });

        // GST
        doc.fillColor(LIGHT).font('Helvetica').fontSize(8.5)
            .text(item.taxAmount > 0 ? item.fmt.taxAmount : '—', C.gst, y + 8, { width: 35, align: 'right' });

        // Final paid
        doc.fillColor(item.isInactive ? LIGHT : DARK).font('Helvetica-Bold').fontSize(9)
            .text(item.fmt.finalPaidAmount, C.total + 4, y + 8, { width: tableR - C.total - 8, align: 'right' });

        // Status badge + refund info on line 2
        let by = y + 22;
        if (isCancelled) {
            badge('CANCELLED', C.product + 8, by, RED_L, RED);
            if (item.refundProcessed) {
                doc.fillColor(GREEN).font('Helvetica').fontSize(7.5)
                    .text(`Refunded ${item.fmt.finalPaidAmount} to Wallet`, C.product + 68, by + 1);
            }
        } else if (isReturned) {
            const badgeTxt = item.itemStatus === 'Return Requested' ? 'RETURN PENDING' : 'RETURNED';
            badge(badgeTxt, C.product + 8, by, AMBER_L, AMBER);
            if (item.refundProcessed) {
                doc.fillColor(GREEN).font('Helvetica').fontSize(7.5)
                    .text(`Refunded ${item.fmt.finalPaidAmount} to Wallet`, C.product + 78 + (item.itemStatus === 'Return Requested' ? 20 : 0), by + 1);
            }
        } else if (item.returnRejected) {
            badge('RETURN REJECTED', C.product + 8, by, RED_L, RED);
            if (item.rejectionNotes) {
                doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
                    .text(`Note: ${item.rejectionNotes}`, C.product + 90, by + 1, { width: 160, ellipsis: true });
            }
            by += 14;
        }

        // Divider
        doc.moveTo(MARGIN, y + rowH).lineTo(tableR, y + rowH)
            .strokeColor(BORDER).lineWidth(0.4).stroke();

        mv(rowH);
    });

    mv(6);
}

// ── SECTION 4: Original Purchase Summary ──────────────────────────────────────
function renderOriginalSummary() {
    const s = inv.originalSummary;
    ensureSpace(120);
    sectionTitle('Original Purchase Summary');

    const lx = MARGIN + COL_W * 0.52;
    const vw = COL_W * 0.48;

    const row = (label, value, bold = false, color = DARK, indent = 0) => {
        ensureSpace(18);
        doc.fillColor(LIGHT).font('Helvetica').fontSize(8.5)
            .text(label, lx + indent, y, { width: vw - 60 });
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
            .text(value, lx, y, { width: vw, align: 'right' });
        mv(15);
    };

    row('Subtotal (before discounts)', s.subtotal);
    if (s.hasOfferDiscount) row('Offer Discount', `-${s.offerDiscount}`, false, RED, 8);
    if (s.hasCouponDiscount) row('Coupon Discount', `-${s.couponDiscount}`, false, INDIGO, 8);
    row('Taxable Amount', s.taxableAmount, false, MID);
    row(`GST (CGST 2.5% + SGST 2.5%)`, inv.gstBreakdown.totalGst);
    row('Shipping', s.shipping);

    mv(4);
    doc.moveTo(lx, y).lineTo(PAGE_W - MARGIN, y).strokeColor(BORDER).lineWidth(0.8).stroke();
    mv(10);

    // Grand total box
    ensureSpace(40);
    roundRect(lx, y, vw, 34, 5, INDIGO);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9.5)
        .text('TOTAL PAID', lx + 10, y + 9, { width: vw - 20 });
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(14)
        .text(s.totalPaid, lx + 10, y + 7, { width: vw - 12, align: 'right' });
    mv(50);
}

// ── SECTION 5: Refund Ledger ───────────────────────────────────────────────────
function renderRefundLedger() {
    const rl = inv.refundLedger;
    if (!rl.hasRefunds && !rl.hasPending) return;

    sectionTitle('Refund & Adjustment Ledger');

    const allEntries = [...rl.entries, ...rl.pendingEntries];

    allEntries.forEach((entry, idx) => {
        ensureSpace(52);
        const isProcessed = !!entry.refundDate;
        const bg = idx % 2 === 0 ? BG_ROW : WHITE;

        roundRect(MARGIN, y, COL_W, 46, 4, bg);
        roundRect(MARGIN, y, 3, 46, 0, isProcessed ? GREEN : AMBER);

        // Item info
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
            .text(entry.productName, MARGIN + 12, y + 7, { width: 200, ellipsis: true });
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
            .text(`${entry.variant} • Qty: ${entry.qty}`, MARGIN + 12, y + 20, { width: 200 });
        if (entry.returnReason) {
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
                .text(`Reason: ${entry.returnReason}`, MARGIN + 12, y + 32, { width: 200, ellipsis: true });
        }

        // Status + amount (right side)
        const statusLabel = entry.itemStatus === 'Cancelled' ? 'CANCELLED' : 'RETURNED';
        const statusColor = entry.itemStatus === 'Cancelled' ? RED : AMBER;
        badge(statusLabel, PAGE_W - MARGIN - 200, y + 7, entry.itemStatus === 'Cancelled' ? RED_L : AMBER_L, statusColor);

        if (isProcessed) {
            doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10)
                .text(entry.refundAmount, PAGE_W - MARGIN - 140, y + 7, { width: 130, align: 'right' });
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
                .text(`Refunded to Wallet`, PAGE_W - MARGIN - 140, y + 21, { width: 130, align: 'right' });
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
                .text(entry.refundDate + (entry.refundTxnId ? ` • Txn: ${entry.refundTxnId}` : ''), PAGE_W - MARGIN - 140, y + 33, { width: 130, align: 'right' });
        } else {
            doc.fillColor(AMBER).font('Helvetica-Bold').fontSize(9)
                .text(entry.refundAmount, PAGE_W - MARGIN - 140, y + 9, { width: 130, align: 'right' });
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
                .text('Refund Processing...', PAGE_W - MARGIN - 140, y + 22, { width: 130, align: 'right' });
        }

        mv(50);
    });

    // Total refunded
    if (rl.hasRefunds) {
        ensureSpace(30);
        mv(4);
        doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
            .text('Total Refunded to Wallet', MARGIN, y, { width: COL_W - 100 })
            .text(rl.totalRefunded, MARGIN, y, { width: COL_W, align: 'right' });
        mv(20);
    }
}

// ── SECTION 6: GST Breakdown ──────────────────────────────────────────────────
function renderGSTBreakdown() {
    const g = inv.gstBreakdown;
    ensureSpace(80);
    sectionTitle('GST Breakdown');

    const lx = MARGIN;
    const colGap = COL_W / 4;

    roundRect(MARGIN, y, COL_W, 36, 4, BG_ROW);
    const heads = ['Taxable Amount', 'CGST (2.5%)', 'SGST (2.5%)', 'Total GST'];
    const vals  = [g.taxableBase, g.cgst, g.sgst, g.totalGst];
    heads.forEach((h, i) => {
        const bx = lx + i * colGap + 8;
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
            .text(h, bx, y + 6, { width: colGap - 16, characterSpacing: 0.3 });
        doc.fillColor(i === 3 ? DARK : MID).font('Helvetica-Bold').fontSize(9)
            .text(vals[i], bx, y + 18, { width: colGap - 16 });
    });
    mv(50);
}

// ── SECTION 7: Active Financial State ────────────────────────────────────────
function renderActiveSummary() {
    const a = inv.activeSummary;
    if (!a.show) return;

    ensureSpace(90);
    sectionTitle('Current Financial State');

    const lx = MARGIN + COL_W * 0.52;
    const vw = COL_W * 0.48;

    const stateRow = (label, value, color = DARK) => {
        ensureSpace(20);
        doc.fillColor(LIGHT).font('Helvetica').fontSize(8.5).text(label, lx, y, { width: vw - 60 });
        doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(value, lx, y, { width: vw, align: 'right' });
        mv(16);
    };

    stateRow('Originally Paid', a.originalPaid);
    stateRow('Total Refunded', `-${a.totalRefunded}`, RED);
    mv(4);
    doc.moveTo(lx, y).lineTo(PAGE_W - MARGIN, y).strokeColor(BORDER).lineWidth(0.8).stroke();
    mv(10);

    ensureSpace(36);
    roundRect(lx, y, vw, 32, 5, INDIGO_L);
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(9)
        .text('NET RETAINED', lx + 10, y + 9, { width: vw - 20 });
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(13)
        .text(a.netRetained, lx + 10, y + 7, { width: vw - 12, align: 'right' });
    mv(46);
}

// ── SECTION 8: Footer ─────────────────────────────────────────────────────────
function renderFooter() {
    const footerY = PAGE_H - MARGIN - 44;

    // Separator line
    doc.moveTo(MARGIN, footerY - 8).lineTo(PAGE_W - MARGIN, footerY - 8)
        .strokeColor(BORDER).lineWidth(0.5).stroke();

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text('Thank you for shopping with SmartPick!', MARGIN, footerY);
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
        .text('For queries: support@smartpick.com  •  Returns within 7 days of delivery  •  This is a computer-generated invoice.',
            MARGIN, footerY + 13, { width: COL_W * 0.72 });

    // Page number (right side)
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
        doc.switchToPage(range.start + i);
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
            .text(`Page ${i + 1} of ${total}`, MARGIN, footerY + 20, { width: COL_W, align: 'right' });
    }

    // Indigo bar on LAST page
    doc.switchToPage(range.start + total - 1);
    const barY = PAGE_H - MARGIN - 18;
    roundRect(0, barY, PAGE_W, 18, 0, INDIGO);
    doc.fillColor(WHITE).font('Helvetica').fontSize(7)
        .text(`SmartPick Inc.  •  ${inv.company.email}  •  ${inv.company.phone}  •  ${inv.company.website}`,
            0, barY + 5, { align: 'center', width: PAGE_W });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate and stream a hybrid PDF invoice to Express `res`.
 *
 * @param {object} order       - Populated Mongoose Order document
 * @param {object} res         - Express response
 * @param {string} disposition - 'inline' | 'attachment'
 */
export const generateInvoice = (order, res, disposition = 'inline') => {
    inv = buildInvoiceData(order);
    const filename = `invoice-${inv.orderMeta.invoiceId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

    doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, autoFirstPage: true });
    doc.pipe(res);
    y = MARGIN;

    renderHeader();
    renderAddresses();
    renderItemsTable();
    renderOriginalSummary();
    renderRefundLedger();
    renderGSTBreakdown();
    renderActiveSummary();
    renderFooter();

    doc.end();
};
