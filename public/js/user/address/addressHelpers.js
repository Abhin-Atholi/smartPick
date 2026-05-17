/**
 * AddressHelpers — wires ValidationHelper + AddressValidators + PincodeAutofill
 * onto both the Add and Edit address forms.
 *
 * Dependencies (loaded before this script):
 *   /js/validation.js          → ValidationHelper, CommonValidators
 *   addressValidation.js       → AddressValidators
 *   pincodeAutofill.js         → PincodeAutofill
 */
(function () {
    function initForm(formId, isEdit) {
        const form = document.getElementById(formId);
        if (!form) return;

        // Attach live validation
        ValidationHelper.attachRealTimeValidation(form, window.AddressValidators);

        // Wire up pincode autofill with explicit element IDs
        const prefix = isEdit ? 'edit-' : 'add-';
        PincodeAutofill.init(
            prefix + 'pincode',
            prefix + 'state',
            prefix + 'city'
        );

        // Submit
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!ValidationHelper.validateForm(form, window.AddressValidators)) return;

            const data       = Object.fromEntries(new FormData(this).entries());
            data.isDefault   = this.querySelector('[name="isDefault"]').checked;
            const submitBtn  = this.querySelector('button[type="submit"]');
            const origText   = submitBtn.textContent;
            const errBox     = document.getElementById(isEdit ? 'editModalError' : 'addModalError');
            errBox.classList.add('hidden');

            try {
                submitBtn.disabled     = true;
                submitBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing`;

                const url    = isEdit ? form.dataset.action : '/account/addresses';
                const method = isEdit ? 'put' : 'post';
                await axios({ method, url, data });
                window.location.reload();
            } catch (err) {
                const errorText = errBox.querySelector('.error-text') || errBox;
                errorText.textContent = err.response?.data?.message || 'Something went wrong';
                errBox.classList.remove('hidden');
                errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } finally {
                submitBtn.disabled    = false;
                submitBtn.innerHTML = origText;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initForm('addAddressForm', false);
        initForm('editAddressForm', true);
    });

    // Globally accessible delete confirmation
    window.confirmDelete = async function (event, addressId) {
        event.preventDefault();

        const result = await Swal.fire({
            title: 'Delete Address?',
            text: 'Are you sure you want to remove this address?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EF4444',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Yes, delete it',
            cancelButtonText: 'Cancel',
            reverseButtons: true
        });

        if (result.isConfirmed) {
            try {
                const res = await axios.delete(`/account/addresses/${addressId}`);
                if (res.data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Deleted!',
                        text: res.data.message || 'Address removed successfully.',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.reload();
                    });
                }
            } catch (err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Oops...',
                    text: err.response?.data?.message || 'Failed to delete address'
                });
            }
        }
    };
})();
