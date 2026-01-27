(function () {
  'use strict';

  const STORAGE_KEY = 'swagdocs_selections';
  const selectedEndpoints = new Set();

  // Inject CSS
  const injectCSS = () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/content/content.css');
    document.head.appendChild(link);
  };

  // Create floating toolbar
  const createToolbar = () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'swagdocs-toolbar hidden';
    toolbar.id = 'swagdocs-toolbar';
    toolbar.innerHTML = `
      <span class="swagdocs-toolbar-text">
        <span class="swagdocs-toolbar-count">0</span> endpoints selected
      </span>
      <button class="swagdocs-toolbar-button" id="swagdocs-generate">
        Generate Docs
      </button>
      <button class="swagdocs-toolbar-button" id="swagdocs-clear">
        Clear All
      </button>
      <button class="swagdocs-toolbar-close" id="swagdocs-close">×</button>
    `;
    document.body.appendChild(toolbar);

    // Event listeners
    document.getElementById('swagdocs-generate').addEventListener('click', () => {
      try {
        // Open popup by clicking the extension icon programmatically
        chrome.runtime.sendMessage({
          type: 'GENERATE_DOCS',
          selections: Array.from(selectedEndpoints)
        }).catch(err => {
             // Catch both 'Failed to open popup' and 'Browser window has no toolbar'
             if (err.message && (err.message.includes('Failed to open popup') || err.message.includes('toolbar'))) {
                 alert('Could not open the SwagDocs popup. Please click the extension icon manually.');
             }
        });
      } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
          alert('Extension updated. Please refresh the page.');
        } else {
          console.error(error);
        }
      }
    });

    document.getElementById('swagdocs-clear').addEventListener('click', clearAllSelections);
    document.getElementById('swagdocs-close').addEventListener('click', () => {
      toolbar.classList.add('hidden');
    });

    return toolbar;
  };

  // Update toolbar count
  const updateToolbar = () => {
    const toolbar = document.getElementById('swagdocs-toolbar');
    if (!toolbar) return;

    const count = selectedEndpoints.size;
    const countElement = toolbar.querySelector('.swagdocs-toolbar-count');
    if (countElement) {
      countElement.textContent = count;
    }

    if (count > 0) {
      toolbar.classList.remove('hidden');
    } else {
      toolbar.classList.add('hidden');
    }
  };

  // Save selections to storage
  const saveSelections = () => {
    const selections = Array.from(selectedEndpoints);
    chrome.storage.local.set({ [STORAGE_KEY]: selections });
  };

  // Load selections from storage
  const loadSelections = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const selections = result[STORAGE_KEY] || [];
        selections.forEach(key => selectedEndpoints.add(key));
        resolve();
      });
    });
  };

  // Clear all selections
  const clearAllSelections = () => {
    selectedEndpoints.clear();
    saveSelections();

    // Update all checkboxes
    document.querySelectorAll('.swagdocs-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });

    // Remove selected styling from all operations
    document.querySelectorAll('.swagdocs-operation').forEach(element => {
      element.classList.remove('swagdocs-selected');
    });

    updateToolbar();
  };

  // Toggle endpoint selection
  const toggleEndpoint = (key, checkbox, operationElement) => {
    if (selectedEndpoints.has(key)) {
      selectedEndpoints.delete(key);
      checkbox.checked = false;
      operationElement.classList.remove('swagdocs-selected');
    } else {
      selectedEndpoints.add(key);
      checkbox.checked = true;
      operationElement.classList.add('swagdocs-selected');
    }

    saveSelections();
    updateToolbar();
  };

  // Add checkboxes to Swagger UI operations
  const addCheckboxes = () => {
    // Find all operation blocks (Swagger UI structure)
    const operations = document.querySelectorAll('.opblock:not(.swagdocs-operation)');

    operations.forEach(operation => {
      // Mark as processed
      operation.classList.add('swagdocs-operation');

      // Extract endpoint info
      const pathElement = operation.querySelector('.opblock-summary-path');
      const methodElement = operation.querySelector('.opblock-summary-method');

      if (!pathElement || !methodElement) return;

      const path = pathElement.textContent.trim();
      const method = methodElement.textContent.trim().toUpperCase();
      const key = `${method}:${path}`;

      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'swagdocs-checkbox';
      checkbox.checked = selectedEndpoints.has(key);

      // Add to operation summary
      const summary = operation.querySelector('.opblock-summary');
      if (summary) {
        summary.style.position = 'relative';
        summary.insertBefore(checkbox, summary.firstChild);

        // If already selected, apply styling
        if (checkbox.checked) {
          operation.classList.add('swagdocs-selected');
        }

        // Add click handler
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleEndpoint(key, checkbox, operation);
        });
      }
    });

    // Also re-verify state of existing checkboxes
    document.querySelectorAll('.swagdocs-checkbox').forEach(checkbox => {
      const op = checkbox.closest('.swagdocs-operation');
      if (op) {
        const pathElement = op.querySelector('.opblock-summary-path');
        const methodElement = op.querySelector('.opblock-summary-method');
        if (pathElement && methodElement) {
          const key = `${methodElement.textContent.trim().toUpperCase()}:${pathElement.textContent.trim()}`;
          const shouldBeChecked = selectedEndpoints.has(key);
          if (checkbox.checked !== shouldBeChecked) {
            checkbox.checked = shouldBeChecked;
            if (shouldBeChecked) op.classList.add('swagdocs-selected');
            else op.classList.remove('swagdocs-selected');
          }
        }
      }
    });
  };

  // Observe DOM changes to add checkboxes to dynamically loaded operations
  const observeDOM = () => {
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 &&
            (node.classList?.contains('opblock') ||
              node.querySelector?.('.opblock'))) {
            shouldUpdate = true;
          }
        });
      });

      if (shouldUpdate) {
        addCheckboxes();
      }
    });


    // Observe body for max coverage as Swagger UI can be anywhere
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  // Initialize
  const init = async () => {
    // Check if this is a Swagger UI page
    const isSwaggerPage = document.querySelector('.swagger-ui') ||
      document.querySelector('[id*="swagger"]') ||
      window.ui;

    if (!isSwaggerPage) return;

    // Load saved selections
    await loadSelections();

    // Inject CSS
    injectCSS();

    // Create toolbar
    createToolbar();

    // Add checkboxes to existing operations
    setTimeout(() => {
      addCheckboxes();
      updateToolbar();
    }, 1000);

    // Observe for new operations
    observeDOM();
  };

  // Wait for page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SELECTIONS') {
      sendResponse({
        selections: Array.from(selectedEndpoints)
      });
    }

    if (message.type === 'CLEAR_SELECTIONS') {
      clearAllSelections();
      sendResponse({ success: true });
    }
  });

  // Export functions for popup access
  window.swagDocs = window.swagDocs || {};
  window.swagDocs.getSelections = () => Array.from(selectedEndpoints);
  window.swagDocs.clearSelections = clearAllSelections;
})();
