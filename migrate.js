import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/model/productModel.js';

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const products = await Product.find({});
        console.log(`Found ${products.length} products.`);

        let count = 0;
        for (const product of products) {
            // If colorOptions is missing or empty
            if (!product.colorOptions || product.colorOptions.length === 0) {
                console.log(`Migrating product: ${product.name} (ID: ${product._id})`);
                
                const colorMap = {};
                const newVariants = [];

                if (product.variants && product.variants.length > 0) {
                    product.variants.forEach(variant => {
                        let colorName = '';
                        if (variant.color && typeof variant.color === 'object' && variant.color.name) {
                            colorName = variant.color.name;
                        } else if (typeof variant.color === 'string') {
                            colorName = variant.color;
                        }

                        if (colorName) {
                            if (!colorMap[colorName]) {
                                colorMap[colorName] = {
                                    name: colorName,
                                    code: variant.color.code || '#000000',
                                    images: variant.images && variant.images.length > 0 ? variant.images : []
                                };
                            } else if (colorMap[colorName].images.length === 0 && variant.images && variant.images.length > 0) {
                                colorMap[colorName].images = variant.images;
                            }
                        }

                        newVariants.push({
                            _id: variant._id || new mongoose.Types.ObjectId(),
                            size: variant.size,
                            color: colorName,
                            price: variant.price,
                            stock: variant.stock,
                            sku: variant.sku || `${product.name.substring(0, 3).toUpperCase()}-${colorName.substring(0, 3).toUpperCase()}-${variant.size}-${Date.now()}`
                        });
                    });
                }

                const colorOptions = Object.values(colorMap);
                if (colorOptions.length > 0) {
                    await Product.collection.updateOne(
                        { _id: product._id },
                        { $set: { colorOptions: colorOptions, variants: newVariants } }
                    );
                    count++;
                }
            }
        }

        console.log(`Migration completed. ${count} products updated.`);
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
};

migrate();
