class PaymentUIManager {
    constructor() {
        this.activeOverlay = null;
        this.minDisplayTime = 1200; // ms
        this.overlayStartTime = 0;
        this.isProcessing = false;
        
        // Setup ESC key blocker
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isProcessing) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initDOM());
        } else {
            this.initDOM();
        }
    }

    initDOM() {
        if (document.getElementById('smartpick-global-payment-overlay')) return;
        
        const overlayHtml = `
        <style>
            #smartpick-global-payment-overlay {
                transition: opacity 0.3s ease;
            }
            #smartpick-global-payment-card {
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
            }
            #smartpick-global-payment-card.is-visible {
                transform: scale(1);
                opacity: 1;
            }
            #smartpick-global-payment-card.is-hidden {
                transform: scale(0.92);
                opacity: 0;
            }
        </style>
        <div id="smartpick-global-payment-overlay" class="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-md hidden opacity-0 flex items-center justify-center p-4" style="transition: opacity 0.3s ease;">
            <div id="smartpick-global-payment-card" class="is-hidden bg-white rounded-[2rem] shadow-2xl max-w-[420px] w-full p-8 text-center flex flex-col items-center relative overflow-hidden" style="will-change: transform, opacity;">
                <!-- Icon Container -->
                <div id="sp-payment-icon" class="w-24 h-24 mb-6 relative flex items-center justify-center"></div>
                <!-- Title -->
                <h2 id="sp-payment-title" class="text-2xl font-black text-gray-900 mb-2 tracking-tight">Processing</h2>
                <!-- Subtitle -->
                <div id="sp-payment-subtitle" class="text-gray-500 font-medium text-sm w-full">Please wait while we secure your payment.</div>
                <!-- Actions -->
                <div id="sp-payment-actions" class="w-full mt-6 space-y-3 hidden">
                    <button id="sp-btn-primary" class="w-full py-4 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-black transition-colors active:scale-95">Choose Another Payment Method</button>
                    <button id="sp-btn-secondary" class="w-full py-4 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors active:scale-95">Cancel</button>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        this.overlay = document.getElementById('smartpick-global-payment-overlay');
        this.card = document.getElementById('smartpick-global-payment-card');
        this.iconContainer = document.getElementById('sp-payment-icon');
        this.title = document.getElementById('sp-payment-title');
        this.subtitle = document.getElementById('sp-payment-subtitle');
        this.actions = document.getElementById('sp-payment-actions');
        
        document.getElementById('sp-btn-primary').addEventListener('click', () => {
            if (this.onPrimaryAction) this.onPrimaryAction();
            else this.hideOverlay();
        });
        document.getElementById('sp-btn-secondary').addEventListener('click', () => {
            if (this.onSecondaryAction) this.onSecondaryAction();
            else this.hideOverlay();
        });
    }

    getConfigs(type) {
        return {
            cod: {
                icon: `<div class="absolute inset-0 border-4 border-indigo-500/20 rounded-full border-t-indigo-600 animate-spin"></div>
                       <svg class="text-indigo-600 relative z-10" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
                title: 'Placing your order',
                subtitle: 'Securing your items...'
            },
            razorpay: {
                icon: `<div class="absolute inset-0 border-4 border-blue-500/30 rounded-full border-t-blue-500 animate-spin"></div>
                       <div class="absolute inset-2 border-4 border-slate-700 rounded-full"></div>
                       <svg class="text-blue-500 relative z-10" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                       <div class="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-sm border border-gray-100">
                           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-emerald-500" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                       </div>`,
                title: 'Verifying Secure Payment',
                subtitle: '<span class="flex items-center justify-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="animate-pulse text-blue-500"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Encrypting connection...</span>'
            },
            wallet: {
                icon: `<div class="absolute inset-0 border-4 border-indigo-500/20 rounded-full border-t-indigo-600 animate-spin"></div>
                       <svg class="text-indigo-600 relative z-10" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>`,
                title: 'Processing Wallet Payment',
                subtitle: 'Securely deducting funds...'
            },
            success: {
                icon: `<div class="absolute inset-0 bg-green-100 rounded-full transform scale-0 animate-[popIn_0.3s_ease-out_forwards]"></div>
                       <svg class="text-green-600 relative z-10 animate-[drawCheck_0.4s_ease-out_0.2s_forwards]" style="stroke-dasharray: 100; stroke-dashoffset: 100;" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                       <style>
                           @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
                           @keyframes drawCheck { to { stroke-dashoffset: 0; } }
                       </style>`,
                title: 'Payment Successful',
                subtitle: 'Redirecting you securely...'
            },
            wallet_insufficient: {
                icon: `<div class="absolute inset-0 bg-amber-50 rounded-full"></div>
                       <div class="absolute inset-0 border-4 border-amber-100/50 rounded-full animate-pulse"></div>
                       <svg class="text-amber-500 relative z-10" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
                title: 'Insufficient Balance',
                subtitle: '' // injected dynamically
            },
            error: {
                icon: `<div class="absolute inset-0 bg-red-50 rounded-full"></div>
                       <svg class="text-red-500 relative z-10" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
                title: 'Payment Failed',
                subtitle: '' // injected dynamically
            }
        }[type];
    }

    async showOverlay(type, data = null) {
        if (!this.overlay) this.initDOM();
        
        // Prevent overriding a processing state with another processing state unless it's success/error
        if (this.isProcessing && !['success', 'error', 'wallet_insufficient'].includes(type)) {
            return false;
        }
        
        const config = this.getConfigs(type);
        if (!config) return false;

        this.activeOverlay = type;
        if (['success', 'error', 'wallet_insufficient'].includes(type) === false) {
            this.isProcessing = true;
            this.overlayStartTime = Date.now();
            document.body.style.overflow = 'hidden';
        }

        // Apply content
        this.iconContainer.innerHTML = config.icon;
        this.title.innerHTML = config.title;
        
        // Handle specialized states
        if (type === 'wallet_insufficient') {
            this.isProcessing = false; // Allow dismissal
            this.subtitle.innerHTML = `
                <div class="bg-amber-50/50 rounded-2xl p-4 mt-2 w-full text-left space-y-2 border border-amber-100/50">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-500 font-semibold">Wallet Balance</span> 
                        <span class="font-bold text-gray-900">₹${data.balance?.toLocaleString('en-IN') || 0}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-500 font-semibold">Required</span> 
                        <span class="font-bold text-gray-900">₹${data.required?.toLocaleString('en-IN') || 0}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm pt-2 mt-2 border-t border-amber-200/50">
                        <span class="text-amber-600 font-bold">Shortfall</span> 
                        <span class="font-black text-amber-600">₹${data.shortfall?.toLocaleString('en-IN') || 0}</span>
                    </div>
                </div>`;
            this.actions.classList.remove('hidden');
            
            this.onPrimaryAction = () => this.hideOverlay();
            document.getElementById('sp-btn-primary').innerText = "Choose Another Payment Method";
            
            this.onSecondaryAction = () => {
                this.hideOverlay();
                // Optionally redirect to wallet page to add funds
                // window.location.href = '/wallet';
            };
            document.getElementById('sp-btn-secondary').innerText = "Add Funds Later";
            document.getElementById('sp-btn-secondary').classList.remove('hidden');
        } else if (type === 'error') {
            this.isProcessing = false;
            this.subtitle.innerHTML = `<p class="text-red-500 font-medium px-2 mt-2">${data?.message || 'Something went wrong.'}</p>`;
            this.actions.classList.remove('hidden');
            
            this.onPrimaryAction = () => this.hideOverlay();
            document.getElementById('sp-btn-primary').innerText = "Okay";
            document.getElementById('sp-btn-secondary').classList.add('hidden');
        } else {
            this.subtitle.innerHTML = config.subtitle;
            this.actions.classList.add('hidden');
        }

        // Show UI
        this.overlay.classList.remove('hidden');
        void this.overlay.offsetWidth; // Force reflow
        this.overlay.classList.remove('opacity-0');
        this.card.classList.remove('is-hidden');
        this.card.classList.add('is-visible');

        return true;
    }

    async hideOverlay(force = false) {
        if (!this.overlay) return;
        
        if (this.isProcessing && !force) {
            const elapsed = Date.now() - this.overlayStartTime;
            if (elapsed < this.minDisplayTime) {
                await new Promise(resolve => setTimeout(resolve, this.minDisplayTime - elapsed));
            }
        }

        this.overlay.classList.add('opacity-0');
        this.card.classList.remove('is-visible');
        this.card.classList.add('is-hidden');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        this.overlay.classList.add('hidden');
        this.activeOverlay = null;
        this.isProcessing = false;
        document.body.style.overflow = '';
    }

    async showSuccess(redirectUrl) {
        // Minimum processing time check
        if (this.overlayStartTime > 0) {
            const elapsed = Date.now() - this.overlayStartTime;
            if (elapsed < this.minDisplayTime) {
                await new Promise(resolve => setTimeout(resolve, this.minDisplayTime - elapsed));
            }
        }
        
        await this.showOverlay('success');
        
        // Wait for success animation to play out nicely
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        window.location.href = redirectUrl;
    }
    
    // UI Button Helpers
    lockButton(btnElement, loadingText = 'Processing...') {
        if (!btnElement) return;
        btnElement.dataset.originalText = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span class="align-middle">${loadingText}</span>`;
    }
    
    unlockButton(btnElement) {
        if (!btnElement) return;
        btnElement.disabled = false;
        if (btnElement.dataset.originalText) {
            btnElement.innerHTML = btnElement.dataset.originalText;
        }
    }
}

window.paymentUI = new PaymentUIManager();
