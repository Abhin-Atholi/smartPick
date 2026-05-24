import Wallet from '../../model/walletModel.js';
import WalletTransaction from '../../model/walletTransactionModel.js';
import { sessionOpts } from '../../utils/transactionHelper.js';
import AppError from '../../utils/AppError.js';

/**
 * Get or atomically create a wallet for a user.
 * @param {string} userId
 * @param {mongoose.ClientSession|null} session
 */
export const getOrCreateWallet = async (userId, session = null) => {
    return Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0 } },
        { upsert: true, new: true, ...sessionOpts(session) }
    );
};

export const getWalletByUser = async (userId) => {
    return await getOrCreateWallet(userId);
};

/**
 * Create an immutable WalletTransaction document.
 * Uses array-form create() so session is correctly propagated.
 */
export const createWalletTransaction = async (
    walletId, userId, type, amount, description, method,
    status = 'Completed', orderId = null, session = null
) => {
    const arr = await WalletTransaction.create(
        [{ walletId, userId, type, amount, description, method, status, orderId }],
        sessionOpts(session)
    );
    return arr[0];
};

/**
 * Atomically credit a wallet and log the transaction.
 * @param {string} userId
 * @param {number} amount
 * @param {string} description
 * @param {string} method
 * @param {string|null} orderId
 * @param {mongoose.ClientSession|null} session
 */
export const creditWallet = async (userId, amount, description, method, orderId = null, session = null) => {
    if (amount <= 0) throw new AppError('Credit amount must be positive.', 400);

    const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOpts(session) }
    );

    const transaction = await createWalletTransaction(
        wallet._id, userId, 'Credit', amount, description, method, 'Completed', orderId, session
    );

    return transaction;
};

/**
 * Atomically debit a wallet. Throws if insufficient balance.
 * @param {string} userId
 * @param {number} amount
 * @param {string} description
 * @param {string} method
 * @param {string|null} orderId
 * @param {mongoose.ClientSession|null} session
 */
export const debitWallet = async (userId, amount, description, method, orderId = null, session = null) => {
    if (amount <= 0) throw new AppError('Debit amount must be positive.', 400);

    // Pre-check balance (within session if active)
    const walletCheck = await getOrCreateWallet(userId, session);
    if (walletCheck.balance < amount) {
        throw new AppError(`Insufficient wallet balance. Available: ₹${walletCheck.balance.toFixed(2)}`, 400);
    }

    // Atomic decrement — conditional on balance to prevent race condition
    const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, ...sessionOpts(session) }
    );

    if (!wallet) {
        throw new AppError('Insufficient wallet balance or concurrent update failed.', 400);
    }

    await createWalletTransaction(
        wallet._id, userId, 'Debit', amount, description, method, 'Completed', orderId, session
    );

    return wallet;
};

/**
 * Get paginated + filtered transaction history from the separate collection.
 * @param {string} userId
 * @param {number} page
 * @param {number} limit
 * @param {object} filters  - { search, type, dateFrom, dateTo }
 */
export const getTransactionHistory = async (userId, page = 1, limit = 10, filters = {}) => {
    const wallet = await getOrCreateWallet(userId);
    const skip = (page - 1) * limit;

    // Build query object
    const query = { userId };

    // Keyword search: match description or transactionId (case-insensitive)
    if (filters.search && filters.search.trim()) {
        const regex = new RegExp(filters.search.trim(), 'i');
        query.$or = [
            { description: regex },
            { transactionId: regex }
        ];
    }

    // Transaction type filter
    if (filters.type && ['Credit', 'Debit'].includes(filters.type)) {
        query.type = filters.type;
    }

    // Date range filter (inclusive)
    if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) {
            query.createdAt.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
            // Include the entire dateTo day by moving to 23:59:59.999
            const to = new Date(filters.dateTo);
            to.setHours(23, 59, 59, 999);
            query.createdAt.$lte = to;
        }
    }

    const [transactions, total] = await Promise.all([
        WalletTransaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        WalletTransaction.countDocuments(query)
    ]);

    return {
        balance: wallet.balance,
        transactions,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
};
