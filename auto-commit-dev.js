// Auto-commit functionality for development mode
// This runs when the extension is accessed via localhost instead of as a Chrome extension

let autoCommitTimer = null;
let lastCommitHash = null;

// Function to get current data hash
async function getDataHash() {
  try {
    const pathwaysData = localStorage.getItem('pathways');
    if (!pathwaysData) return null;
    
    // Simple hash function for comparison
    let hash = 0;
    for (let i = 0; i < pathwaysData.length; i++) {
      const char = pathwaysData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  } catch (error) {
    console.error('Error getting data hash:', error);
    return null;
  }
}

// Function to get pathways from localStorage
function getPathwaysFromStorage() {
  try {
    const stored = localStorage.getItem('pathways');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error getting pathways from localStorage:', error);
    return [];
  }
}

// Function to perform auto-commit
async function performAutoCommit() {
  try {
    console.log('Checking for auto-commit...');
    
    // Check if data has changed
    const currentHash = await getDataHash();
    if (!currentHash || currentHash === lastCommitHash) {
      console.log('No changes detected, skipping auto-commit');
      return;
    }
    
    // Import GitHub API module
    const GitHubModule = await import('./github-api.js');
    const GitHub = GitHubModule;
    
    // Check if authenticated and configured
    const isAuthenticated = await GitHub.isAuthenticated();
    if (!isAuthenticated) {
      console.log('Not authenticated, skipping auto-commit');
      return;
    }
    
    const config = await GitHub.getGitHubConfig();
    if (!config.repository) {
      console.log('No repository configured, skipping auto-commit');
      return;
    }
    
    // Get auto-commit config
    const autoCommitConfigStr = localStorage.getItem('auto_commit_config');
    const autoCommitConfig = autoCommitConfigStr ? JSON.parse(autoCommitConfigStr) : { enabled: false };
    
    if (!autoCommitConfig.enabled) {
      console.log('Auto-commit disabled, skipping');
      return;
    }
    
    // Get pathways data
    const pathwaysData = getPathwaysFromStorage();
    
    // Generate commit message
    const timestamp = new Date().toLocaleString();
    const commitMessage = `${autoCommitConfig.messagePrefix || 'Auto-commit:'} ${timestamp}`;
    
    console.log('Performing auto-commit...', commitMessage);
    
    // Commit to GitHub
    await GitHub.commitFile(
      JSON.stringify(pathwaysData, null, 2),
      commitMessage
    );
    
    // Update last commit hash
    lastCommitHash = currentHash;
    
    console.log('Auto-commit completed successfully');
    
    // Show a notification in the page
    showAutoCommitNotification('Changes saved to GitHub automatically');
    
  } catch (error) {
    console.error('Auto-commit failed:', error);
    showAutoCommitNotification('Auto-commit failed: ' + error.message, 'error');
  }
}

// Function to show auto-commit notification in the page
function showAutoCommitNotification(message, type = 'success') {
  // Create or update notification element
  let notification = document.getElementById('auto-commit-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'auto-commit-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(notification);
  }
  
  // Set color based on type
  notification.style.backgroundColor = type === 'error' ? '#dc3545' : '#28a745';
  notification.textContent = message;
  notification.style.opacity = '1';
  
  // Hide after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Function to reset auto-commit timer
function resetAutoCommitTimer() {
  // Clear existing timer
  if (autoCommitTimer) {
    clearInterval(autoCommitTimer);
    autoCommitTimer = null;
  }
  
  // Get auto-commit config
  const autoCommitConfigStr = localStorage.getItem('auto_commit_config');
  const config = autoCommitConfigStr ? JSON.parse(autoCommitConfigStr) : { enabled: false, interval: 15 };
  
  if (config.enabled) {
    const intervalMs = config.interval * 60 * 1000; // Convert minutes to milliseconds
    autoCommitTimer = setInterval(performAutoCommit, intervalMs);
    console.log(`Auto-commit timer set for ${config.interval} minutes (development mode)`);
  }
}

// Function to initialize auto-commit in development mode
function initializeDevAutoCommit() {
  // Only run in development mode
  if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
    console.log('Initializing auto-commit for development mode');
    
    // Initialize timer
    resetAutoCommitTimer();
    
    // Listen for storage changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'pathways' || e.key === 'auto_commit_config') {
        console.log('Storage changed, resetting auto-commit timer');
        resetAutoCommitTimer();
      }
    });
    
    // Listen for page visibility changes to reset timer when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetAutoCommitTimer();
      }
    });
  }
}

// Export functions for manual testing
window.devAutoCommit = {
  performAutoCommit,
  resetAutoCommitTimer,
  getDataHash,
  showAutoCommitNotification
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDevAutoCommit);
} else {
  initializeDevAutoCommit();
}

export { performAutoCommit, resetAutoCommitTimer, getDataHash, showAutoCommitNotification };