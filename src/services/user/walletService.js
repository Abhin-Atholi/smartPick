import Wallet from '../../model/walletModel.js';

/**
 * Get or atomically create a wallet for a user.
 */
export const getOrCreateWallet = async (userId) => {
    return Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0, transactions: [] } },
        { upsert: true, new: true }
    );
};

/**
 * Atomically credit a wallet. Safe against concurrent updates.
 */
export const creditWallet = async (userId, amount, description, method = 'Refund', orderId = null) => {
    if (amount <= 0) throw new Error('Credit amount must be positive.');

    const transaction = { type: 'Credit', amount, description, method, status: 'Completed', orderId };

    return Wallet.findOneAndUpdate(
        { userId },
        {
            $inc: { balance: amount },
            $push: { transactions: { $each: [transaction], $position: 0 } }
        },
        { upsert: true, new: true }
    );
};

/**
 * Atomically debit a wallet. Throws if insufficient balance.
 */
export const debitWallet = async (userId, amount, description, method = 'Order Payment', orderId = null) => {
    if (amount <= 0) throw new Error('Debit amount must be positive.');

    const wallet = await getOrCreateWallet(userId);
    if (wallet.balance < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}`);
    }

    const transaction = { type: 'Debit', amount, description, method, status: 'Completed', orderId };

    return Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } }, // Extra safety guard
        {
            $inc: { balance: -amount },
            $push: { transactions: { $each: [transaction], $position: 0 } }
        },
        { new: true }
    );
};

/**
 * Get paginated transaction history for a user.
 */
export const getTransactionHistory = async (userId, page = 1, limit = 10) => {
    const wallet = await Wallet.findOne({ userId }).lean();
    if (!wallet) return { balance: 0, transactions: [], totalPages: 0 };

    const total = wallet.transactions.length;
    const start = (page - 1) * limit;
    const transactions = wallet.transactions
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(start, start + limit);

    return {
        balance: wallet.balance,
        transactions,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
};
