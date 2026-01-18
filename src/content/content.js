(function() {
  'use strict';

  const detectOpenApiUrl = () => {
    // Search for common OpenAPI/Swagger endpoints in links
    const links = Array.from(document.querySelectorAll('a[href]'));
    const openApiPatterns = [
      /\/v2\/api-docs$/i,
      /\/v3\/api-docs$/i,
      /\/openapi\.json$/i,
      /\/swagger\.json$/i,
      /\/api-docs$/i,
    ];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && openApiPatterns.some(pattern => pattern.test(href))) {
        const url = new URL(href, window.location.origin);
        return url.href;
      }
    }

    // Check window.ui.spec (Swagger UI)
    if (window.ui && window.ui.spec && window.ui.specSelectors) {
      const spec = window.ui.specSelectors.specJson();
      if (spec && spec.url) {
        return spec.url;
      }
      if (spec && Object.keys(spec).length > 0) {
        // If spec is already loaded, store it
        return window.location.href;
      }
    }

    // Check for Swagger UI JSON data
    if (window.ui && window.ui.getSystem) {
      try {
        const system = window.ui.getSystem();
        if (system && system.spec && system.spec.selectors) {
          const specJson = system.spec.selectors.specJson();
          if (specJson) {
            return window.location.href;
          }
        }
      } catch (e) {
        console.warn('SwagDocs: Could not access Swagger UI system', e);
      }
    }

    // Check page content for OpenAPI JSON
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      if (script.type === 'application/json' || script.id === 'swagger-data') {
        const data = script.textContent;
        if (data && (data.includes('openapi') || data.includes('swagger'))) {
          return window.location.href;
        }
      }
    }

    return null;
  };

  const getOpenApiSpec = () => {
    // Try to get spec from window.ui (Swagger UI)
    if (window.ui && window.ui.getSystem) {
      try {
        const system = window.ui.getSystem();
        if (system && system.spec && system.spec.selectors) {
          const specJson = system.spec.selectors.specJson();
          if (specJson && specJson.get && typeof specJson.get === 'function') {
            return specJson.get('json');
          }
          if (specJson && typeof specJson === 'object' && !specJson.get) {
            return specJson;
          }
        }
      } catch (e) {
        console.warn('SwagDocs: Could not extract spec from Swagger UI', e);
      }
    }

    // Fallback: return null, popup will fetch from URL
    return null;
  };

  // Store functions in window for popup access
  window.swagDocs = {
    detectOpenApiUrl,
    getOpenApiSpec,
  };

  // Send message to background script when page loads
  if (chrome && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'SWAGDOCS_PAGE_LOADED',
      url: window.location.href,
      openApiUrl: detectOpenApiUrl(),
    });
  }
})();
