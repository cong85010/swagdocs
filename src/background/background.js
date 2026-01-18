chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SWAGDOCS_PAGE_LOADED') {
    // Store the detected OpenAPI URL
    if (message.openApiUrl) {
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
});
