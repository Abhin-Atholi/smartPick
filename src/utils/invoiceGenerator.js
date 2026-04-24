import PDFDocument from 'pdfkit';

// ── colour palette ──────────────────────────────────────────────────────────
const INDIGO  = '#4f46e5';
const DARK    = '#111827';
const MID     = '#374151';
const LIGHT   = '#6b7280';
const BORDER  = '#e5e7eb';
const BG_ROW  = '#f9fafb';
const GREEN   = '#16a34a';
const RED_TXT = '#dc2626';
const WHITE   = '#ffffff';

// ── layout constants ────────────────────────────────────────────────────────
const PAGE_W  = 595.28;           // A4 width  (pt)
const MARGIN  = 48;
const COL_W   = PAGE_W - MARGIN * 2;

// ── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `Rs.${Number(n || 0).toFixed(2)}`;
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
    const dt = new Date(d);
    return `${pad(dt.getDate())} ${dt.toLocaleString('en', { month: 'short' })} ${dt.getFullYear()}`;
};

/**
 * Draw a filled rounded rectangle (PDFKit doesn't have roundedRect natively,
 * so we use moveTo / bezierCurveTo).
 */
function roundedRect(doc, x, y, w, h, r, fillColor) {
    doc.save()
        .fillColor(fillColor)
        .moveTo(x + r, y)
        .lineTo(x + w - r, y)
        .bezierCurveTo(x + w, y, x + w, y, x + w, y + r)
        .lineTo(x + w, y + h - r)
        .bezierCurveTo(x + w, y + h, x + w, y + h, x + w - r, y + h)
        .lineTo(x + r, y + h)
        .bezierCurveTo(x, y + h, x, y + h, x, y + h - r)
        .lineTo(x, y + r)
        .bezierCurveTo(x, y, x, y, x + r, y)
        .fill()
        .restore();
}

/**
 * Main generator — pipes a pdfkit Document to `res`.
 * @param {object} order  - populated Mongoose Order doc
 * @param {object} res    - Express response object
 * @param {string} disposition - 'inline' | 'attachment'
 */
export const generateInvoice = (order, res, disposition = 'inline') => {
    const invoiceId = order.orderId || `INV-${order._id.toString().slice(-6).toUpperCase()}`;
    const filename  = `invoice-${invoiceId}.pdf`;

    // ── HTTP headers ─────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

    // ── create doc ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    doc.pipe(res);

    let y = MARGIN;

    // ════════════════════════════════════════════════════════════════════════
    // HEADER BAND
    // ════════════════════════════════════════════════════════════════════════

    // Left: logo circle + brand name
    roundedRect(doc, MARGIN, y, 36, 36, 18, INDIGO);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(18)
        .text('S', MARGIN, y + 9, { width: 36, align: 'center' });

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16)
        .text('SmartPick', MARGIN + 44, y + 4);
    doc.fillColor(LIGHT).font('Helvetica').fontSize(9)
        .text('Premium Fashion', MARGIN + 44, y + 22);

    // Right: INVOICE label
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(28)
        .text('INVOICE', 0, y, { align: 'right' });
    doc.fillColor(LIGHT).font('Helvetica').fontSize(10)
        .text(`#${invoiceId}`, 0, y + 34, { align: 'right' })
        .text(fmtDate(order.createdAt), 0, y + 48, { align: 'right' });

    y += 72;

    // Thin indigo rule
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(INDIGO).lineWidth(2).stroke();
    y += 14;

    // ════════════════════════════════════════════════════════════════════════
    // BILL TO  /  FROM  (two-column)
    // ════════════════════════════════════════════════════════════════════════
    const addr = order.shippingAddress;
    const halfW = COL_W / 2 - 10;

    doc.fillColor(LIGHT).font('Helvetica').fontSize(8)
        .text('BILL TO', MARGIN, y)
        .text('FROM', MARGIN + halfW + 20, y, { width: halfW, align: 'right' });

    y += 14;

    // Left column — customer
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
        .text(addr.fullName || '—', MARGIN, y, { width: halfW });
    doc.fillColor(MID).font('Helvetica').fontSize(9);
    const addrLines = [
        addr.addressLine1,
        addr.addressLine2,
        [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
        addr.country,
        addr.phone
    ].filter(Boolean);
    addrLines.forEach(line => {
        doc.text(line, MARGIN, (y += 13), { width: halfW });
    });

    // Right column — company
    const companyTop = y - addrLines.length * 13;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
        .text('SmartPick Inc.', MARGIN, companyTop, { width: COL_W, align: 'right' });
    doc.fillColor(MID).font('Helvetica').fontSize(9);
    [
        '88 Design Avenue, Suite 400',
        'Mumbai, MH 400001',
        'India',
        'support@smartpick.com',
        '+91 98765 43210'
    ].forEach((line, i) => {
        doc.text(line, MARGIN, companyTop + 13 + i * 13, { width: COL_W, align: 'right' });
    });

    y += 28;

    // ════════════════════════════════════════════════════════════════════════
    // ORDER META BAND  (4 info boxes)
    // ════════════════════════════════════════════════════════════════════════
    y += 10;
    const boxW = COL_W / 4;

    const metaBoxes = [
        { label: 'ORDER ID',        value: `#${invoiceId}` },
        { label: 'ORDER DATE',      value: fmtDate(order.createdAt) },
        { label: 'PAYMENT METHOD',  value: order.paymentMethod },
        { label: 'STATUS',          value: order.paymentStatus,  colored: true }
    ];

    // Light background for the band
    doc.rect(MARGIN, y, COL_W, 48).fillColor(BG_ROW).fill();

    metaBoxes.forEach((box, i) => {
        const bx = MARGIN + i * boxW + 10;
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
            .text(box.label, bx, y + 8, { width: boxW - 20 });

        if (box.colored) {
            const statusColor = order.paymentStatus === 'Paid' ? GREEN : LIGHT;
            roundedRect(doc, bx, y + 20, 44, 16, 8, statusColor + '22');
            doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8)
                .text(box.value, bx, y + 24, { width: 44, align: 'center' });
        } else {
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
                .text(box.value, bx, y + 21, { width: boxW - 20 });
        }
    });

    y += 62;

    // ════════════════════════════════════════════════════════════════════════
    // ORDER SUMMARY heading
    // ════════════════════════════════════════════════════════════════════════
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
        .text('Order Summary', MARGIN, y);
    y += 22;

    // ── Table header ─────────────────────────────────────────────────────────
    const colX = {
        item:  MARGIN,
        cat:   MARGIN + 190,
        qty:   MARGIN + 310,
        price: MARGIN + 370,
        total: MARGIN + 430
    };
    const tableRight = PAGE_W - MARGIN;

    // Header row fill
    doc.rect(MARGIN, y, COL_W, 22).fillColor(DARK).fill();
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8);
    doc.text('ITEM',     colX.item  + 4, y + 7, { width: 180 });
    doc.text('CATEGORY', colX.cat   + 4, y + 7, { width: 90  });
    doc.text('QTY',      colX.qty   + 4, y + 7, { width: 50, align: 'center' });
    doc.text('PRICE',    colX.price + 4, y + 7, { width: 55, align: 'right'  });
    doc.text('TOTAL',    colX.total + 4, y + 7, { width: tableRight - colX.total - 4, align: 'right' });
    y += 22;

    // ── Table rows ───────────────────────────────────────────────────────────
    order.items.forEach((item, idx) => {
        const rowH = 36;
        const bg   = idx % 2 === 0 ? WHITE : BG_ROW;
        doc.rect(MARGIN, y, COL_W, rowH).fillColor(bg).fill();

        // Vertical dividers
        [colX.cat, colX.qty, colX.price, colX.total].forEach(cx => {
            doc.moveTo(cx, y).lineTo(cx, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
        });

        const name     = item.product?.name || 'Product';
        const variant  = `Size: ${item.size} • Color: ${item.color}`;
        const category = item.product?.category?.name || '—';

        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
            .text(name, colX.item + 4, y + 6, { width: 182, ellipsis: true });
        doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
            .text(variant, colX.item + 4, y + 19, { width: 182 });

        doc.fillColor(MID).font('Helvetica').fontSize(8.5)
            .text(category, colX.cat + 4, y + 13, { width: 90 });

        doc.fillColor(DARK).font('Helvetica').fontSize(9)
            .text(String(item.quantity), colX.qty + 4, y + 13, { width: 50, align: 'center' })
            .text(fmt(item.price),       colX.price + 4, y + 13, { width: 55, align: 'right'  })
            .text(fmt(item.totalPrice),  colX.total + 4, y + 13, { width: tableRight - colX.total - 8, align: 'right' });

        y += rowH;
    });

    // Bottom border of table
    doc.moveTo(MARGIN, y).lineTo(tableRight, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 20;

    // ════════════════════════════════════════════════════════════════════════
    // TOTALS BLOCK (right-aligned)
    // ════════════════════════════════════════════════════════════════════════
    const totalsLabelX = MARGIN + COL_W * 0.55;
    const totalsValueX = MARGIN + COL_W * 0.55;
    const totalsW      = COL_W * 0.45;

    const drawTotalRow = (label, value, bold = false, color = DARK) => {
        doc.fillColor(bold ? DARK : MID)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(bold ? 10 : 9)
            .text(label, totalsLabelX, y, { width: totalsW - 60 })
            .fillColor(color)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .text(value, totalsValueX, y, { width: totalsW, align: 'right' });
        y += bold ? 16 : 14;
    };

    drawTotalRow('Subtotal',                    fmt(order.subtotal));
    drawTotalRow('Shipping',                    order.shippingFee === 0 ? 'Free' : fmt(order.shippingFee));
    drawTotalRow('Tax (Estimated)',              fmt(order.tax || 0));
    if (order.discount > 0) {
        drawTotalRow('Discount', `-${fmt(order.discount)}`, false, RED_TXT);
    }

    y += 4;
    // Grand total divider
    doc.moveTo(totalsLabelX, y).lineTo(tableRight, y).strokeColor(BORDER).lineWidth(0.8).stroke();
    y += 10;

    // Grand total row with indigo background
    roundedRect(doc, totalsLabelX, y, totalsW, 32, 6, INDIGO);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(10)
        .text('TOTAL AMOUNT', totalsLabelX + 10, y + 10, { width: totalsW - 20 });
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(14)
        .text(fmt(order.totalAmount), totalsLabelX + 10, y + 8, { width: totalsW - 12, align: 'right' });

    y += 50;

    // ════════════════════════════════════════════════════════════════════════
    // FOOTER
    // ════════════════════════════════════════════════════════════════════════

    // Indigo bottom stripe
    const stripeY = doc.page.height - MARGIN - 24;
    doc.rect(MARGIN, stripeY - 30, COL_W, 1).fillColor(BORDER).fill();

    // Notes (left)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text('Notes:', MARGIN, stripeY - 26);
    doc.fillColor(LIGHT).font('Helvetica').fontSize(7.5)
        .text('Thank you for shopping with SmartPick. For any queries, contact support@smartpick.com', MARGIN, stripeY - 14, { width: COL_W / 2 });

    // Authorised signatory (right)
    doc.fillColor(LIGHT).font('Helvetica').fontSize(8)
        .text('Authorised Signatory', MARGIN, stripeY - 16, { width: COL_W, align: 'right' });

    // Full-width indigo footer bar
    doc.rect(0, stripeY + 4, PAGE_W, 20).fillColor(INDIGO).fill();
    doc.fillColor(WHITE).font('Helvetica').fontSize(7)
        .text('SmartPick Inc. • support@smartpick.com • +91 98765 43210', 0, stripeY + 9, { align: 'center', width: PAGE_W });

    doc.end();
};
