/**
 * SmartPick — Centralized Loading Manager
 * ========================================
 * Provides a globally accessible window.Loader API for premium UX protection.
 *
 * API:
 *   Loader.show(message?)       — Full-page premium blur overlay + ring spinner
 *   Loader.hide()               — Fade out and remove overlay
 *   Loader.withButton(btn, text?) — Lock a button with inline spinner, returns unlock()
 *
 * Safety Features:
 *   - State guard (no double-stacking overlays)
 *   - 30s auto-failsafe timeout
 *   - ESC / Tab / Scroll blocking during full overlay
 *   - Mobile pull-to-refresh prevention (touchAction: none)
 *   - Accessibility attributes (aria-busy, role=alert)
 *   - pageshow + beforeunload cleanup (Razorpay/back-nav safety)
 *   - Idempotent button locks (data-loading guard)
 */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let _isVisible = false;
  let _failsafeTimer = null;
  let _overlay = null;
  let _spinner = null;
  let _messageEl = null;

  // Minimum delay protection state
  let _showTimestamp = null;
  let _hideTimeout = null;
  const MIN_LOADER_TIME = 400; // ms

  const FAILSAFE_MS = 30000; // 30 seconds

  // ─── CSS (injected once) ────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('sp-loader-styles')) return;

    const style = document.createElement('style');
    style.id = 'sp-loader-styles';
    style.textContent = `
      /* ── Overlay ── */
      #sp-loader-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 20px;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      #sp-loader-overlay.sp-loader-active {
        opacity: 1;
        pointer-events: all;
      }

      /* ── Ring Spinner ── */
      #sp-loader-ring {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: 3.5px solid rgba(255, 255, 255, 0.15);
        border-top-color: #ffffff;
        animation: sp-loader-spin 0.75s linear infinite;
        flex-shrink: 0;
      }
      @keyframes sp-loader-spin {
        to { transform: rotate(360deg); }
      }

      /* ── Message ── */
      #sp-loader-message {
        font-family: 'Inter', 'Satoshi', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.80);
        letter-spacing: 0.01em;
        text-align: center;
        max-width: 240px;
        line-height: 1.5;
        user-select: none;
      }

      /* ── Button inline spinner ── */
      .sp-btn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.30);
        border-top-color: currentColor;
        animation: sp-loader-spin 0.6s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
        flex-shrink: 0;
      }
      /* Dark variant for light-background buttons */
      .sp-btn-spinner.sp-btn-spinner--dark {
        border-color: rgba(0, 0, 0, 0.15);
        border-top-color: currentColor;
      }
    `;

    document.head.appendChild(style);
  }

  // ─── DOM Setup ──────────────────────────────────────────────────────────────
  function _initDOM() {
    if (document.getElementById('sp-loader-overlay')) {
      _overlay = document.getElementById('sp-loader-overlay');
      _spinner = document.getElementById('sp-loader-ring');
      _messageEl = document.getElementById('sp-loader-message');
      return;
    }

    _injectStyles();

    _overlay = document.createElement('div');
    _overlay.id = 'sp-loader-overlay';
    _overlay.setAttribute('role', 'alert');
    _overlay.setAttribute('aria-live', 'assertive');
    _overlay.setAttribute('aria-label', 'Loading');

    _spinner = document.createElement('div');
    _spinner.id = 'sp-loader-ring';

    _messageEl = document.createElement('div');
    _messageEl.id = 'sp-loader-message';

    _overlay.appendChild(_spinner);
    _overlay.appendChild(_messageEl);
    document.body.appendChild(_overlay);
  }

  // ─── Keyboard / Scroll Blocker ───────────────────────────────────────────────
  function _keyBlocker(e) {
    // Block ESC, Tab, Space (for scroll) when overlay is active
    if (['Escape', 'Tab'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Block space/arrow scroll keys
    if ([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
    }
  }

  function _wheelBlocker(e) {
    e.preventDefault();
  }

  function _touchBlocker(e) {
    e.preventDefault();
  }

  function _blockInteractions() {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.addEventListener('keydown', _keyBlocker, true);
    document.addEventListener('wheel', _wheelBlocker, { passive: false, capture: true });
    document.addEventListener('touchmove', _touchBlocker, { passive: false, capture: true });
  }

  function _unblockInteractions() {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.removeEventListener('keydown', _keyBlocker, true);
    document.removeEventListener('wheel', _wheelBlocker, { capture: true });
    document.removeEventListener('touchmove', _touchBlocker, { capture: true });
  }

  // ─── Core API ───────────────────────────────────────────────────────────────

  /**
   * Show the full-page premium loading overlay.
   * @param {string} [message='Please wait...'] - Status message displayed under spinner.
   */
  function show(message) {
    // Cancel any pending delayed hide
    if (_hideTimeout) {
      clearTimeout(_hideTimeout);
      _hideTimeout = null;
    }

    // State guard — prevent stacking
    if (_isVisible) {
      if (_overlay) _messageEl.textContent = message || 'Please wait...';
      return;
    }

    _isVisible = true;
    _showTimestamp = Date.now();

    if (!_overlay) _initDOM();

    // Update message
    _messageEl.textContent = message || 'Please wait...';

    // Accessibility
    _overlay.setAttribute('aria-busy', 'true');

    // Block all interactions
    _blockInteractions();

    // Show with fade-in
    // Force layout recalc before adding active class so transition fires
    void _overlay.offsetWidth;
    _overlay.classList.add('sp-loader-active');

    // Failsafe: auto-hide after 30s to prevent permanent lockout
    clearTimeout(_failsafeTimer);
    _failsafeTimer = setTimeout(function () {
      console.warn('[SmartPick Loader] Failsafe triggered — hiding loader after 30s timeout.');
      hide();
    }, FAILSAFE_MS);
  }

  /**
   * Hide the full-page loading overlay.
   * Enforces minimum display duration to prevent flickering.
   */
  function hide() {
    if (!_isVisible) return;

    const elapsed = Date.now() - _showTimestamp;
    if (elapsed < MIN_LOADER_TIME) {
      if (!_hideTimeout) {
        const delay = MIN_LOADER_TIME - elapsed;
        _hideTimeout = setTimeout(function () {
          _hideTimeout = null;
          _performHide();
        }, delay);
      }
      return;
    }

    _performHide();
  }

  /**
   * Perform actual DOM updates to hide overlay synchronously
   */
  function _performHide() {
    if (!_isVisible) return;
    _isVisible = false;

    clearTimeout(_failsafeTimer);
    _failsafeTimer = null;

    if (_hideTimeout) {
      clearTimeout(_hideTimeout);
      _hideTimeout = null;
    }

    if (!_overlay) return;

    // Accessibility
    _overlay.setAttribute('aria-busy', 'false');

    // Fade out
    _overlay.classList.remove('sp-loader-active');

    // Unblock interactions
    _unblockInteractions();
  }

  /**
   * Lock a button with an inline spinner during an async operation.
   * Idempotent — safe to call multiple times on same button.
   *
   * @param {HTMLElement} button        - The button element to lock.
   * @param {string}      [loadingText] - Text to show during loading. Defaults to "Processing..."
   * @param {boolean}     [darkSpinner] - Use dark spinner (for light-background buttons).
   * @returns {Function} unlock         - Call this function to restore the button.
   */
  function withButton(button, loadingText, darkSpinner) {
    if (!button) return function () {};

    // Idempotent guard — prevent double-lock
    if (button.dataset.spLoading === 'true') return function () {};

    button.dataset.spLoading = 'true';
    button.dataset.spOriginalHtml = button.innerHTML;
    button.dataset.spOriginalDisabled = button.disabled;

    const spinnerClass = darkSpinner
      ? 'sp-btn-spinner sp-btn-spinner--dark'
      : 'sp-btn-spinner';

    button.disabled = true;

    if (loadingText === '') {
      button.innerHTML = '<span class="' + spinnerClass + '" style="margin-right: 0;"></span>';
    } else {
      button.innerHTML =
        '<span class="' + spinnerClass + '"></span>' +
        '<span>' + (loadingText || 'Processing...') + '</span>';
    }

    return function unlock() {
      button.disabled = button.dataset.spOriginalDisabled === 'true';
      button.innerHTML = button.dataset.spOriginalHtml || '';
      delete button.dataset.spLoading;
      delete button.dataset.spOriginalHtml;
      delete button.dataset.spOriginalDisabled;
    };
  }

  // ─── Page Navigation Cleanup ────────────────────────────────────────────────
  // Handles Razorpay return flows, browser back, bfcache restore
  window.addEventListener('pageshow', function () {
    _performHide();
  });

  window.addEventListener('beforeunload', function () {
    // Synchronous — just reset state without animation
    _performHide();
  });

  // ─── Init DOM as soon as possible ───────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDOM);
  } else {
    _initDOM();
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  window.Loader = {
    show: show,
    hide: hide,
    withButton: withButton,
  };

})();
