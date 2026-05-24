/**
 * SmartPick — Centralized Axios Setup
 * =====================================
 * Configures global Axios interceptors to optionally show/hide
 * the Loader overlay based on per-request configuration.
 *
 * Usage:
 *   axios.post('/endpoint', data, { showLoader: true, loaderMessage: 'Applying coupon...' })
 *
 * IMPORTANT: Load this file AFTER loadingManager.js and the Axios CDN script.
 */

(function () {
  'use strict';

  // Guard: only set up once
  if (window._spAxiosSetupDone) return;
  window._spAxiosSetupDone = true;

  if (typeof axios === 'undefined') {
    console.warn('[SmartPick AxiosSetup] Axios is not loaded. Skipping interceptor setup.');
    return;
  }

  if (typeof window.Loader === 'undefined') {
    console.warn('[SmartPick AxiosSetup] window.Loader is not loaded. Skipping interceptor setup.');
    return;
  }

  // ── Global Defaults ────────────────────────────────────────────────────────
  axios.defaults.withCredentials = true;
  axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (csrfToken) {
    axios.defaults.headers.common['x-csrf-token'] = csrfToken;
  }

  // ── Request Interceptor ────────────────────────────────────────────────────
  axios.interceptors.request.use(
    function (config) {
      // If the caller explicitly opts in, show the overlay
      if (config.showLoader === true) {
        window.Loader.show(config.loaderMessage || 'Please wait...');
      }
      return config;
    },
    function (error) {
      // On request error, ensure overlay is always cleared
      if (window.Loader) window.Loader.hide();
      return Promise.reject(error);
    }
  );

  // ── Response Interceptor ───────────────────────────────────────────────────
  axios.interceptors.response.use(
    function (response) {
      // Only hide if the original request had showLoader
      if (response.config && response.config.showLoader === true) {
        if (window.Loader) window.Loader.hide();
      }
      return response;
    },
    function (error) {
      if (error?.response?.status === 403) {
          console.error('CSRF/session validation failed');
      }

      // Always hide on error if this request had showLoader
      if (error.config && error.config.showLoader === true) {
        if (window.Loader) window.Loader.hide();
      }
      return Promise.reject(error);
    }
  );

})();
