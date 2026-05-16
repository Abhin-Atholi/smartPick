window.variantCount = 0;

window.addVariantRow = function(data = {}) {
    window.variantCount++;
    const rowId = `variant-row-${window.variantCount}`;

    const row = document.createElement('tr');
    row.id = rowId;
    row.className = 'border-b border-gray-50 hover:bg-gray-50 transition-colors';
    
    // We expect window.PRODUCT_SIZES to be defined (from module script or injected via EJS)
    const sizes = window.PRODUCT_SIZES || ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];
    const sizeOptions = sizes.map(s => `<option value="${s}" ${data.size === s ? 'selected' : ''}>${s}</option>`).join('');
    
    row.innerHTML = `
        <td class="py-3 pr-3">
          <select class="w-full min-w-[80px] px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer" data-field="size">
            ${sizeOptions}
          </select>
        </td>
        <td class="py-3 pr-3">
          <select class="w-full min-w-[120px] px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer variant-color-select" data-field="color" data-preselected="${data.color || ''}">
            <option value="">Select Color</option>
          </select>
        </td>
        <td class="py-3 pr-3">
          <input type="number" value="${data.price || ''}" placeholder="Price ₹" min="1" class="w-full min-w-[80px] px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" data-field="price">
        </td>
        <td class="py-3 pr-3">
          <input type="number" value="${data.stock || ''}" placeholder="Stock" min="0" class="w-full min-w-[80px] px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100" data-field="stock">
        </td>
        <td class="py-3 text-right">
            <button type="button" onclick="document.getElementById('${rowId}').remove()" class="text-gray-300 hover:text-rose-500 transition font-black text-lg leading-none px-2">✕</button>
        </td>
    `;
    document.getElementById('variantsBody').appendChild(row);
    window.updateVariantColorDropdowns();
};

window.updateVariantColorDropdowns = function() {
    const addedColors = window.getAddedColors();
    const selects = document.querySelectorAll('.variant-color-select');
    
    selects.forEach(select => {
        const currentValue = select.value || select.getAttribute('data-preselected');
        
        select.innerHTML = '<option value="">Select Color</option>' + 
            addedColors.map(c => `<option value="${c.name}" ${currentValue === c.name ? 'selected' : ''}>${c.name}</option>`).join('');
        
        if (currentValue) select.value = currentValue;
    });
};
