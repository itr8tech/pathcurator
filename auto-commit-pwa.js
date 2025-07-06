// PWA Auto-commit functionality
// This runs when any PathCurator page is open and handles auto-commit timers

let autoCommitTimer = null;
let lastCommitHash = null;
const STORAGE_PREFIX = 'pathcurator_';
const AUTO_COMMIT_CONFIG_KEY = STORAGE_PREFIX + 'auto_commit_config';
const LAST_COMMIT_HASH_KEY = STORAGE_PREFIX + 'last_commit_hash';

// Function to get current data hash
async function getDataHash() {
  try {
    // Get pathways from enhanced storage
    const pathways = await getPathwaysFromStorage();
    if (!pathways || pathways.length === 0) return null;
    
    const pathwaysData = JSON.stringify(pathways);
    
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

// Function to get pathways from storage (using enhanced chrome storage)
async function getPathwaysFromStorage() {
  try {
    // Use the enhanced chrome.storage.local that's been polyfilled
    return new Promise((resolve) => {
      chrome.storage.local.get({pathways: []}, (result) => {
        const pathways = Array.isArray(result.pathways) ? result.pathways : [];
        console.log('PWA Auto-commit: Retrieved pathways from storage:', pathways.length, 'pathways');
        resolve(pathways);
      });
    });
  } catch (error) {
    console.error('Error getting pathways from storage:', error);
    return [];
  }
}

// Function to get auto-commit config (using enhanced chrome storage)
async function getAutoCommitConfig() {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get('auto_commit_config', (result) => {
        const config = result.auto_commit_config || {
          enabled: false,
          interval: 15,
          messagePrefix: 'Auto-commit:'
        };
        
        console.log('PWA Auto-commit: Retrieved config from enhanced storage:', config);
        resolve(config);
      });
    });
  } catch (error) {
    console.error('Error getting auto-commit config:', error);
    return { enabled: false, interval: 15, messagePrefix: 'Auto-commit:' };
  }
}

// Function to show auto-commit notification
function showAutoCommitNotification(message, type = 'success') {
  // Create or update notification element
  let notification = document.getElementById('pwa-auto-commit-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'pwa-auto-commit-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(notification);
  }
  
  // Set color based on type
  notification.style.backgroundColor = type === 'error' ? '#dc3545' : '#28a745';
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <i class="bi bi-${type === 'error' ? 'exclamation-triangle' : 'check-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  notification.style.opacity = '1';
  
  // Hide after 4 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Function to perform auto-commit
async function performAutoCommit() {
  try {
    console.log('PWA Auto-commit: Checking for changes...');
    
    // Get current data hash
    const currentHash = await getDataHash();
    if (!currentHash) {
      console.log('PWA Auto-commit: No data found, skipping');
      return;
    }
    
    // Get stored hash
    const storedHash = localStorage.getItem(LAST_COMMIT_HASH_KEY);
    if (currentHash === storedHash) {
      console.log('PWA Auto-commit: No changes detected, skipping');
      return;
    }
    
    // Check auto-commit config
    const config = await getAutoCommitConfig();
    if (!config.enabled) {
      console.log('PWA Auto-commit: Disabled, skipping');
      return;
    }
    
    // Import GitHub API module
    const GitHubModule = await import('./github-api.js');
    const GitHub = GitHubModule;
    
    // Check if authenticated and configured
    const isAuthenticated = await GitHub.isAuthenticated();
    if (!isAuthenticated) {
      console.log('PWA Auto-commit: Not authenticated, skipping');
      return;
    }
    
    const githubConfig = await GitHub.getGitHubConfig();
    if (!githubConfig.repository) {
      console.log('PWA Auto-commit: No repository configured, skipping');
      return;
    }
    
    // Get pathways data
    const pathwaysData = await getPathwaysFromStorage();
    if (!pathwaysData || pathwaysData.length === 0) {
      console.log('PWA Auto-commit: No pathways to commit, skipping');
      return;
    }
    
    // Generate commit message
    const timestamp = new Date().toLocaleString();
    const commitMessage = `${config.messagePrefix} ${timestamp}`;
    
    console.log('PWA Auto-commit: Committing changes...', commitMessage);
    
    // Show notification that commit is starting
    showAutoCommitNotification('Auto-saving to GitHub...', 'info');
    
    // Commit to GitHub
    await GitHub.commitFile(
      JSON.stringify(pathwaysData, null, 2),
      commitMessage
    );
    
    // Update stored hash
    localStorage.setItem(LAST_COMMIT_HASH_KEY, currentHash);
    
    console.log('PWA Auto-commit: Completed successfully');
    showAutoCommitNotification('Changes auto-saved to GitHub successfully');
    
  } catch (error) {
    console.error('PWA Auto-commit failed:', error);
    showAutoCommitNotification('Auto-commit failed: ' + error.message, 'error');
  }
}

// Function to reset auto-commit timer
async function resetAutoCommitTimer() {
  console.log('PWA Auto-commit: Resetting timer...');
  
  // Clear existing timer
  if (autoCommitTimer) {
    clearInterval(autoCommitTimer);
    autoCommitTimer = null;
  }
  
  // Get config
  const config = await getAutoCommitConfig();
  console.log('PWA Auto-commit: Config:', config);
  
  if (config.enabled && config.interval > 0) {
    const intervalMs = config.interval * 60 * 1000; // Convert minutes to milliseconds
    autoCommitTimer = setInterval(performAutoCommit, intervalMs);
    console.log(`PWA Auto-commit: Timer set for ${config.interval} minutes (${intervalMs}ms)`);
    
    // Show a subtle notification that auto-commit is active
    if (document.visibilityState === 'visible') {
      setTimeout(() => {
        showAutoCommitNotification(`Auto-commit active: Every ${config.interval} minutes`, 'info');
      }, 1000);
    }
  } else {
    console.log('PWA Auto-commit: Disabled or invalid interval');
  }
}

// Function to initialize auto-commit
function initializePWAAutoCommit() {
  console.log('PWA Auto-commit: Initializing...');
  
  // Initialize timer
  resetAutoCommitTimer();
  
  // Listen for storage changes (when settings are updated)
  window.addEventListener('storage', (e) => {
    if (e.key === AUTO_COMMIT_CONFIG_KEY) {
      console.log('PWA Auto-commit: Config changed, resetting timer');
      resetAutoCommitTimer();
    }
  });
  
  // Listen for page visibility changes to reset timer when page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('PWA Auto-commit: Page visible, checking timer');
      resetAutoCommitTimer();
    } else {
      // Clear timer when page is hidden to save resources
      if (autoCommitTimer) {
        clearInterval(autoCommitTimer);
        autoCommitTimer = null;
        console.log('PWA Auto-commit: Page hidden, clearing timer');
      }
    }
  });
  
  // Listen for beforeunload to clear timer
  window.addEventListener('beforeunload', () => {
    if (autoCommitTimer) {
      clearInterval(autoCommitTimer);
      autoCommitTimer = null;
    }
  });
}

// Function to trigger immediate auto-commit (for manual testing)
async function triggerAutoCommit() {
  console.log('PWA Auto-commit: Manual trigger requested');
  await performAutoCommit();
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePWAAutoCommit);
} else {
  initializePWAAutoCommit();
}

// Export functions for use by other modules
export { 
  performAutoCommit, 
  resetAutoCommitTimer, 
  getDataHash, 
  showAutoCommitNotification,
  triggerAutoCommit,
  initializePWAAutoCommit
};

// Also make available globally for debugging
window.pwaAutoCommit = {
  performAutoCommit,
  resetAutoCommitTimer,
  getDataHash,
  showAutoCommitNotification,
  triggerAutoCommit,
  initializePWAAutoCommit
};