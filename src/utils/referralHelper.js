import User from '../model/userModel.js';
import * as walletService from '../services/user/wallet.service.js';

const REFERRER_REWARD = 100;
const REFERRED_REWARD = 50;

/**
 * Process referral rewards after a user's first successful payment.
 * Must be called after payment verification, not at signup.
 * 
 * Guards:
 * - referralRewardClaimed must be false
 * - referredBy must exist
 * - Atomic update prevents double-execution
 */
export const processReferralReward = async (userId) => {
    // Atomically claim the reward — prevents race conditions from multiple tabs/retries
    const user = await User.findOneAndUpdate(
        { _id: userId, referralRewardClaimed: false, referredBy: { $ne: null } },
        { $set: { referralRewardClaimed: true } },
        { new: true }
    );

    if (!user) return; // Already claimed or no referrer — silently exit

    const referrerId = user.referredBy;

    // Prevent self-referral (extra safety)
    if (referrerId.toString() === userId.toString()) return;

    try {
        await Promise.all([
            walletService.creditWallet(
                referrerId,
                REFERRER_REWARD,
                `Referral reward — ${user.fullName} placed their first order`,
                'Referral'
            ),
            walletService.creditWallet(
                userId,
                REFERRED_REWARD,
                'Welcome bonus — Referral reward for your first order',
                'Referral'
            )
        ]);
    } catch (err) {
        // Rollback the claimed flag so it can be retried
        await User.findByIdAndUpdate(userId, { $set: { referralRewardClaimed: false } });
        console.error('processReferralReward wallet credit failed:', err);
        throw err;
    }
};

/**
 * Validate a referral code entered during signup.
 * Returns the referrer User document or throws.
 */
export const validateReferralCode = async (code, signingUpUserId = null) => {
    if (!code) throw new Error('Referral code is required.');
    const referrer = await User.findOne({ referralCode: code.trim().toUpperCase() }).select('_id fullName').lean();
    if (!referrer) throw new Error('Invalid referral code.');
    // Prevent self-referral
    if (signingUpUserId && referrer._id.toString() === signingUpUserId.toString()) {
        throw new Error('You cannot use your own referral code.');
    }
    return referrer;
};

