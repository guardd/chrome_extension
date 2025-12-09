// injected.js - Runs in page context to intercept fetch with API risk detection

(function() {
  'use strict';
  
  console.log('ChatGPT & Claude.ai Traffic Parser - Interceptor ready with API Risk Detection');

  // Store original fetch
  const originalFetch = window.fetch;

  // Function to check risk via Orcho Risk Generation API (via background script)
  async function checkRiskLevel(prompt) {
    try {
      const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      
      // Send message to content script via postMessage
      window.postMessage({
        type: '__ORCHO_CHECK_RISK__',
        prompt: prompt,
        requestId: requestId
      }, '*');
      
      // Wait for response from content script
      const response = await new Promise((resolve, reject) => {
        const responseHandler = (event) => {
          if (event.data && event.data.type === '__ORCHO_RISK_RESPONSE__' && event.data.requestId === requestId) {
            window.removeEventListener('message', responseHandler);
            resolve(event.data.result);
          }
        };
        window.addEventListener('message', responseHandler);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          window.removeEventListener('message', responseHandler);
          reject(new Error('Risk check timeout'));
        }, 10000);
      });

      return response;
    } catch (e) {
      console.error('❌ Risk API Error:', e);
      // Default to low risk if API fails
      return {
        level: 'low',
        score: 0,
        details: null
      };
    }
  }

  // Intercept fetch requests
  window.fetch = async function(...args) {
    const [url, options] = args;
    
    // Check for ChatGPT conversation endpoint
    const isChatGPT = url && typeof url === 'string' && 
                      (url.includes('/backend-api/conversation') || url.includes('/backend-api/f/conversation'));
    
    // Check for Claude.ai completion endpoint
    const isClaude = url && typeof url === 'string' && 
                     url.includes('claude.ai/api/') && url.includes('/completion');
    
    if (isChatGPT || isClaude) {
      const platform = isChatGPT ? 'ChatGPT' : 'Claude';
      console.log(`🎯 ${platform} conversation detected!`);
      
      try {
        if (options && options.body) {
          const requestData = JSON.parse(options.body);
          
          // Extract prompt based on platform
          let prompt = '';
          let user = 'unknown';
          let timestamp = 'unknown';
          let model = 'N/A';
          let hasGithubRepos = 'None';
          
          if (isChatGPT) {
            // ChatGPT format
            const message = requestData.messages?.[0] || {};
            user = message.author?.role || 'unknown';
            timestamp = message.create_time ? new Date(message.create_time * 1000).toLocaleString() : 'unknown';
            prompt = message.content?.parts?.[0] || '';
            model = requestData.model || 'N/A';
            const githubRepos = message.metadata?.selected_github_repos || [];
            hasGithubRepos = githubRepos.length > 0 ? `Yes (${githubRepos.length} repos)` : 'None';
          } else if (isClaude) {
            // Claude.ai format
            user = 'user';
            timestamp = new Date().toLocaleString();
            prompt = requestData.prompt || '';
            model = 'Claude';
            
            // Check for attachments/files
            const attachments = requestData.attachments || [];
            const files = requestData.files || [];
            const totalAttachments = attachments.length + files.length;
            hasGithubRepos = totalAttachments > 0 ? `${totalAttachments} attachment(s)` : 'None';
          }
          
          // Only check risk if we have a valid prompt
          if (prompt && prompt.trim().length > 0) {
            console.log('📤 Request Data:', requestData);
            
            // Check risk level via Orcho Risk Generation API
            const riskAssessment = await checkRiskLevel(prompt);
            const riskLevel = riskAssessment.level;
            // Normalize score: if score is less than 1, multiply by 100 (e.g., 0.8 -> 80)
            let riskScore = riskAssessment.score || 0;
            if (riskScore > 0 && riskScore < 1) {
              riskScore = riskScore * 100;
            }
            // Round to nearest integer for display
            riskScore = Math.round(riskScore);
            
            // ONLY show popup for HIGH risk - no popup for low risk
            if (riskLevel === 'high') {
              // BLOCK THE REQUEST BUT ALLOW OVERRIDE
              console.error('🚫 HIGH RISK DETECTED - REQUESTING OVERRIDE');
              
              // Use confirm dialog for override option - ONLY FOR HIGH RISK
              const blockRequest = confirm(`⚠️ HIGH RISK FLAGGED

Platform: ${platform}
Risk Score: ${riskScore}/100

User: ${user}
Time: ${timestamp}
Prompt: ${prompt}
Model: ${model}
Attachments: ${hasGithubRepos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━

Click OK to BLOCK this request
Click CANCEL to OVERRIDE and send anyway`);
              
              if (blockRequest) {
                // User chose to block - return fake response
                console.error('🚫 REQUEST BLOCKED BY USER');
                
                return new Response(
                  JSON.stringify({ error: "High risk request blocked by Orcho Risk Intelligence" }),
                  {
                    status: 403,
                    statusText: 'Forbidden',
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
              } else {
                // User chose to override - allow the request
                console.warn('⚠️ OVERRIDE ACTIVATED - Request allowed despite high risk');
              }
            } else {
              // Low risk - allow request silently, NO POPUP, NO ALERT
              console.log(`✅ LOW RISK - ${platform} request allowed (no popup) - Score: ${riskScore}`);
            }
          } else {
            // No prompt found - allow request to proceed normally
            console.log(`ℹ️ No prompt detected - allowing request to proceed`);
          }
        }
      } catch (e) {
        console.error('Error parsing request:', e);
      }
    }

    // Call original fetch (reached if low risk OR override clicked)
    return originalFetch.apply(this, args);
  };
})();