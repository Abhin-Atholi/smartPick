import 'dotenv/config';
import connectDB from '../../config/db.js';
import Order from '../../model/orderModel.js';
import Product from '../../model/productModel.js';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to the project root
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function runMigration() {
    try {
        await connectDB();
        console.log('📦 Connected to Database.');
        console.log('Starting migration to backfill productName and image on Order Items...');

        const orders = await Order.find().populate('items.product');
        let modifiedOrdersCount = 0;
        let totalItemsMigrated = 0;

        for (const order of orders) {
            let orderModified = false;

            for (const item of order.items) {
                // If it already has both, skip
                if (item.productName && item.image) continue;

                if (item.product) {
                    const product = item.product; // populated document
                    
                    if (!item.productName) {
                        item.productName = product.name;
                    }
                    
                    if (!item.image) {
                        const normalize = str => String(str || '').trim().toLowerCase();
                        const colorOpt = product.colorOptions?.find(c => normalize(c.name) === normalize(item.color));
                        item.image = colorOpt?.images?.[0] || product.defaultImage || '/images/placeholder.jpg';
                    }

                    orderModified = true;
                    totalItemsMigrated++;
                } else {
                    // Product is hard deleted, we can only fall back
                    if (!item.productName) item.productName = 'Product Unavailable';
                    if (!item.image) item.image = '/images/placeholder.jpg';
                    orderModified = true;
                }
            }

            if (orderModified) {
                await order.save();
                modifiedOrdersCount++;
                console.log(`Migrated order: ${order.orderId || order._id}`);
            }
        }

        console.log('✅ Migration completed successfully!');
        console.log(`Updated ${modifiedOrdersCount} orders.`);
        console.log(`Migrated ${totalItemsMigrated} individual order items.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
