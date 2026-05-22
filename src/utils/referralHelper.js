import User from '../model/userModel.js';
import * as walletService from '../services/user/wallet.service.js';

const REFERRER_REWARD = 100;
const REFERRED_REWARD = 50;

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

