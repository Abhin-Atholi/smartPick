// Shared State (must be accessible by submit forms)
window.colorCount = 0;
window.colorBlobs = {};
window.colorExistingImages = {}; 
window.activeColorUploadId = null;
window.removedImages = []; // only used in edit, but safe to init here

function suggestColorName(hex) {
    // Basic mapping
    const colors = {
        '#000000': 'Black', '#ffffff': 'White', '#ff0000': 'Red', '#00ff00': 'Green', '#0000ff': 'Blue',
        '#ffff00': 'Yellow', '#00ffff': 'Cyan', '#ff00ff': 'Magenta', '#808080': 'Gray', '#c0c0c0': 'Silver',
        '#800000': 'Maroon', '#808000': 'Olive', '#008000': 'Dark Green', '#800080': 'Purple', '#008080': 'Teal',
        '#000080': 'Navy', '#ffa500': 'Orange', '#a52a2a': 'Brown', '#ffc0cb': 'Pink', '#1e3a8a': 'Navy Blue',
        '#ef4444': 'Red', '#3b82f6': 'Blue', '#22c55e': 'Green', '#eab308': 'Yellow', '#f97316': 'Orange',
        '#a855f7': 'Purple', '#6b7280': 'Grey', '#111827': 'Dark Gray', '#f3f4f6': 'Light Gray'
    };
    return colors[hex.toLowerCase()] || '';
}

window.addColorSection = function(existingData = null) {
    const colorId = `color-section-${window.colorCount}`;
    window.colorBlobs[colorId] = [];
    
    let defaultHex = '#000000';
    let defaultName = '';
    
    if (existingData) {
        defaultHex = existingData.code || '#000000';
        defaultName = existingData.name || '';
        window.colorExistingImages[colorId] = existingData.images ? [...existingData.images] : [];
    } else {
        window.colorExistingImages[colorId] = [];
    }

    const div = document.createElement('div');
    div.id = colorId;
    div.className = 'border border-gray-200 rounded-2xl p-5 bg-white shadow-sm relative group transition-all duration-300 hover:shadow-md hover:border-indigo-200';

    div.innerHTML = `
        <div class="flex flex-col md:flex-row items-start gap-5 mb-5">
            
            <!-- Color Inputs -->
            <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                <!-- Color Name -->
                <div>
                    <label class="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Color Name <span class="text-rose-500">*</span></label>
                    <input type="text" data-field="color-name" value="${defaultName}" placeholder="e.g. Midnight Blue"
                        class="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                        onkeyup="validateColorField('${colorId}', 'name')" onchange="updateVariantColorDropdowns()">
                    <p class="error-text text-rose-500 text-[10px] font-bold mt-1.5 hidden" data-error="name"></p>
                </div>

                <!-- Hex Code -->
                <div>
                    <label class="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Hex Code <span class="text-rose-500">*</span></label>
                    <div class="flex items-center gap-2">
                        <div class="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm shrink-0 w-11 h-11">
                            <input type="color" data-field="color-picker" value="${defaultHex}"
                                class="absolute -top-2 -left-2 w-16 h-16 cursor-pointer border-0 p-0"
                                oninput="syncColor('${colorId}', 'picker')">
                        </div>
                        <input type="text" data-field="color-hex" value="${defaultHex}" placeholder="#FFFFFF"
                            class="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all uppercase"
                            onkeyup="syncColor('${colorId}', 'hex')" maxlength="7">
                    </div>
                    <p class="error-text text-rose-500 text-[10px] font-bold mt-1.5 hidden" data-error="hex"></p>
                </div>
            </div>

            <!-- Preview & Actions -->
            <div class="flex flex-row md:flex-col items-center gap-4 mt-2 md:mt-0 md:ml-2 md:pl-5 md:border-l border-gray-100 h-full w-full md:w-auto justify-between md:justify-start">
                
                <div class="flex items-center gap-5">
                    <!-- Live Preview Circle -->
                    <div class="flex flex-col items-center justify-center">
                        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Preview</label>
                        <div class="w-11 h-11 rounded-full border-4 border-gray-50 shadow-sm color-preview transition-colors duration-300 relative" style="background-color: ${defaultHex};">
                            <div class="absolute inset-0 rounded-full ring-1 ring-inset ring-black/10"></div>
                        </div>
                    </div>

                    <!-- Set Default -->
                    <div class="flex flex-col justify-center pt-3">
                        <label class="flex items-center gap-2 cursor-pointer group/radio">
                            <div class="relative flex items-center justify-center">
                                <input type="radio" name="defaultColorRadio" class="peer sr-only" value="${colorId}" ${existingData && existingData.isDefault ? 'checked' : (!existingData && window.colorCount === 0 ? 'checked' : '')}>
                                <div class="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-indigo-600 peer-checked:bg-indigo-600 transition-all bg-white shadow-sm"></div>
                                <svg class="w-3 h-3 text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                                </svg>
                            </div>
                            <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover/radio:text-indigo-600 transition-colors">Default</span>
                        </label>
                    </div>
                </div>
                
                <button type="button" onclick="removeColorSection('${colorId}')" class="md:absolute -top-3 -right-3 w-8 h-8 bg-white text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-full border border-gray-200 shadow-md transition-all font-black text-sm flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 z-10">✕</button>
            </div>

        </div>

        <!-- EyeDropper Action -->
        <div class="mb-5 pb-5 border-b border-gray-100">
             <button type="button" onclick="activateEyeDropper('${colorId}')" class="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors border border-slate-200 active:scale-95">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                Pick From Image / Screen
            </button>
            <p class="text-[10px] text-rose-500 font-bold mt-2 eyedropper-fallback hidden">EyeDropper API is not supported in your browser.</p>
        </div>

        <!-- Image Upload Zone -->
        <div class="bg-gray-50/50 border border-dashed border-gray-300 rounded-xl p-4 transition-colors hover:border-indigo-300 group/zone">
            <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Color Images <span class="text-rose-500">*</span>
                </h4>
                <span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 shadow-sm">Min 3 Images</span>
            </div>
            
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-200">
                <div class="w-28 h-28 bg-white border-2 border-dashed border-indigo-100 rounded-xl flex flex-col items-center justify-center hover:bg-indigo-50 hover:border-indigo-300 transition cursor-pointer flex-shrink-0 group/upload" onclick="triggerColorUpload('${colorId}')">
                    <svg class="w-8 h-8 text-indigo-300 group-hover/upload:text-indigo-500 group-hover/upload:-translate-y-1 transition-all mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    <span class="text-[10px] font-black text-indigo-500 uppercase tracking-widest group-hover/upload:text-indigo-600">Upload</span>
                </div>
                
                <div id="grid-${colorId}" class="flex gap-3 auto-rows-max">
                    <!-- Previews go here -->
                </div>
            </div>
            <input type="file" id="file-${colorId}" accept="image/*" multiple class="hidden" onchange="handleColorFiles(event, '${colorId}')">
        </div>
    `;
    document.getElementById('colorsContainer').appendChild(div);
    window.colorCount++;
    
    if (existingData) {
        window.redrawColorImages(colorId);
    }
    
    window.updateVariantColorDropdowns();
};

window.syncColor = function(colorId, source) {
    const section = document.getElementById(colorId);
    if (!section) return;
    const hexInput = section.querySelector('[data-field="color-hex"]');
    const pickerInput = section.querySelector('[data-field="color-picker"]');
    const nameInput = section.querySelector('[data-field="color-name"]');
    const preview = section.querySelector('.color-preview');
    
    let hex = '';
    if (source === 'hex') {
        hex = hexInput.value;
        if (!hex.startsWith('#') && hex.length > 0) {
            hex = '#' + hex;
        }
        if (/^#[0-9A-F]{6}$/i.test(hex) || /^#[0-9A-F]{3}$/i.test(hex)) {
            pickerInput.value = hex.length === 4 ? '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
            preview.style.backgroundColor = pickerInput.value;
            
            const suggested = suggestColorName(pickerInput.value);
            if (suggested && !nameInput.value) {
                nameInput.value = suggested;
                window.updateVariantColorDropdowns();
            }
        }
    } else if (source === 'picker') {
        hex = pickerInput.value.toUpperCase();
        hexInput.value = hex;
        preview.style.backgroundColor = hex;
        
        const suggested = suggestColorName(hex);
        if (suggested) {
            nameInput.value = suggested;
            window.updateVariantColorDropdowns();
        }
    } else if (source === 'eyedropper') {
        hex = pickerInput.value.toUpperCase();
        hexInput.value = hex;
        preview.style.backgroundColor = hex;
        
        const suggested = suggestColorName(hex);
        if (suggested) {
            nameInput.value = suggested;
        }
        window.updateVariantColorDropdowns();
        window.validateColorField(colorId, 'hex');
    }
    
    window.validateColorField(colorId, 'hex');
};

window.activateEyeDropper = async function(colorId) {
    const section = document.getElementById(colorId);
    const fallbackMsg = section.querySelector('.eyedropper-fallback');
    
    if (!window.EyeDropper) {
        fallbackMsg.classList.remove('hidden');
        return;
    }
    
    try {
        const eyeDropper = new window.EyeDropper();
        const btn = section.querySelector('button[onclick^="activateEyeDropper"]');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg> Picking...';
        
        const result = await eyeDropper.open();
        
        btn.innerHTML = '<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Picked!';
        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 2000);
        
        const pickerInput = section.querySelector('[data-field="color-picker"]');
        pickerInput.value = result.sRGBHex;
        window.syncColor(colorId, 'eyedropper');
        
    } catch (e) {
        console.log('EyeDropper canceled or failed', e);
        const btn = section.querySelector('button[onclick^="activateEyeDropper"]');
        btn.innerHTML = '<svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> Pick From Image / Screen';
    }
};

window.validateColorField = function(colorId, type) {
    const section = document.getElementById(colorId);
    if (!section) return true;
    
    const input = section.querySelector(type === 'name' ? '[data-field="color-name"]' : '[data-field="color-hex"]');
    const errorEl = section.querySelector(`[data-error="${type}"]`);
    
    let isValid = true;
    let errorMsg = '';
    
    if (type === 'name') {
        const val = input.value.trim();
        if (!val) { isValid = false; errorMsg = 'Color name is required'; }
        else if (val.length < 2) { isValid = false; errorMsg = 'Min 2 characters'; }
    } else if (type === 'hex') {
        const val = input.value.trim();
        if (!val) { isValid = false; errorMsg = 'Hex code is required'; }
        else if (!/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(val)) { isValid = false; errorMsg = 'Invalid hex format (e.g. #FFFFFF)'; }
    }
    
    if (!isValid) {
        input.classList.add('border-rose-500', 'focus:ring-rose-200');
        input.classList.remove('border-gray-200', 'focus:ring-indigo-100');
        errorEl.textContent = errorMsg;
        errorEl.classList.remove('hidden');
    } else {
        input.classList.remove('border-rose-500', 'focus:ring-rose-200');
        input.classList.add('border-gray-200', 'focus:ring-indigo-100');
        errorEl.classList.add('hidden');
    }
    
    return isValid;
};

window.removeColorSection = function(colorId) {
    delete window.colorBlobs[colorId];
    delete window.colorExistingImages[colorId];
    document.getElementById(colorId)?.remove();
    window.updateVariantColorDropdowns();
};

window.getAddedColors = function() {
    const colors = [];
    const sections = document.querySelectorAll('#colorsContainer > div');
    sections.forEach(sec => {
        const nameInput = sec.querySelector('[data-field="color-name"]');
        const hexInput = sec.querySelector('[data-field="color-hex"]');
        const isDefault = sec.querySelector('input[name="defaultColorRadio"]').checked;
        
        if (nameInput && hexInput) {
            const name = nameInput.value.trim();
            const hex = hexInput.value.trim();
            if (name && /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(hex)) {
                // Ensure no duplicate name returned here, or we flag it later
                colors.push({ name, code: hex, isDefault, id: sec.id });
            }
        }
    });
    return colors;
};

// Expose image handling hooks that were in HTML
window.triggerColorUpload = function(colorId) {
    window.activeColorUploadId = colorId;
    document.getElementById(`file-${colorId}`).click();
};

window.removeExistingColorImage = function(colorId, index, url) {
    window.removedImages.push(url);
    window.colorExistingImages[colorId].splice(index, 1);
    window.redrawColorImages(colorId);
};

window.removeColorImage = function(colorId, index) {
    if (window.colorBlobs[colorId]) {
        window.colorBlobs[colorId].splice(index, 1);
        window.redrawColorImages(colorId);
    }
};

window.redrawColorImages = function(colorId) {
    const grid = document.getElementById(`grid-${colorId}`);
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const existImages = window.colorExistingImages[colorId] || [];
    existImages.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'relative w-28 h-28 rounded-xl overflow-hidden border border-gray-200 shadow-sm group flex-shrink-0';
        div.innerHTML = `
            <img src="${url}" class="w-full h-full object-cover">
            <button type="button" onclick="removeExistingColorImage('${colorId}', ${index}, '${url}')"
                class="absolute top-1 right-1 w-6 h-6 bg-rose-500/90 hover:bg-rose-600 text-white rounded-full text-xs font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm backdrop-blur-sm">✕</button>
        `;
        grid.appendChild(div);
    });

    const blobs = window.colorBlobs[colorId] || [];
    blobs.forEach((blob, index) => {
        const src = URL.createObjectURL(blob);
        const div = document.createElement('div');
        div.className = 'relative w-28 h-28 rounded-xl overflow-hidden border-2 border-indigo-200 shadow-sm group flex-shrink-0';
        div.innerHTML = `
            <img src="${src}" class="w-full h-full object-cover">
            <button type="button" onclick="removeColorImage('${colorId}', ${index})"
                class="absolute top-1 right-1 w-6 h-6 bg-rose-500/90 hover:bg-rose-600 text-white rounded-full text-xs font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm backdrop-blur-sm">✕</button>
        `;
        grid.appendChild(div);
    });
};

window.pendingFiles = [];
window.pendingIndex = 0;

window.handleColorFiles = function(e, colorId) {
    const files = Array.from(e.target.files);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    
    let validFiles = [];
    for (const file of files) {
        if (!validTypes.includes(file.type)) {
            Swal.fire('Invalid File', `"${file.name}" is not a valid image. Please select JPG, PNG, or WEBP.`, 'error');
            continue;
        }
        if (file.size > 2 * 1024 * 1024) {
            Swal.fire('File Too Large', `Image "${file.name}" exceeds the 2MB limit.`, 'warning');
            continue;
        }
        validFiles.push(file);
    }

    window.pendingFiles = validFiles;
    window.pendingIndex = 0;
    e.target.value = ''; 
    if (window.pendingFiles.length > 0) window.processNextPendingFile();
};

window.processNextPendingFile = async function() {
    if (window.pendingIndex >= window.pendingFiles.length) return;
    const file = window.pendingFiles[window.pendingIndex];
    window.pendingIndex++;
    
    try {
        const croppedFile = await cropImage(file); 
        if (window.activeColorUploadId && window.colorBlobs[window.activeColorUploadId]) {
            window.colorBlobs[window.activeColorUploadId].push(croppedFile);
            window.redrawColorImages(window.activeColorUploadId);
        }
    } catch (err) {
        console.log('Skipped cropping for', file.name);
    }
    
    window.processNextPendingFile(); 
};
