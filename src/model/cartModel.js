import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity cannot be less than 1.'],
        default: 1
    },
    size: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    }
}, { _id: false });

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    cartTotal: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Middleware to calculate total before saving
cartSchema.pre('save', async function() {
    this.cartTotal = this.items.reduce((acc, item) => acc + item.totalPrice, 0);
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
