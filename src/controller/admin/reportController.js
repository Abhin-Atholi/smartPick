import * as reportService from '../../services/admin/reportService.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export const getSalesReportsPage = async (req, res) => {
    try {
        res.render('admin/salesReports', {
            title: 'Sales Reports — SmartPick',
            activePath: '/admin/sales-reports'
        });
    } catch (error) {
        console.error('Error rendering sales reports:', error);
        res.status(500).send('Internal Server Error');
    }
};

export const getSalesReportData = async (req, res) => {
    try {
        const { filter, customFrom, customTo } = req.query;
        const data = await reportService.getSalesReportData(filter, customFrom, customTo);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching report data:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch data' });
    }
};

export const exportExcelReport = async (req, res) => {
    try {
        const { filter, customFrom, customTo } = req.query;
        const { summary, orders, period } = await reportService.getSalesReportData(filter, customFrom, customTo);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sales Report');

        sheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 20 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Customer', key: 'customer', width: 25 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Subtotal', key: 'subtotal', width: 15 },
            { header: 'Coupon Discount', key: 'couponDiscount', width: 15 },
            { header: 'Offer Discount', key: 'offerDiscount', width: 15 },
            { header: 'Total Amount', key: 'totalAmount', width: 15 },
            { header: 'Payment', key: 'payment', width: 15 }
        ];

        orders.forEach(order => {
            sheet.addRow({
                orderId: order.orderId,
                date: new Date(order.createdAt).toLocaleDateString(),
                customer: order.user?.fullName || 'N/A',
                status: order.orderStatus,
                subtotal: order.subtotal,
                couponDiscount: order.discount || 0,
                offerDiscount: order.totalOfferDiscount || 0,
                totalAmount: order.totalAmount,
                payment: order.paymentMethod
            });
        });

        // Add summary at the bottom
        sheet.addRow({});
        sheet.addRow({ orderId: 'SUMMARY' });
        sheet.addRow({ orderId: 'Total Orders', date: summary.totalOrders });
        sheet.addRow({ orderId: 'Total Revenue', date: summary.totalRevenue });
        sheet.addRow({ orderId: 'Total Discounts', date: summary.totalDiscount });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${filter}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).send('Export failed');
    }
};

export const exportPdfReport = async (req, res) => {
    try {
        const { filter, customFrom, customTo } = req.query;
        const { summary, orders, period } = await reportService.getSalesReportData(filter, customFrom, customTo);

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const filename = `sales-report-${filter}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('SmartPick - Sales Report', { align: 'center' });
        doc.fontSize(10).text(`Period: ${new Date(period.startDate).toLocaleDateString()} to ${new Date(period.endDate).toLocaleDateString()}`, { align: 'center' });
        doc.moveDown();

        // Summary Cards Section
        doc.rect(30, doc.y, 535, 60).fillAndStroke('#f3f4f6', '#e5e7eb');
        doc.fillColor('#000').fontSize(12);
        
        const cardY = doc.y + 15;
        doc.text('Total Revenue', 40, cardY);
        doc.text(`Rs. ${summary.totalRevenue.toFixed(2)}`, 40, cardY + 15, { bold: true });

        doc.text('Total Orders', 180, cardY);
        doc.text(`${summary.totalOrders}`, 180, cardY + 15, { bold: true });

        doc.text('Products Sold', 320, cardY);
        doc.text(`${summary.productsSold}`, 320, cardY + 15, { bold: true });

        doc.text('Total Discount', 460, cardY);
        doc.text(`Rs. ${summary.totalDiscount.toFixed(2)}`, 460, cardY + 15, { bold: true });

        doc.moveDown(4);

        // Table
        doc.fontSize(14).text('Order Details', { underline: true });
        doc.moveDown();

        // Table Header
        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Order ID', 35, tableTop);
        doc.text('Date', 140, tableTop);
        doc.text('Customer', 230, tableTop);
        doc.text('Discount', 380, tableTop);
        doc.text('Amount', 480, tableTop);

        doc.moveTo(30, tableTop + 15).lineTo(560, tableTop + 15).stroke();
        doc.font('Helvetica').fontSize(9);

        let currentY = tableTop + 25;
        orders.forEach((order, index) => {
            if (currentY > 750) {
                doc.addPage();
                currentY = 50;
            }
            doc.text(order.orderId, 35, currentY);
            doc.text(new Date(order.createdAt).toLocaleDateString(), 140, currentY);
            doc.text(order.user?.fullName || 'N/A', 230, currentY, { width: 140 });
            doc.text(`Rs. ${(order.discount + order.totalOfferDiscount).toFixed(2)}`, 380, currentY);
            doc.text(`Rs. ${order.totalAmount.toFixed(2)}`, 480, currentY);
            currentY += 20;
        });

        doc.end();
    } catch (error) {
        console.error('PDF Export Error:', error);
        res.status(500).send('Export failed');
    }
};
