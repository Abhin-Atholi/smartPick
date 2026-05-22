/**
 * report.controller.js
 *
 * All financial data sourced exclusively from financialAnalytics.service.js.
 * Exports: PDF Ledger Report + Multi-sheet Excel Workbook.
 */

import * as fas from '../../services/admin/financialAnalytics.service.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtRs = n => `Rs. ${Number(n || 0).toFixed(2)}`;
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
const pad2 = n => String(n).padStart(2, '0');
const fmtDatetime = d => {
    const dt = new Date(d);
    return `${fmtDate(d)}, ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

// ── Page render ───────────────────────────────────────────────────────────────
export const getSalesReportsPage = async (req, res) => {
    try {
        res.render('admin/salesReports', { title: 'Sales Reports — SmartPick', activePath: '/admin/sales-reports' });
    } catch (error) {
        console.error('Error rendering sales reports:', error);
        res.status(500).send('Internal Server Error');
    }
};

// ── API: Report data (table) ──────────────────────────────────────────────────
export const getSalesReportData = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;
        const page = parseInt(req.query.page) || 1;
        const [kpis, ledger] = await Promise.all([
            fas.getFinancialKPIs(filter, customFrom, customTo),
            fas.getOrderLedger(filter, customFrom, customTo, page, 10)
        ]);
        res.json({ success: true, data: { kpis, ledger } });
    } catch (error) {
        console.error('Report data error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch data' });
    }
};

// ── Excel Export: Multi-sheet Financial Workbook ──────────────────────────────
export const exportExcelReport = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;

        const [kpis, ledger, items, topProducts, taxes, coupons] = await Promise.all([
            fas.getFinancialKPIs(filter, customFrom, customTo),
            fas.getOrderLedger(filter, customFrom, customTo, 1, 5000),
            fas.getItemLedger(filter, customFrom, customTo),
            fas.getTopProducts(filter, customFrom, customTo, 20),
            fas.getTaxAnalytics(filter, customFrom, customTo),
            fas.getCouponAnalytics(filter, customFrom, customTo)
        ]);

        const wb = new ExcelJS.Workbook();
        wb.creator = 'SmartPick Analytics';
        wb.created = new Date();

        // ── Styles ─────────────────────────────────────────────────────────
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
        const subFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        const boldFont   = { bold: true, size: 10 };
        const numFmt     = '#,##0.00';

        const applyHeader = (row, fill = headerFill, font = headerFont) => {
            row.eachCell(c => { c.fill = fill; c.font = font; c.alignment = { vertical: 'middle' }; });
            row.height = 22;
        };

        // ── SHEET 1: Summary ───────────────────────────────────────────────
        const s1 = wb.addWorksheet('Summary');
        s1.columns = [{ width: 32 }, { width: 22 }];
        const h1 = s1.addRow(['SmartPick — Financial Summary', `Generated: ${fmtDatetime(new Date())}`]);
        h1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
        s1.addRow([`Period: ${filter}`, `${fmtDate(kpis.period.startDate)} – ${fmtDate(kpis.period.endDate)}`]);
        s1.addRow([]);

        const summaryRows = [
            ['REVENUE',                ''],
            ['Gross Revenue',          kpis.revenue.gross],
            ['Net Revenue (Retained)', kpis.revenue.net],
            ['Total Refunded',         kpis.revenue.totalRefunded],
            ['Tax Collected',          kpis.revenue.tax],
            ['Coupon Loss',            kpis.revenue.couponLoss],
            ['Offer Loss',             kpis.revenue.offerLoss],
            [''],
            ['ORDERS',                 ''],
            ['Total Orders',           kpis.orders.total],
            ['Delivered',              kpis.orders.delivered],
            ['Returned',               kpis.orders.returned],
            ['Cancelled',              kpis.orders.cancelled],
            ['Avg Order Value',        kpis.orders.avgOrderValue],
            ['Return Rate',            `${kpis.orders.returnRate}%`],
            ['Cancellation Rate',      `${kpis.orders.cancellationRate}%`],
            [''],
            ['LIABILITIES',            ''],
            ['Pending Return Items',   kpis.liability.pendingReturnItems],
            ['Pending Refund Amount',  kpis.liability.pendingRefundAmount],
        ];

        summaryRows.forEach((r, i) => {
            const row = s1.addRow(r);
            if (r[0] && typeof r[1] === 'number') {
                row.getCell(2).numFmt = numFmt;
            }
            if (r[1] === '' && r[0]) {  // Section header
                row.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF4F46E5' } };
                row.fill = subFill;
            }
        });

        // ── SHEET 2: Orders ────────────────────────────────────────────────
        const s2 = wb.addWorksheet('Orders');
        s2.columns = [
            { header: 'Order ID',      key: 'orderId',        width: 18 },
            { header: 'Date',          key: 'date',           width: 18 },
            { header: 'Customer',      key: 'customer',       width: 24 },
            { header: 'Status',        key: 'orderStatus',    width: 20 },
            { header: 'Payment',       key: 'paymentMethod',  width: 14 },
            { header: 'Gross (Rs.)',   key: 'grossAmount',    width: 16 },
            { header: 'Refunded (Rs.)',key: 'refundedAmount', width: 16 },
            { header: 'Net (Rs.)',     key: 'netRetained',    width: 16 },
            { header: 'Coupon (Rs.)',  key: 'couponDiscount', width: 16 },
            { header: 'Offer (Rs.)',   key: 'offerDiscount',  width: 16 },
            { header: 'Tax (Rs.)',     key: 'tax',            width: 14 },
        ];
        applyHeader(s2.getRow(1));
        ledger.rows.forEach((r, i) => {
            const row = s2.addRow({ ...r, date: fmtDate(r.date) });
            ['grossAmount','refundedAmount','netRetained','couponDiscount','offerDiscount','tax']
                .forEach(k => { row.getCell(s2.getColumn(k).number).numFmt = numFmt; });
            if (i % 2 === 1) row.fill = subFill;
        });

        // ── SHEET 3: Items ─────────────────────────────────────────────────
        const s3 = wb.addWorksheet('Items');
        s3.columns = [
            { header: 'Order ID',       key: 'orderId',      width: 18 },
            { header: 'Date',           key: 'date',         width: 16 },
            { header: 'Product',        key: 'product',      width: 28 },
            { header: 'Size',           key: 'size',         width: 10 },
            { header: 'Color',          key: 'color',        width: 14 },
            { header: 'Qty',            key: 'qty',          width:  8 },
            { header: 'Status',         key: 'itemStatus',   width: 18 },
            { header: 'Final Paid',     key: 'finalPaid',    width: 16 },
            { header: 'Refunded',       key: 'refunded',     width: 16 },
            { header: 'Coupon Share',   key: 'couponShare',  width: 16 },
            { header: 'Offer Discount', key: 'offerDiscount',width: 16 },
            { header: 'Tax',            key: 'tax',          width: 14 },
        ];
        applyHeader(s3.getRow(1));
        items.forEach((r, i) => {
            const row = s3.addRow({ ...r, date: fmtDate(r.date) });
            ['finalPaid','refunded','couponShare','offerDiscount','tax']
                .forEach(k => { row.getCell(s3.getColumn(k).number).numFmt = numFmt; });
            if (r.isRefunded) {
                row.getCell(s3.getColumn('itemStatus').number).font = { color: { argb: 'FFDC2626' }, bold: true };
            }
            if (i % 2 === 1) row.fill = subFill;
        });

        // ── SHEET 4: Top Products ──────────────────────────────────────────
        const s4 = wb.addWorksheet('Top Products');
        s4.columns = [
            { header: 'Product',     key: 'name',          width: 36 },
            { header: 'Units Sold',  key: 'totalQuantity', width: 16 },
            { header: 'Revenue (Rs.)',key: 'totalRevenue',  width: 18 }
        ];
        applyHeader(s4.getRow(1));
        topProducts.forEach((p, i) => {
            const row = s4.addRow(p);
            row.getCell(3).numFmt = numFmt;
            if (i % 2 === 1) row.fill = subFill;
        });

        // ── SHEET 5: Taxes ─────────────────────────────────────────────────
        const s5 = wb.addWorksheet('Taxes');
        s5.columns = [{ width: 28 }, { width: 20 }];
        applyHeader(s5.addRow(['Tax Component', 'Amount (Rs.)']));
        [
            ['Tax Collected (Active Items)', taxes.taxCollected],
            ['Tax Refunded (Cancelled/Returned)', taxes.taxRefunded],
            ['Net Tax Retained', taxes.netTaxRetained],
            ['CGST (2.5%)', taxes.cgst],
            ['SGST (2.5%)', taxes.sgst],
        ].forEach(([label, val], i) => {
            const row = s5.addRow([label, val]);
            row.getCell(2).numFmt = numFmt;
            if (i % 2 === 1) row.fill = subFill;
        });

        // ── SHEET 6: Coupons ───────────────────────────────────────────────
        const s6 = wb.addWorksheet('Coupons');
        s6.columns = [
            { header: 'Coupon Code',      key: 'code',          width: 20 },
            { header: 'Usage Count',      key: 'usageCount',    width: 16 },
            { header: 'Total Discount',   key: 'totalDiscount', width: 18 },
            { header: 'Avg Discount',     key: 'avgDiscount',   width: 18 },
            { header: 'Revenue (Net)',     key: 'totalRevenue',  width: 18 },
        ];
        applyHeader(s6.getRow(1));
        coupons.forEach((c, i) => {
            const row = s6.addRow(c);
            ['totalDiscount','avgDiscount','totalRevenue'].forEach(k => {
                row.getCell(s6.getColumn(k).number).numFmt = numFmt;
            });
            if (i % 2 === 1) row.fill = subFill;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="smartpick-report-${filter.toLowerCase()}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).send('Export failed');
    }
};

// ── PDF Export: Financial Ledger Report ───────────────────────────────────────
export const exportPdfReport = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;

        const [kpis, ledger] = await Promise.all([
            fas.getFinancialKPIs(filter, customFrom, customTo),
            fas.getOrderLedger(filter, customFrom, customTo, 1, 200)
        ]);

        // ── PDF Setup ──────────────────────────────────────────────────────
        const MARGIN = 44, PAGE_W = 595.28, PAGE_H = 841.89;
        const COL_W = PAGE_W - MARGIN * 2;
        const INDIGO = '#4f46e5', DARK = '#111827', MID = '#374151';
        const LIGHT = '#6b7280', BORDER = '#e5e7eb', BG = '#f9fafb';
        const GREEN = '#16a34a', RED = '#dc2626', WHITE = '#ffffff';

        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
        const filename = `smartpick-report-${filter.toLowerCase()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        let y = MARGIN;
        const tableR = PAGE_W - MARGIN;
        const safeBottom = PAGE_H - MARGIN - 50;

        const hRule = (color = BORDER, w = 0.5) => {
            doc.moveTo(MARGIN, y).lineTo(tableR, y).strokeColor(color).lineWidth(w).stroke();
        };

        const ensureSpace = (n) => {
            if (y + n > safeBottom) { doc.addPage(); y = MARGIN; }
        };

        // ── HEADER ─────────────────────────────────────────────────────────
        doc.rect(0, 0, PAGE_W, 70).fillColor(INDIGO).fill();
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(20)
            .text('SmartPick — Financial Report', MARGIN, 18);
        doc.fillColor('#c7d2fe').font('Helvetica').fontSize(9)
            .text(`${filter} Period: ${fmtDate(kpis.period.startDate)} – ${fmtDate(kpis.period.endDate)}  •  Generated: ${fmtDatetime(new Date())}`, MARGIN, 44);
        y = 88;

        // ── SECTION 1: BUSINESS SUMMARY ────────────────────────────────────
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('Business Summary', MARGIN, y);
        y += 16; hRule(INDIGO, 1); y += 10;

        doc.rect(MARGIN, y, COL_W, 52).fillColor(BG).fill();
        const boxW = COL_W / 4;
        const summaryBoxes = [
            { label: 'Gross Revenue', value: fmtRs(kpis.revenue.gross),      color: DARK  },
            { label: 'Net Revenue',   value: fmtRs(kpis.revenue.net),        color: INDIGO },
            { label: 'Refunded',      value: fmtRs(kpis.revenue.totalRefunded), color: RED  },
            { label: 'Total Orders',  value: String(kpis.orders.total),      color: DARK  },
        ];
        summaryBoxes.forEach((b, i) => {
            const bx = MARGIN + i * boxW + 10;
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7).text(b.label.toUpperCase(), bx, y + 8, { characterSpacing: 0.4, width: boxW - 20 });
            doc.fillColor(b.color).font('Helvetica-Bold').fontSize(11).text(b.value, bx, y + 22, { width: boxW - 20 });
        });
        y += 66;

        // Second summary row
        doc.rect(MARGIN, y, COL_W, 42).fillColor('#eef2ff').fill();
        const row2 = [
            { label: 'Tax Collected',   value: fmtRs(kpis.revenue.tax)           },
            { label: 'Coupon Loss',     value: fmtRs(kpis.revenue.couponLoss)     },
            { label: 'Offer Loss',      value: fmtRs(kpis.revenue.offerLoss)      },
            { label: 'Return Rate',     value: `${kpis.orders.returnRate}%`       },
            { label: 'Cancel Rate',     value: `${kpis.orders.cancellationRate}%` },
        ];
        const r2W = COL_W / 5;
        row2.forEach((b, i) => {
            const bx = MARGIN + i * r2W + 8;
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7).text(b.label.toUpperCase(), bx, y + 6, { width: r2W - 16 });
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(b.value, bx, y + 18, { width: r2W - 16 });
        });
        y += 56;

        // ── SECTION 2: ORDER LEDGER ────────────────────────────────────────
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text('Order Ledger', MARGIN, y);
        y += 16; hRule(INDIGO, 1); y += 8;

        // Table header
        const C = { id: MARGIN, date: MARGIN + 78, cust: MARGIN + 140, status: MARGIN + 230, gross: MARGIN + 320, ref: MARGIN + 375, net: MARGIN + 430 };
        doc.rect(MARGIN, y, COL_W, 20).fillColor(DARK).fill();
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5);
        doc.text('ORDER ID', C.id + 2, y + 6, { width: 74 });
        doc.text('DATE',     C.date,   y + 6, { width: 58 });
        doc.text('CUSTOMER', C.cust,   y + 6, { width: 88 });
        doc.text('STATUS',   C.status, y + 6, { width: 88 });
        doc.text('GROSS',    C.gross,  y + 6, { width: 54, align: 'right' });
        doc.text('REFUND',   C.ref,    y + 6, { width: 54, align: 'right' });
        doc.text('NET',      C.net,    y + 6, { width: tableR - C.net - 2, align: 'right' });
        y += 20;

        ledger.rows.forEach((order, idx) => {
            ensureSpace(22);
            const rowH = 20;
            const bg = idx % 2 === 0 ? WHITE : BG;
            doc.rect(MARGIN, y, COL_W, rowH).fillColor(bg).fill();
            doc.fillColor(DARK).font('Helvetica').fontSize(8);
            doc.text(`#${order.orderId}`,          C.id + 2, y + 6, { width: 74, ellipsis: true });
            doc.text(fmtDate(order.date),           C.date,   y + 6, { width: 58 });
            doc.fillColor(MID);
            doc.text(order.customer,                C.cust,   y + 6, { width: 88, ellipsis: true });
            doc.text(order.orderStatus,             C.status, y + 6, { width: 88, ellipsis: true });
            doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8);
            doc.text(fmtRs(order.grossAmount),      C.gross,  y + 6, { width: 54, align: 'right' });
            doc.fillColor(order.refundedAmount > 0 ? RED : LIGHT);
            doc.text(order.refundedAmount > 0 ? fmtRs(order.refundedAmount) : '—', C.ref, y + 6, { width: 54, align: 'right' });
            doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(8.5);
            doc.text(fmtRs(order.netRetained),      C.net,    y + 6, { width: tableR - C.net - 4, align: 'right' });
            doc.moveTo(MARGIN, y + rowH).lineTo(tableR, y + rowH).strokeColor(BORDER).lineWidth(0.3).stroke();
            y += rowH;
        });

        // ── FOOTER ─────────────────────────────────────────────────────────
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            doc.fillColor(LIGHT).font('Helvetica').fontSize(7)
                .text(`SmartPick Financial Report  •  Page ${i + 1} of ${range.count}  •  Confidential`,
                    MARGIN, PAGE_H - MARGIN - 14, { width: COL_W, align: 'center' });
        }

        doc.end();
    } catch (error) {
        console.error('PDF Export Error:', error);
        res.status(500).send('Export failed');
    }
};

// ── Analytics API endpoints ───────────────────────────────────────────────────
export const getRevenueSeriesData = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;
        const data = await fas.getRevenueTrend(filter, customFrom, customTo);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch revenue series' });
    }
};

export const getReturnAnalyticsData = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;
        const data = await fas.getFinancialKPIs(filter, customFrom, customTo);
        res.json({ success: true, data: { orders: data.orders, liability: data.liability } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch return analytics' });
    }
};

export const getCouponAnalyticsData = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;
        const data = await fas.getCouponAnalytics(filter, customFrom, customTo);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch coupon analytics' });
    }
};

export const getFullDashboardMetrics = async (req, res) => {
    try {
        const { filter = 'Monthly', customFrom, customTo } = req.query;
        const data = await fas.getFinancialKPIs(filter, customFrom, customTo);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch metrics' });
    }
};

