// background.js - Background service worker

console.log('ChatGPT Traffic Parser - Background script loaded!');

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed successfully');
});

// Orcho Risk Generation API configuration
const RISK_API_ENDPOINT = 'https://app.orcho.ai/risk/api/v1/generate-risk';
const RISK_API_KEY = 'test_key_orcho_12345';

// Function to check risk via Orcho Risk Generation API
async function checkRiskLevel(prompt) {
  try {
    // Safety check: if prompt is empty, return low risk immediately
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      console.log('🔍 Risk Check: Empty prompt -> LOW (no popup)');
      return {
        level: 'low',
        score: 0,
        details: null
      };
    }

    const response = await fetch(RISK_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': RISK_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: prompt })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Map overall_risk_level to 'high' or 'low'
    // ONLY 'high' or 'critical' should be mapped to 'high' - triggers popup
    // Everything else ('low', 'medium', etc.) maps to 'low' - NO POPUP
    const apiRiskLevel = data.overall_risk_level ? data.overall_risk_level.toLowerCase() : 'low';
    const riskLevel = (apiRiskLevel === 'high' || apiRiskLevel === 'critical') ? 'high' : 'low';
    
    // Normalize score: if score is less than 1, multiply by 100 (e.g., 0.8 -> 80)
    let score = data.overall_score || 0;
    if (score > 0 && score < 1) {
      score = score * 100;
    }
    // Round to nearest integer for display
    score = Math.round(score);
    
    const promptPreview = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
    console.log(`🔍 Risk Check: "${promptPreview}" -> ${riskLevel.toUpperCase()} (Score: ${score}/100, API Level: ${apiRiskLevel})`);
    
    // Return both risk level and score for display
    // Only 'high' level will trigger popup in injected.js
    return {
      level: riskLevel,
      score: score,
      details: data
    };
  } catch (e) {
    console.error('❌ Risk API Error:', e);
    // Default to low risk if API fails - NO POPUP
    return {
      level: 'low',
      score: 0,
      details: null
    };
  }
}

// Listen for messages from content/injected scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkRisk') {
    // Handle async operation
    checkRiskLevel(request.prompt).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({
        level: 'low',
        score: 0,
        details: null
      });
    });
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});