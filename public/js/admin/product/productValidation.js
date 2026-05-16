window.validateAndCollectProductData = function(isEdit = false) {
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;

    // Reset errors
    document.querySelectorAll('.error-text').forEach(el => el.classList.add('hidden'));
    document.getElementById('colorError').classList.add('hidden');
    document.getElementById('variantError').classList.add('hidden');

    let valid = true;
    if (name.length < 2) { 
        document.getElementById('productNameError').textContent = 'Product name must be at least 2 characters.';
        document.getElementById('productNameError').classList.remove('hidden');
        valid = false;
    }
    if (!category) { 
        document.getElementById('productCategoryError').textContent = 'Please select a category.';
        document.getElementById('productCategoryError').classList.remove('hidden');
        valid = false;
    }

    // Collect Colors
    const colorOptions = [];
    const colorSections = document.querySelectorAll('#colorsContainer > div');
    let colorValid = true;
    let hasDefaultColor = false;
    
    colorSections.forEach(sec => {
        const colorId = sec.id;
        const nameInput = sec.querySelector('[data-field="color-name"]');
        const hexInput = sec.querySelector('[data-field="color-hex"]');
        const isDefault = sec.querySelector('input[name="defaultColorRadio"]').checked;
        
        if (isDefault) hasDefaultColor = true;

        if (nameInput && hexInput) {
            const cName = nameInput.value.trim();
            const cHex = hexInput.value.trim();
            
            // Validate individual color fields
            const isNameValid = window.validateColorField(colorId, 'name');
            const isHexValid = window.validateColorField(colorId, 'hex');
            
            if (!isNameValid || !isHexValid) colorValid = false;

            const blobs = window.colorBlobs[colorId] || [];
            const exist = window.colorExistingImages ? (window.colorExistingImages[colorId] || []) : [];
            if ((blobs.length + exist.length) < 3) colorValid = false;
            
            if (isNameValid && isHexValid) {
                colorOptions.push({
                    name: cName,
                    code: cHex,
                    isDefault: isDefault,
                    existingImages: exist,
                    _blobId: colorId
                });
            }
        }
    });

    if (!hasDefaultColor && colorOptions.length > 0) {
        // Enforce exactly one default color if none selected
        colorOptions[0].isDefault = true;
        document.querySelector('input[name="defaultColorRadio"]').checked = true;
    }

    if (colorOptions.length === 0 || !colorValid) {
        document.getElementById('colorError').classList.remove('hidden');
        valid = false;
    }

    // Check for duplicate color selections
    const colorNames = colorOptions.map(c => c.name.toLowerCase());
    if (new Set(colorNames).size !== colorNames.length) {
        Swal.fire('Duplicate Colors', 'You have added the same color name multiple times.', 'warning');
        valid = false;
    }
    const colorHexes = colorOptions.map(c => c.code.toLowerCase());
    if (new Set(colorHexes).size !== colorHexes.length) {
        Swal.fire('Duplicate Colors', 'You have added the same hex code multiple times.', 'warning');
        valid = false;
    }

    // Collect Variants
    const variants = [];
    const variantRows = document.querySelectorAll('#variantsBody tr');
    const variantKeys = new Set();
    let variantsValid = true;
    let variantDuplicate = false;

    variantRows.forEach(row => {
        const size = row.querySelector('[data-field="size"]').value;
        const color = row.querySelector('[data-field="color"]').value;
        const price = parseFloat(row.querySelector('[data-field="price"]').value);
        const stock = parseInt(row.querySelector('[data-field="stock"]').value);

        if (!size || !color || isNaN(price) || price < 1 || isNaN(stock) || stock < 0) {
            variantsValid = false;
            return;
        }

        const key = `${size}-${color.toLowerCase()}`;
        if (variantKeys.has(key)) variantDuplicate = true;
        variantKeys.add(key);

        variants.push({ size, color, price, stock });
    });

    if (variantRows.length === 0 || !variantsValid) {
        document.getElementById('variantError').classList.remove('hidden');
        valid = false;
    }

    if (variantDuplicate) {
        Swal.fire('Duplicate Variants', 'You cannot add the same size and color combination twice.', 'warning');
        valid = false;
    }

    if (!valid) return null;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('brand', document.getElementById('productBrand').value.trim());
    formData.append('category', category);
    formData.append('subcategory', document.getElementById('productSubcategory').value);
    formData.append('description', document.getElementById('productDesc').value.trim());
    formData.append('isActive', document.getElementById('productActive').checked ? 'true' : 'false');
    formData.append('isFeatured', document.getElementById('productFeatured').checked ? 'true' : 'false');
    
    const cleanColorOptions = colorOptions.map(c => ({ name: c.name, code: c.code, isDefault: c.isDefault, existingImages: c.existingImages }));
    if (isEdit) {
        formData.append('removedImages', JSON.stringify(window.removedImages || []));
    }
    formData.append('colorOptions', JSON.stringify(cleanColorOptions));
    formData.append('variants', JSON.stringify(variants));
    
    colorOptions.forEach((col, index) => {
        const blobs = window.colorBlobs[col._blobId] || [];
        blobs.forEach(blob => formData.append(`color_images_${index}`, blob));
    });

    return formData;
};

window.handleProductSubmitError = function(err, btn, originalText) {
    btn.innerHTML = originalText;
    btn.disabled = false;

    if (err.response && err.response.data && err.response.data.errors) {
        const errors = err.response.data.errors;
        
        if (errors.name) {
            const el = document.getElementById('productNameError');
            el.textContent = errors.name;
            el.classList.remove('hidden');
        }
        if (errors.category) {
            const el = document.getElementById('productCategoryError');
            el.textContent = errors.category;
            el.classList.remove('hidden');
        }

        const hasColorError = Object.keys(errors).some(key => key.startsWith('colorOptions'));
        if (hasColorError) {
            const el = document.getElementById('colorError');
            const msg = Object.keys(errors).find(k => k.startsWith('colorOptions')) || 'Color validation failed.';
            el.textContent = errors[msg];
            el.classList.remove('hidden');
        }

        const hasVariantError = Object.keys(errors).some(key => key.startsWith('variants'));
        if (hasVariantError) {
            const el = document.getElementById('variantError');
            const msg = Object.keys(errors).find(k => k.startsWith('variants')) || 'Variant validation failed.';
            el.textContent = errors[msg];
            el.classList.remove('hidden');
        }

        Swal.fire('Validation Failed', 'Please check the form for errors.', 'warning');
    } else {
        Swal.fire('Error!', err.response?.data?.message || 'Something went wrong.', 'error');
    }
};
