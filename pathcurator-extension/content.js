// Content script for PathCurator extension
// This script runs on every page to enhance the sharing experience

(function() {
  'use strict';

  // Only run once per page
  if (window.pathCuratorExtensionLoaded) {
    return;
  }
  window.pathCuratorExtensionLoaded = true;

  let isPathCuratorSite = false;

  // Check if we're on a PathCurator site
  function checkIfPathCuratorSite() {
    const hostname = window.location.hostname;
    return hostname === 'pathcurator.com' || 
           hostname === 'www.pathcurator.com' ||
           hostname === 'localhost' ||
           hostname.includes('pathcurator');
  }

  // Initialize extension features
  function init() {
    isPathCuratorSite = checkIfPathCuratorSite();
    
    // Add keyboard shortcut listener
    addKeyboardShortcuts();
    
    // Add visual feedback for shareable content
    if (!isPathCuratorSite) {
      addVisualFeedback();
    }
    
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // Add keyboard shortcuts
  function addKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl+Shift+P (or Cmd+Shift+P on Mac) to share to PathCurator
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        shareCurrentPage();
      }
    });
  }

  // Add visual feedback for content that can be shared
  function addVisualFeedback() {
    // Add subtle visual indicators for links and articles
    const style = document.createElement('style');
    style.textContent = `
      .pathcurator-highlight {
        outline: 2px dashed #0d6efd !important;
        outline-offset: 2px !important;
        background-color: rgba(13, 110, 253, 0.1) !important;
        transition: all 0.3s ease !important;
      }
      
      .pathcurator-tooltip {
        position: absolute;
        background: #333;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .pathcurator-tooltip.show {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  // Share current page to PathCurator
  async function shareCurrentPage() {
    try {
      // Get page metadata
      const pageData = getPageMetadata();
      
      // Get extension settings
      const response = await chrome.runtime.sendMessage({
        action: 'getSettings'
      });
      
      const baseUrl = response?.pathcuratorUrl || 'https://pathcurator.com';
      
      // Create bookmarklet URL
      const bookmarkletUrl = `${baseUrl}/bookmarklet.html?` + 
        `url=${encodeURIComponent(pageData.url)}&` +
        `title=${encodeURIComponent(pageData.title)}&` +
        `description=${encodeURIComponent(pageData.description)}&` +
        `source=extension-shortcut`;

      // Open in new tab
      window.open(bookmarkletUrl, '_blank');
      
      // Show confirmation if notifications are enabled
      showNotification('Sharing to PathCurator...', 'success');
      
    } catch (error) {
      console.error('Error sharing page:', error);
      showNotification('Failed to share page', 'error');
    }
  }

  // Extract page metadata
  function getPageMetadata() {
    const title = document.title || 'Untitled Page';
    const url = window.location.href;
    
    // Try to get description from meta tags
    let description = '';
    const metaDesc = document.querySelector('meta[name="description"]');
    const metaOgDesc = document.querySelector('meta[property="og:description"]');
    
    if (metaDesc) {
      description = metaDesc.getAttribute('content') || '';
    } else if (metaOgDesc) {
      description = metaOgDesc.getAttribute('content') || '';
    }
    
    // If no meta description, try to extract from first paragraph
    if (!description) {
      const firstP = document.querySelector('article p, main p, .content p, p');
      if (firstP && firstP.textContent) {
        description = firstP.textContent.substring(0, 200) + '...';
      }
    }

    return {
      title: title.trim(),
      url: url,
      description: description.trim()
    };
  }

  // Handle messages from extension
  function handleMessage(request, sender, sendResponse) {
    if (request.action === 'getPageData') {
      const pageData = getPageMetadata();
      sendResponse(pageData);
    }
    
    if (request.action === 'shareToPathCurator') {
      shareCurrentPage();
      sendResponse({ success: true });
    }
  }

  // Show notification to user
  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#dc3545' : '#0d6efd'};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose sharing function globally for testing
  window.shareToPathCurator = shareCurrentPage;

})();