import Wallet from '../../model/walletModel.js';
import WalletTransaction from '../../model/walletTransactionModel.js';

/**
 * Get or atomically create a wallet for a user.
 */
export const getOrCreateWallet = async (userId) => {
    return Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0 } },
        { upsert: true, new: true }
    );
};

export const getWalletByUser = async (userId) => {
    return await getOrCreateWallet(userId);
};

/**
 * Create an immutable WalletTransaction document
 */
export const createWalletTransaction = async (walletId, userId, type, amount, description, method, status = 'Completed', orderId = null) => {
    return await WalletTransaction.create({
        walletId,
        userId,
        type,
        amount,
        description,
        method,
        status,
        orderId
    });
};

/**
 * Atomically credit a wallet and log the transaction.
 */
export const creditWallet = async (userId, amount, description, method, orderId = null) => {
    if (amount <= 0) throw new Error('Credit amount must be positive.');

    // Step 1: Atomically increment balance
    const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Step 2: Create immutable transaction log
    await createWalletTransaction(
        wallet._id,
        userId,
        'Credit',
        amount,
        description,
        method,
        'Completed',
        orderId
    );

    return wallet;
};

/**
 * Atomically debit a wallet. Throws if insufficient balance.
 */
export const debitWallet = async (userId, amount, description, method, orderId = null) => {
    if (amount <= 0) throw new Error('Debit amount must be positive.');

    // Step 1: Check balance initially to avoid unnecessary lock/attempt
    const walletCheck = await getOrCreateWallet(userId);
    if (walletCheck.balance < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${walletCheck.balance.toFixed(2)}`);
    }

    // Step 2: Atomically decrement only if balance >= amount
    const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } }, 
        { $inc: { balance: -amount } },
        { new: true }
    );

    if (!wallet) {
         throw new Error('Insufficient wallet balance or concurrent update failed.');
    }

    // Step 3: Create immutable transaction log
    await createWalletTransaction(
        wallet._id,
        userId,
        'Debit',
        amount,
        description,
        method,
        'Completed',
        orderId
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
