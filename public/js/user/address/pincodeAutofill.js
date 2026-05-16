/**
 * PincodeAutofill — fetches State & City from the India Postal API.
 * Supports both Add and Edit forms via explicit element IDs.
 *
 * Usage: PincodeAutofill.init('add-pincode', 'add-state', 'add-city');
 *        PincodeAutofill.init('edit-pincode', 'edit-state', 'edit-city');
 */
const PincodeAutofill = {
    init(pincodeId, stateId, cityId) {
        const pincodeEl = document.getElementById(pincodeId);
        const stateEl   = document.getElementById(stateId);
        const cityEl    = document.getElementById(cityId);
        if (!pincodeEl || !stateEl || !cityEl) return;

        let debounceTimer;
        let manualState = false;
        let manualCity  = false;
        let lastPincode = '';

        // Track manual edits so autofill doesn't overwrite user input
        stateEl.addEventListener('input', () => { manualState = true; });
        cityEl.addEventListener('input',  () => { manualCity  = true; });

        pincodeEl.addEventListener('input', (e) => {
            const pin = e.target.value.replace(/\D/g, '').slice(0, 6);
            e.target.value = pin; // enforce numeric only

            // Reset overrides when pincode changes
            if (pin !== lastPincode) {
                manualState = false;
                manualCity  = false;
                lastPincode = pin;
            }

            this._clearStatus(pincodeEl);

            if (pin.length === 6) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this._fetch(pin, stateEl, cityEl, () => manualState, () => manualCity, pincodeEl);
                }, 500);
            }
        });
    },

    async _fetch(pin, stateEl, cityEl, isManualState, isManualCity, pincodeEl) {
        this._showStatus(pincodeEl, 'loading', 'Fetching location details…');
        try {
            const res  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
            const data = await res.json();
            const po   = data?.[0]?.PostOffice?.[0];

            if (data?.[0]?.Status === 'Success' && po) {
                if (!isManualState()) {
                    stateEl.value = po.State || '';
                    stateEl.dispatchEvent(new Event('input'));
                    this._flash(stateEl);
                }
                if (!isManualCity()) {
                    cityEl.value = po.District || '';
                    cityEl.dispatchEvent(new Event('input'));
                    this._flash(cityEl);
                }
                this._clearStatus(pincodeEl);
            } else {
                this._showStatus(pincodeEl, 'warn', 'Invalid pincode — please fill manually.');
            }
        } catch {
            this._showStatus(pincodeEl, 'warn', 'Service unavailable — please fill manually.');
        }
    },

    _flash(el) {
        el.classList.add('bg-indigo-50');
        setTimeout(() => el.classList.remove('bg-indigo-50'), 1200);
    },

    _showStatus(input, type, msg) {
        this._clearStatus(input);
        const p = document.createElement('p');
        p.className = 'pincode-status text-[11px] font-bold mt-1 ' +
            (type === 'loading' ? 'text-indigo-500 animate-pulse' : 'text-amber-500');
        p.textContent = (type === 'loading' ? '⏳ ' : '⚠️ ') + msg;
        input.parentNode.appendChild(p);
    },

    _clearStatus(input) {
        input.parentNode.querySelectorAll('.pincode-status').forEach(el => el.remove());
    }
};

window.PincodeAutofill = PincodeAutofill;
