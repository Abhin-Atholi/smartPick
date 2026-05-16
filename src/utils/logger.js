/**
 * Phase 8: Centralized Logger Utility
 * Provides structured, context-aware logging across services.
 * Lightweight — no external dependencies. Future-ready for Winston/Pino.
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? LOG_LEVELS.INFO
    : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

const fmt = (level, context, message, meta) => {
    const ts = new Date().toISOString();
    const base = `[${ts}] [${level}]${context ? ` [${context}]` : ''} ${message}`;
    return meta ? `${base} ${JSON.stringify(meta)}` : base;
};

const log = (levelName, levelVal, context, message, meta) => {
    if (levelVal < CURRENT_LEVEL) return;
    const line = fmt(levelName, context, message, meta);
    if (levelVal >= LOG_LEVELS.ERROR) {
        console.error(line);
    } else if (levelVal >= LOG_LEVELS.WARN) {
        console.warn(line);
    } else {
        console.log(line);
    }
};

/**
 * Creates a context-scoped logger.
 * @param {string} context - Module/service name (e.g. 'orderLifecycleService')
 */
export const createLogger = (context) => ({
    debug: (message, meta) => log('DEBUG', LOG_LEVELS.DEBUG, context, message, meta),
    info:  (message, meta) => log('INFO',  LOG_LEVELS.INFO,  context, message, meta),
    warn:  (message, meta) => log('WARN',  LOG_LEVELS.WARN,  context, message, meta),
    error: (message, meta) => log('ERROR', LOG_LEVELS.ERROR, context, message, meta),
    
    /** Log a lifecycle state transition event */
    lifecycle: (action, orderId, from, to, meta) =>
        log('INFO', LOG_LEVELS.INFO, context,
            `LIFECYCLE | ${action} | order=${orderId} | ${from} → ${to}`,
            meta),

    /** Log a financial operation */
    financial: (operation, amount, userId, orderId) =>
        log('INFO', LOG_LEVELS.INFO, context,
            `FINANCIAL | ${operation} | amount=₹${amount} | user=${userId} | order=${orderId}`),
});

/** Root logger for non-module use */
export const logger = createLogger('SmartPick');
