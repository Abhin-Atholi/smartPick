/**
 * SmartFilterManager - Unified Premium Instant Filtering Engine
 * Auto-submits GET forms on input, select, date, or checkbox changes.
 * Handles automatic debounce (700ms) for text search inputs.
 * Automates pagination page=1 reset on filter changes.
 * Adds a modern premium "Clear Filters" button in elegant black styling when active.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Find standard GET filter forms
  const form = document.querySelector('form[method="GET"]');
  if (!form) return;

  // Skip layouts/pages that are not product/admin listing tables
  const path = window.location.pathname;
  const skipPaths = ['/login', '/register', '/checkout', '/cart', '/profile/address', '/payment-failure', '/payment-success'];
  if (skipPaths.some(p => path.startsWith(p)) || path.includes('/details/')) return;

  console.log('SmartFilterManager: Initializing auto-submit filters on', path);

  // Restore input focus & cursor position precisely if search was active before reload
  const focusedInputName = sessionStorage.getItem('smartFilterFocus');
  if (focusedInputName) {
    const input = form.querySelector(`input[name="${focusedInputName}"]`) || form.querySelector('input[name="search"]');
    if (input) {
      input.focus();
      // Move cursor to the end of the current value
      const val = input.value;
      input.value = '';
      input.value = val;
      const len = val.length;
      input.setSelectionRange(len, len);
    }
    sessionStorage.removeItem('smartFilterFocus');
  }

  // 1. Automatically find and hide legacy/redundant Search/Apply buttons inside the form
  const submitBtns = form.querySelectorAll('button[type="submit"], input[type="submit"], button');
  submitBtns.forEach(btn => {
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'search' || text === 'apply' || text === 'filter' || text === 'submit') {
      btn.style.display = 'none';
      btn.classList.add('hidden');
    }
  });

  // Hide legacy clear/reset links to prevent duplicate controls
  const clearLinks = form.querySelectorAll('a');
  clearLinks.forEach(link => {
    const text = link.textContent.trim().toLowerCase();
    if (text === 'clear' || text === 'clear filters' || text === 'reset') {
      link.style.display = 'none';
      link.classList.add('hidden');
    }
  });

  // 2. Debounce Search Input
  let debounceTimeout = null;
  const searchInputs = form.querySelectorAll('input[name="search"], input[placeholder*="search" i], input[placeholder*="Search" i]');
  
  searchInputs.forEach(input => {
    // Add real-time debounce submit
    input.addEventListener('input', () => {
      // Record focus element to session storage to restore it after standard reload
      sessionStorage.setItem('smartFilterFocus', input.name || 'search');
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        submitForm();
      }, 700);
    });

    // Prevent enter key from triggering double submit
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sessionStorage.setItem('smartFilterFocus', input.name || 'search');
        submitForm();
      }
    });
  });

  // 3. Dropdowns (Selects)
  const selects = form.querySelectorAll('select');
  selects.forEach(select => {
    select.addEventListener('change', () => {
      submitForm();
    });
  });

  // 4. Date Inputs
  const dates = form.querySelectorAll('input[type="date"]');
  dates.forEach(date => {
    date.addEventListener('change', () => {
      submitForm();
    });
  });

  // 5. Checkboxes / Radios
  const toggles = form.querySelectorAll('input[type="checkbox"], input[type="radio"]');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      submitForm();
    });
  });

  // Submit Helper with visual feedback and page=1 reset
  function submitForm() {
    // Reset page query to 1
    const pageInput = form.querySelector('input[name="page"]');
    if (pageInput) {
      pageInput.value = '1';
    } else {
      // If no page input, inject a hidden page=1 input so it resets pagination
      const hiddenPage = document.createElement('input');
      hiddenPage.type = 'hidden';
      hiddenPage.name = 'page';
      hiddenPage.value = '1';
      form.appendChild(hiddenPage);
    }

    // Subtle premium loading opacity transition
    const listContainer = document.querySelector('table, #wishlistGrid, #productsGrid, .grid');
    if (listContainer) {
      listContainer.style.opacity = '0.4';
      listContainer.style.transition = 'opacity 0.2s ease-out';
    }

    form.submit();
  }

  // 6. Dedicated premium "Clear Filters" Button
  const urlParams = new URLSearchParams(window.location.search);
  let hasActiveFilter = false;

  // Check if any active filter parameters exist (ignore structural params like page, sort, order)
  for (const [key, val] of urlParams.entries()) {
    if (key !== 'page' && key !== 'sort' && key !== 'order' && val && val !== 'All' && val !== '') {
      hasActiveFilter = true;
      break;
    }
  }

  if (hasActiveFilter) {
    const clearBtn = document.createElement('a');
    clearBtn.href = window.location.pathname; // Strips all query params
    clearBtn.className = "inline-flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0 ml-auto";
    clearBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      Clear Filters
    `;

    // Attempt to place it elegantly in the form itself if it's a flex/grid row, or in the last flex/grid container
    if (form.classList.contains('flex') || form.classList.contains('grid')) {
      form.appendChild(clearBtn);
    } else {
      const flexContainers = form.querySelectorAll('.flex, .grid');
      let placed = false;
      
      if (flexContainers.length > 0) {
        for (let i = flexContainers.length - 1; i >= 0; i--) {
          const container = flexContainers[i];
          if (container.classList.contains('gap-2') || container.classList.contains('gap-3') || container.classList.contains('flex-wrap')) {
            container.appendChild(clearBtn);
            placed = true;
            break;
          }
        }
      }
      
      if (!placed) {
        // Default fallback: place directly inside the form at the end
        form.appendChild(clearBtn);
      }
    }
  }
});
