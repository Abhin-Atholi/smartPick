import mongoose from 'mongoose';
import { createLogger } from './logger.js';

const log = createLogger('TransactionHelper');

/**
 * Phase 8: Hardened Transaction Helper
 *
 * MongoDB ACID multi-document transactions require a Replica Set or mongos.
 * Standalone instances (typical local dev) do NOT support sessions.
 *
 * Detection: Uses replSetGetStatus admin command — the authoritative check.
 * Fallback:  Runs callback without session on standalone instances.
 *
 * Production (Atlas / replica set) → full ACID atomicity.
 * Local dev (standalone)           → identical logic, no session overhead.
 */

let _transactionsEnabled = null; // null = not yet detected

/**
 * Authoritative replica set detection via admin command.
 * Cached after first call — never repeated per process lifetime.
 */
export const detectTransactionSupport = async () => {
    if (_transactionsEnabled !== null) return _transactionsEnabled;

    try {
        // replSetGetStatus is the definitive check — it only succeeds on replica set members
        await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
        _transactionsEnabled = true;
        log.info('✅ Replica set detected — ACID transactions enabled.');
    } catch (err) {
        // Code 76  = NoReplicationEnabled (standalone)
        // Code 94  = NotYetInitialized
        // Code 74  = NotPrimary  (secondary member — still replica set)
        // Anything replica-set-related will NOT throw with these codes
        const standaloneCode = err.code === 76 || err.codeName === 'NoReplicationEnabled';
        const notInitialized = err.code === 94;

        if (standaloneCode || notInitialized || err.message?.includes('not running with --replSet')) {
            _transactionsEnabled = false;
            log.warn(
                '⚠️  Replica set not detected — running without transactions. ' +
                'Use a Replica Set or MongoDB Atlas in production for ACID guarantees.'
            );
        } else {
            // On a replica set, secondary members may throw NotPrimary (74) — still supported
            // Any unexpected error: default to disabled, log it clearly
            _transactionsEnabled = false;
            log.warn(`⚠️  Replica set check inconclusive (${err.codeName || err.message}) — disabling transactions for safety.`);
        }
    }

    return _transactionsEnabled;
};

/**
 * Executes a callback within an ACID transaction if replica set is available.
 * Falls back to direct (non-transactional) execution on standalone MongoDB.
 *
 * IMPORTANT: The callback receives either a live ClientSession OR null.
 * All DB operations inside must use the `sessionOpts(session)` helper
 * to correctly build their options object.
 *
 * @param {(session: mongoose.ClientSession | null) => Promise<any>} callback
 * @returns {Promise<any>}
 */
export const withTransaction = async (callback) => {
    const enabled = await detectTransactionSupport();

    if (!enabled) {
        // Non-transactional mode: pass null so callers can use sessionOpts(null) → {}
        if (process.env.TEST_TRANSACTION_ROLLBACK === 'true') {
            log.warn('TEST_TRANSACTION_ROLLBACK is set but transactions are disabled — skipping forced rollback test.');
        }
        return callback(null);
    }

    const session = await mongoose.startSession();
    try {
        // session.withTransaction handles retry logic and commit/abort automatically
        let result;
        await session.withTransaction(async () => {
            // Forced rollback test hook for development verification
            if (process.env.TEST_TRANSACTION_ROLLBACK === 'true') {
                throw new Error('[TEST] Forced transaction rollback — verifying ACID safety.');
            }
            result = await callback(session);
        });
        return result;
    } finally {
        session.endSession();
    }
};

/**
 * Build Mongoose query/save options for a given session.
 * Always safe to call — returns {} when session is null (non-transactional mode).
 *
 * Usage:
 *   const opts = sessionOpts(session);
 *   await Model.findOne(query, null, opts);
 *   await doc.save(opts);
 *   await Model.create([data], opts);
 *   await Model.findOneAndUpdate(filter, update, { new: true, ...opts });
 *
 * @param {mongoose.ClientSession | null} session
 * @returns {{ session: mongoose.ClientSession } | {}}
 */
export const sessionOpts = (session) => session ? { session } : {};
