/**
 * Scoped UI Helper Functions
 * Utility functions used across the Curator Extension UI.
 */

// Show a temporary status message at the top of the screen
function showStatusMessage(message, type = 'info', duration = 3000) {
  // Remove any existing status messages
  const existingStatus = document.querySelector('.curator-status-message');
  if (existingStatus) {
    document.body.removeChild(existingStatus);
  }
  
  // Create new status element
  const statusEl = document.createElement('div');
  statusEl.className = `curator-status-message position-fixed top-0 start-0 end-0 p-3 text-center`;
  statusEl.style.zIndex = '9999';
  statusEl.style.transition = 'all 0.3s ease';
  
  // Set appropriate style based on message type
  switch (type) {
    case 'success':
      statusEl.classList.add('bg-success', 'text-white');
      break;
    case 'error':
      statusEl.classList.add('bg-danger', 'text-white');
      break;
    case 'warning':
      statusEl.classList.add('bg-warning', 'text-dark');
      break;
    case 'info':
    default:
      statusEl.classList.add('bg-info', 'text-dark');
      break;
  }
  
  // Set message content
  statusEl.innerHTML = message;
  
  // Add to DOM
  document.body.appendChild(statusEl);
  
  // Auto-remove after specified duration
  if (duration > 0) {
    setTimeout(() => {
      if (document.body.contains(statusEl)) {
        statusEl.style.opacity = '0';
        setTimeout(() => {
          if (document.body.contains(statusEl)) {
            document.body.removeChild(statusEl);
          }
        }, 300); // Allow time for fade-out animation
      }
    }, duration);
  }
  
  // Return the element in case caller wants to remove it manually
  return statusEl;
}

// Format a date for display
function formatDisplayDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  });
}

// Format a date with time for display
function formatDisplayDateTime(timestamp) {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Make these functions available globally
window.curatorUI = {
  showStatusMessage,
  formatDisplayDate,
  formatDisplayDateTime
};