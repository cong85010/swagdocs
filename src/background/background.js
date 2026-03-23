// Track which tabs already have content scripts injected
const injectedTabs = new Set();

// Lightweight detection function — runs in page context to check for Swagger/OpenAPI indicators
const detectSwaggerPage = () => {
  // Check for Swagger UI DOM elements
  if (document.querySelector('.swagger-ui') || document.querySelector('[id*="swagger"]')) {
    return true;
  }

  // Check for common OpenAPI/Swagger link patterns
  const links = document.querySelectorAll('a[href]');
  const patterns = [/\/v2\/api-docs$/i, /\/v3\/api-docs$/i, /\/openapi\.json$/i, /\/swagger\.json$/i, /\/api-docs$/i];
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && patterns.some(p => p.test(href))) return true;
  }

  // Check for Swagger UI global
  if (window.ui && (window.ui.getSystem || window.ui.specSelectors)) {
    return true;
  }

  // Check for OpenAPI JSON in script tags
  const scripts = document.querySelectorAll('script[type="application/json"], script#swagger-data');
  for (const script of scripts) {
    const text = script.textContent;
    if (text && (text.includes('"openapi"') || text.includes('"swagger"'))) return true;
  }

  return false;
};

// Inject content scripts into a tab only if not already injected
const injectContentScripts = async (tabId) => {
  if (injectedTabs.has(tabId)) return;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/content.css'],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js', 'src/content/content-enhanced.js'],
    });
    injectedTabs.add(tabId);
  } catch (e) {
    // Tab may have been closed or is a restricted page (chrome://, etc.)
  }
};

// When a page finishes loading, run a lightweight check and inject if needed
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only care about main frame, not iframes
  if (details.frameId !== 0) return;

  const tabId = details.tabId;

  // Skip chrome:// and other restricted URLs
  if (!details.url || details.url.startsWith('chrome://') || details.url.startsWith('chrome-extension://') || details.url.startsWith('about:')) {
    return;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectSwaggerPage,
    });

    if (result?.result) {
      await injectContentScripts(tabId);
    }
  } catch (e) {
    // Ignore errors for restricted pages
  }
});

// Clean up when tabs are closed or navigated away
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  // Clean up per-tab storage
  chrome.storage.local.remove([`openApiUrl_${tabId}`, `pageUrl_${tabId}`]);
});

// When a tab navigates to a new page, reset injection state
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    injectedTabs.delete(details.tabId);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SWAGDOCS_PAGE_LOADED') {
    // Store the detected OpenAPI URL
    if (message.openApiUrl && sender.tab?.id) {
      chrome.storage.local.set({
        [`openApiUrl_${sender.tab.id}`]: message.openApiUrl,
        [`pageUrl_${sender.tab.id}`]: message.url,
      });
    }
  }

  if (message.type === 'GET_OPENAPI_URL') {
    chrome.storage.local.get([`openApiUrl_${message.tabId}`, `pageUrl_${message.tabId}`], (result) => {
      sendResponse({
        openApiUrl: result[`openApiUrl_${message.tabId}`] || null,
        pageUrl: result[`pageUrl_${message.tabId}`] || null,
      });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'FETCH_OPENAPI') {
    fetch(message.url)
      .then(response => response.json())
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'GENERATE_DOCS') {
    // Open the popup
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }

  // Popup requests injection for the current tab (fallback for manual activation)
  if (message.type === 'ENSURE_CONTENT_SCRIPTS') {
    const tabId = message.tabId;
    injectContentScripts(tabId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
