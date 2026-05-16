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
                submitBtn.textContent  = isEdit ? 'Updating…' : 'Saving…';

                const url    = isEdit ? form.dataset.action : '/account/addresses';
                const method = isEdit ? 'put' : 'post';
                await axios({ method, url, data });
                window.location.reload();
            } catch (err) {
                errBox.textContent = err.response?.data?.message || 'Something went wrong';
                errBox.classList.remove('hidden');
                errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } finally {
                submitBtn.disabled    = false;
                submitBtn.textContent = origText;
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
