import User from '../../model/userModel.js';
import Wallet from '../../model/walletModel.js';

/**
 * GET /account/referrals
 * Loads the referral dashboard page with stats and history.
 */
export const loadReferrals = async (req, res, next) => {
    try {
        const userId = req.session.userId;

        // Fetch current user (for referral code)
        const user = await User.findById(userId).lean();
        if (!user) return res.redirect('/login');

        // Find all users referred by this user
        const referredUsers = await User.find({ referredBy: userId })
            .select('fullName email createdAt referralRewardClaimed')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate stats
        const totalReferrals = referredUsers.length;
        const successfulReferrals = referredUsers.filter(u => u.referralRewardClaimed).length;
        const pendingReferrals = totalReferrals - successfulReferrals;

        // Calculate total rewards earned from referrals (₹100 per successful referral)
        const REFERRER_REWARD = 100;
        const totalEarned = successfulReferrals * REFERRER_REWARD;

        // Build history rows
        const referralHistory = referredUsers.map(u => ({
            name: u.fullName,
            email: u.email,
            joinedAt: u.createdAt,
            status: u.referralRewardClaimed ? 'Completed' : 'Pending',
            rewardAmount: u.referralRewardClaimed ? REFERRER_REWARD : 0,
        }));

        res.render('user/referrals/referrals', {
            title: 'My Referrals — SmartPick',
            activePath: '/account/referrals',
            user,
            referralHistory,
            stats: { totalReferrals, successfulReferrals, pendingReferrals, totalEarned },
        });
    } catch (err) {
        console.error('loadReferrals error:', err);
        next(err);
    }
};
