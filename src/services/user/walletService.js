import Wallet from '../../model/walletModel.js';
import WalletTransaction from '../../model/walletTransactionModel.js';
import { sessionOpts } from '../../utils/transactionHelper.js';

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
    if (amount <= 0) throw new Error('Credit amount must be positive.');

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
    if (amount <= 0) throw new Error('Debit amount must be positive.');

    // Pre-check balance (within session if active)
    const walletCheck = await getOrCreateWallet(userId, session);
    if (walletCheck.balance < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${walletCheck.balance.toFixed(2)}`);
    }

    // Atomic decrement — conditional on balance to prevent race condition
    const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, ...sessionOpts(session) }
    );

    if (!wallet) {
        throw new Error('Insufficient wallet balance or concurrent update failed.');
    }

    await createWalletTransaction(
        wallet._id, userId, 'Debit', amount, description, method, 'Completed', orderId, session
    );

    return wallet;
};

/**
 * Get paginated transaction history from the separate collection.
 */
export const getTransactionHistory = async (userId, page = 1, limit = 10) => {
    const wallet = await getOrCreateWallet(userId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
        WalletTransaction.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        WalletTransaction.countDocuments({ userId })
    ]);

    return {
        balance: wallet.balance,
        transactions,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
};
