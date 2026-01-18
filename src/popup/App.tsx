import { useState, useEffect } from 'react';
import { Search, CheckSquare, Square, Copy, Loader2, AlertCircle } from 'lucide-react';
import { extractEndpoints, generateMarkdown, Endpoint } from '../utils/markdownGenerator';
import type { OpenApiSpec } from '../utils/markdownGenerator';
import { cn } from '../utils/cn';

const App = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [activeTab, setActiveTab] = useState<'select' | 'preview'>('select');

  useEffect(() => {
    loadOpenApiSpec();
  }, []);

  useEffect(() => {
    if (selectedEndpoints.size > 0 && spec) {
      const selected = endpoints.filter(ep => 
        selectedEndpoints.has(`${ep.method}:${ep.path}`)
      );
      const generated = generateMarkdown(spec, selected);
      setMarkdown(generated);
    } else {
      setMarkdown('');
    }
  }, [selectedEndpoints, endpoints, spec]);

  const loadOpenApiSpec = async () => {
    try {
      setLoading(true);
      setError(null);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Check if there are pre-selected endpoints from page
      let preselectedKeys: string[] = [];
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (window.swagDocs && window.swagDocs.getSelections) {
              return window.swagDocs.getSelections();
            }
            return [];
          },
        });
        preselectedKeys = result.result || [];
      } catch (e) {
        console.warn('Could not get selections from content script', e);
      }

      // Get OpenAPI URL from background script
      const response = await chrome.runtime.sendMessage({
        type: 'GET_OPENAPI_URL',
        tabId: tab.id,
      });

      let openApiUrl = response?.openApiUrl;
      let specData: any = null;

      // Try to get spec from content script
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (window.swagDocs && window.swagDocs.getOpenApiSpec) {
              return window.swagDocs.getOpenApiSpec();
            }
            return null;
          },
        });
        specData = result.result;
      } catch (e) {
        console.warn('Could not get spec from content script', e);
      }

      // If no spec from content script, try to fetch from URL
      if (!specData && openApiUrl) {
        const fetchResponse = await chrome.runtime.sendMessage({
          type: 'FETCH_OPENAPI',
          url: openApiUrl,
        });

        if (fetchResponse.success) {
          specData = fetchResponse.data;
        } else {
          throw new Error(fetchResponse.error || 'Failed to fetch OpenAPI spec');
        }
      }

      // If still no spec, try to detect URL from content script
      if (!specData && !openApiUrl) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              if (window.swagDocs && window.swagDocs.detectOpenApiUrl) {
                return window.swagDocs.detectOpenApiUrl();
              }
              return null;
            },
          });
          openApiUrl = result.result;
        } catch (e) {
          console.warn('Could not detect OpenAPI URL', e);
        }

        if (openApiUrl) {
          const fetchResponse = await chrome.runtime.sendMessage({
            type: 'FETCH_OPENAPI',
            url: openApiUrl,
          });

          if (fetchResponse.success) {
            specData = fetchResponse.data;
          } else {
            throw new Error(fetchResponse.error || 'Failed to fetch OpenAPI spec');
          }
        }
      }

      if (!specData) {
        throw new Error('No OpenAPI/Swagger specification found on this page');
      }

      setSpec(specData);
      const extracted = extractEndpoints(specData);
      setEndpoints(extracted);
      
      // Apply pre-selected endpoints
      if (preselectedKeys.length > 0) {
        setSelectedEndpoints(new Set(preselectedKeys));
        setActiveTab('preview');
      }
      
      if (extracted.length === 0) {
        setError('No endpoints found in the OpenAPI specification');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OpenAPI specification');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEndpoint = (endpoint: Endpoint) => {
    const key = `${endpoint.method}:${endpoint.path}`;
    setSelectedEndpoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedEndpoints.size === filteredEndpoints.length) {
      setSelectedEndpoints(new Set());
    } else {
      const allKeys = new Set(filteredEndpoints.map(ep => `${ep.method}:${ep.path}`));
      setSelectedEndpoints(allKeys);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      // You could show a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const filteredEndpoints = endpoints.filter(ep => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ep.path.toLowerCase().includes(query) ||
      ep.method.toLowerCase().includes(query) ||
      ep.operation.summary?.toLowerCase().includes(query) ||
      ep.operation.operationId?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-bg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mx-auto mb-4" />
          <p className="text-dark-text">Loading OpenAPI specification...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-bg p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-dark-text mb-2">Error</h2>
          <p className="text-dark-muted mb-4">{error}</p>
          <button
            onClick={loadOpenApiSpec}
            className="px-4 py-2 bg-neon-cyan text-dark-bg rounded-md hover:bg-neon-blue transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dark-bg text-dark-text">
      {/* Header */}
      <div className="border-b border-dark-border bg-dark-surface px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-neon-cyan">SwagDocs</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('select')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                activeTab === 'select'
                  ? 'bg-neon-cyan text-dark-bg'
                  : 'bg-dark-border hover:bg-dark-border/80 text-dark-text'
              }`}
            >
              Select
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                activeTab === 'preview'
                  ? 'bg-neon-cyan text-dark-bg'
                  : 'bg-dark-border hover:bg-dark-border/80 text-dark-text'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        {activeTab === 'select' && (
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-muted" />
              <input
                type="text"
                placeholder="Search endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-md text-dark-text placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-neon-cyan"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'select' ? (
          <div className="h-full flex flex-col">
            {/* Select All */}
            <div className="border-b border-dark-border px-4 py-2 bg-dark-surface">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm hover:text-neon-cyan transition-colors"
              >
                {selectedEndpoints.size === filteredEndpoints.length && filteredEndpoints.length > 0 ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>
                  {selectedEndpoints.size === filteredEndpoints.length && filteredEndpoints.length > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </span>
                <span className="text-dark-muted">
                  ({selectedEndpoints.size} / {filteredEndpoints.length})
                </span>
              </button>
            </div>

            {/* Endpoints List */}
            <div className="flex-1 overflow-y-auto">
              {filteredEndpoints.length === 0 ? (
                <div className="p-6 text-center text-dark-muted">
                  {searchQuery ? 'No endpoints match your search' : 'No endpoints found'}
                </div>
              ) : (
                <div>
                  {filteredEndpoints.map((endpoint, index) => {
                    const key = `${endpoint.method}:${endpoint.path}`;
                    const isSelected = selectedEndpoints.has(key);
                    return (
                      <div
                        key={key}
                        onClick={() => handleToggleEndpoint(endpoint)}
                        className={cn(
                          'px-4 py-3 cursor-pointer transition-colors hover:bg-dark-surface border-t border-dark-border',
                          isSelected && 'bg-dark-surface border-l-4 border-neon-cyan'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-neon-cyan mt-0.5 flex-shrink-0" />
                          ) : (
                            <Square className="w-5 h-5 text-dark-muted mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                  endpoint.method === 'GET'
                                    ? 'bg-neon-green text-dark-bg'
                                    : endpoint.method === 'POST'
                                    ? 'bg-neon-blue text-dark-bg'
                                    : endpoint.method === 'PUT' || endpoint.method === 'PATCH'
                                    ? 'bg-neon-purple text-dark-bg'
                                    : endpoint.method === 'DELETE'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-dark-border text-dark-text'
                                }`}
                              >
                                {endpoint.method}
                              </span>
                              <span className="text-sm font-mono text-dark-text truncate">
                                {endpoint.path}
                              </span>
                            </div>
                            {endpoint.operation.summary && (
                              <p className="text-xs text-dark-muted line-clamp-1">
                                {endpoint.operation.summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Preview Header */}
            <div className="border-b border-dark-border px-4 py-2 bg-dark-surface flex items-center justify-between">
              <span className="text-sm text-dark-muted">
                {selectedEndpoints.size} endpoint{selectedEndpoints.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyToClipboard}
                  disabled={!markdown}
                  className="flex items-center gap-2 px-3 py-1.5 bg-neon-cyan text-dark-bg rounded text-sm hover:bg-neon-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
              </div>
            </div>

            {/* Markdown Preview */}
            <div className="flex-1 overflow-y-auto p-4">
              {markdown ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-dark-text bg-dark-surface p-4 rounded border border-dark-border">
                  {markdown}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-dark-muted">
                  Select endpoints to generate Markdown documentation
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
