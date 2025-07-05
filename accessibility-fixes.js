/**
 * Curator Accessibility Improvements
 * 
 * This script applies key accessibility improvements to the Curator extension.
 * It should be loaded after the main application script.
 */

// Add skip link to all pages
document.addEventListener('DOMContentLoaded', function() {
  // Only add if not already present
  if (!document.querySelector('.skip-link')) {
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link visually-hidden-focusable';
    skipLink.textContent = 'Skip to main content';
    
    // Style the skip link
    skipLink.style.position = 'absolute';
    skipLink.style.top = '0';
    skipLink.style.left = '0';
    skipLink.style.padding = '0.5rem';
    skipLink.style.backgroundColor = '#fff';
    skipLink.style.zIndex = '9999';
    
    // Add to the beginning of the body
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Find main content and add ID if not present
    const main = document.querySelector('main') || document.querySelector('#pathwayList') || document.querySelector('#stepsList');
    if (main && !main.id) {
      main.id = 'main-content';
    }
  }

  // Add aria-hidden to all icon-only elements
  document.querySelectorAll('.bi, .fa').forEach(icon => {
    if (!icon.hasAttribute('aria-hidden')) {
      icon.setAttribute('aria-hidden', 'true');
    }
  });

  // Improve buttons with only icons - add aria-label if missing
  document.querySelectorAll('button').forEach(button => {
    // Check if button only contains an icon and no text
    if (button.querySelector('.bi, .fa') && 
        button.textContent.trim() === '' &&
        !button.hasAttribute('aria-label')) {
      
      // Use title as aria-label if available
      if (button.hasAttribute('title')) {
        button.setAttribute('aria-label', button.getAttribute('title'));
      }
    }
  });

  // Add ARIA roles to pathway and step lists
  const pathwayList = document.getElementById('pathwayList');
  if (pathwayList) {
    pathwayList.setAttribute('role', 'list');
    pathwayList.querySelectorAll('li').forEach(item => {
      item.setAttribute('role', 'listitem');
    });
  }

  // Add enhanced keyboard focus styles
  const style = document.createElement('style');
  style.textContent = `
    :focus-visible {
      outline: 2px solid #0d6efd !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25) !important;
    }
    
    /* Make skip link more visible when focused */
    .skip-link:focus {
      position: fixed !important;
      clip: auto !important;
      height: auto !important;
      width: auto !important;
      overflow: visible !important;
    }
    
    /* Improve button focus states */
    .btn:focus-visible {
      outline: 2px solid #0d6efd !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

  // Add aria-live regions for dynamic content
  const searchResultsMessage = document.getElementById('searchResultsMessage');
  if (searchResultsMessage && !searchResultsMessage.hasAttribute('aria-live')) {
    searchResultsMessage.setAttribute('aria-live', 'polite');
  }

  // For HTML exports: improve launch buttons with better context
  document.querySelectorAll('.launch-btn').forEach(btn => {
    const titleElement = btn.closest('.activity-container')?.querySelector('h3');
    if (titleElement) {
      const title = titleElement.textContent.trim();
      btn.setAttribute('aria-label', `Launch ${title} (opens in new tab)`);
    }
  });

  // Make details/summary elements more accessible
  document.querySelectorAll('details').forEach(details => {
    const summary = details.querySelector('summary');
    if (summary) {
      // Make sure it's keyboard focusable
      summary.setAttribute('tabindex', '0');
      
      // Add appropriate role
      summary.setAttribute('role', 'button');
      
      // Add aria-expanded state to reflect open/closed state
      summary.setAttribute('aria-expanded', details.hasAttribute('open') ? 'true' : 'false');
      
      // Update aria-expanded when toggled
      details.addEventListener('toggle', () => {
        summary.setAttribute('aria-expanded', details.hasAttribute('open') ? 'true' : 'false');
      });
    }
  });

  // Add proper labels to file inputs
  const fileInput = document.getElementById('fileInput');
  if (fileInput && !fileInput.hasAttribute('aria-label')) {
    fileInput.setAttribute('aria-label', 'Import JSON file');
  }

  // Make progress bars more accessible
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    // Ensure it has all required ARIA attributes
    if (!progressBar.hasAttribute('role')) {
      progressBar.setAttribute('role', 'progressbar');
    }
    
    // Make sure parent container has accessible label
    const progressContainer = progressBar.closest('.progress-container');
    if (progressContainer && !progressContainer.hasAttribute('aria-label')) {
      progressContainer.setAttribute('aria-label', 'Pathway completion progress');
    }
  }
});

// Global handler for creating accessible notifications
window.showAccessibleNotification = function(message, type = 'info') {
  // Create container if it doesn't exist
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'position-fixed top-0 end-0 p-3';
    container.style.zIndex = '1060';
    document.body.appendChild(container);
  }
  
  // Create the notification
  const notification = document.createElement('div');
  notification.className = `toast align-items-center text-white bg-${type} border-0`;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'assertive');
  notification.setAttribute('aria-atomic', 'true');
  
  notification.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  container.appendChild(notification);
  
  // Initialize Bootstrap toast
  try {
    const toast = new bootstrap.Toast(notification);
    toast.show();
    
    // Remove from DOM after it's hidden
    notification.addEventListener('hidden.bs.toast', () => {
      notification.remove();
    });
  } catch (e) {
    console.error('Error showing accessible notification:', e);
  }
  
  return notification;
};