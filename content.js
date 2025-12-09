// content.js - Injects script into page context and relays messages

// Inject the script file into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
  this.remove();
};

(document.head || document.documentElement).appendChild(script);

console.log('ChatGPT Traffic Parser - Content script loaded and injecting interceptor');

// Listen for risk check requests from injected script (page context)
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  
  // Check if it's a risk check request
  if (event.data && event.data.type === '__ORCHO_CHECK_RISK__') {
    const prompt = event.data.prompt;
    const requestId = event.data.requestId;
    
    try {
      // Forward to background script
      const result = await chrome.runtime.sendMessage({
        action: 'checkRisk',
        prompt: prompt
      });
      
      // Send response back to injected script
      window.postMessage({
        type: '__ORCHO_RISK_RESPONSE__',
        requestId: requestId,
        result: result
      }, '*');
    } catch (error) {
      console.error('Error in content script risk check:', error);
      // Send error response
      window.postMessage({
        type: '__ORCHO_RISK_RESPONSE__',
        requestId: requestId,
        result: {
          level: 'low',
          score: 0,
          details: null
        }
      }, '*');
    }
  }
});