// PWA Auto-commit functionality
// This runs when any PathCurator page is open and handles auto-commit timers

let autoCommitTimer = null;
let lastCommitHash = null;
const STORAGE_PREFIX = 'pathcurator_';
const AUTO_COMMIT_CONFIG_KEY = 'auto_commit_config';
const LAST_COMMIT_HASH_KEY = STORAGE_PREFIX + 'last_commit_hash';
const LAST_COMMIT_TIME_KEY = STORAGE_PREFIX + 'last_commit_time';
const TIMER_START_KEY = STORAGE_PREFIX + 'timer_start';

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

// Function to update navigation status widget
function updateNavigationWidget() {
  const statusWidget = document.getElementById('auto-commit-status');
  const countdownEl = document.getElementById('auto-commit-countdown');
  const detailsEl = document.getElementById('auto-commit-details');
  const iconEl = document.getElementById('auto-commit-icon');
  
  // Only update if widget exists on this page
  if (!statusWidget) return;
  
  // Get current status
  getAutoCommitConfig().then(config => {
    if (!config.enabled) {
      statusWidget.classList.add('d-none');
      return;
    }
    
    // Show widget
    statusWidget.classList.remove('d-none');
    
    // Get timer data
    getTimerData().then(timerData => {
      if (!timerData.timerStart) {
        countdownEl.textContent = `${config.interval}:00`;
        detailsEl.textContent = 'Starting...';
        iconEl.className = 'bi bi-clock-history me-2 text-white';
        return;
      }
      
      const elapsedMs = Date.now() - timerData.timerStart;
      const intervalMs = config.interval * 60 * 1000;
      const remainingMs = Math.max(0, intervalMs - elapsedMs);
      
      if (remainingMs === 0) {
        countdownEl.textContent = '0:00';
        detailsEl.textContent = 'Syncing...';
        iconEl.className = 'bi bi-arrow-clockwise me-2 text-white';
      } else {
        const minutes = Math.floor(remainingMs / 60000);
        const seconds = Math.floor((remainingMs % 60000) / 1000);
        
        countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        iconEl.className = 'bi bi-clock-history me-2 text-white';
        
        // Show last sync time if available
        if (timerData.lastCommitTime) {
          const timeDiff = Date.now() - timerData.lastCommitTime;
          const minutesAgo = Math.floor(timeDiff / 60000);
          
          if (minutesAgo < 1) {
            detailsEl.textContent = 'Just synced';
          } else if (minutesAgo < 60) {
            detailsEl.textContent = `${minutesAgo}m ago`;
          } else {
            detailsEl.textContent = 'Last sync';
          }
        } else {
          detailsEl.textContent = 'Next sync';
        }
      }
    });
  });
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
    
    // Get stored hash from Chrome storage
    const timerData = await getTimerData();
    const storedHash = timerData.lastCommitHash;
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
    
    // Update stored hash and time
    await setTimerData(LAST_COMMIT_HASH_KEY, currentHash);
    await setTimerData(LAST_COMMIT_TIME_KEY, Date.now());
    
    console.log('PWA Auto-commit: Completed successfully');
    showAutoCommitNotification('Changes auto-saved to GitHub successfully');
    
  } catch (error) {
    console.error('PWA Auto-commit failed:', error);
    showAutoCommitNotification('Auto-commit failed: ' + error.message, 'error');
  }
}

// Function to get timer data from chrome storage
async function getTimerData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TIMER_START_KEY, LAST_COMMIT_HASH_KEY, LAST_COMMIT_TIME_KEY], (result) => {
      resolve({
        timerStart: result[TIMER_START_KEY],
        lastCommitHash: result[LAST_COMMIT_HASH_KEY],
        lastCommitTime: result[LAST_COMMIT_TIME_KEY]
      });
    });
  });
}

// Function to set timer data in chrome storage
async function setTimerData(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

// Function to check if it's time to commit
async function checkCommitInterval() {
  const config = await getAutoCommitConfig();
  if (!config.enabled) return;
  
  const timerData = await getTimerData();
  if (!timerData.timerStart) {
    // No timer start recorded, start now
    await setTimerData(TIMER_START_KEY, Date.now());
    return;
  }
  
  const elapsedMs = Date.now() - timerData.timerStart;
  const intervalMs = config.interval * 60 * 1000;
  
  if (elapsedMs >= intervalMs) {
    console.log(`PWA Auto-commit: Interval reached (${Math.floor(elapsedMs/1000/60)} minutes elapsed)`);
    // Reset timer start
    await setTimerData(TIMER_START_KEY, Date.now());
    // Perform commit
    await performAutoCommit();
  } else {
    const remainingMinutes = Math.ceil((intervalMs - elapsedMs) / 60000);
    console.log(`PWA Auto-commit: Next check in ${remainingMinutes} minutes`);
  }
}

// Function to start persistent timer
async function startPersistentTimer() {
  console.log('PWA Auto-commit: Starting persistent timer...');
  
  // Clear any existing timer
  if (autoCommitTimer) {
    clearInterval(autoCommitTimer);
    autoCommitTimer = null;
  }
  
  // Check immediately on start
  await checkCommitInterval();
  
  // Then check every minute to see if interval has passed
  autoCommitTimer = setInterval(() => {
    checkCommitInterval();
    updateNavigationWidget(); // Update the nav widget every minute
  }, 60000);
  console.log('PWA Auto-commit: Timer checking every minute for interval completion');
}

// Function to reset auto-commit timer (now just ensures timer is running)
async function resetAutoCommitTimer() {
  console.log('PWA Auto-commit: Ensuring timer is running...');
  
  const config = await getAutoCommitConfig();
  console.log('PWA Auto-commit: Config:', config);
  
  if (config.enabled && config.interval > 0) {
    // Don't reset the timer start time, just ensure timer is running
    await startPersistentTimer();
    
    // Show a subtle notification that auto-commit is active
    if (document.visibilityState === 'visible') {
      const timerData = await getTimerData();
      if (timerData.timerStart) {
        const elapsedMs = Date.now() - timerData.timerStart;
        const remainingMinutes = Math.max(1, Math.ceil((config.interval * 60000 - elapsedMs) / 60000));
        showAutoCommitNotification(`Auto-commit active: Next sync in ${remainingMinutes} min`, 'info');
      } else {
        showAutoCommitNotification(`Auto-commit active: Every ${config.interval} minutes`, 'info');
      }
    }
  } else {
    console.log('PWA Auto-commit: Disabled or invalid interval');
    if (autoCommitTimer) {
      clearInterval(autoCommitTimer);
      autoCommitTimer = null;
    }
  }
}

// Function to initialize auto-commit
function initializePWAAutoCommit() {
  console.log('PWA Auto-commit: Initializing...');
  
  // Set up manual trigger button if it exists
  const manualTriggerBtn = document.getElementById('auto-commit-manual-trigger');
  if (manualTriggerBtn) {
    manualTriggerBtn.addEventListener('click', async () => {
      console.log('PWA Auto-commit: Manual trigger clicked');
      await triggerAutoCommit();
      // Reset timer after manual commit
      await setTimerData(TIMER_START_KEY, Date.now());
      updateNavigationWidget();
    });
  }
  
  // Initialize timer and widget
  resetAutoCommitTimer();
  
  // Update widget immediately and then every 5 seconds for real-time countdown
  updateNavigationWidget();
  setInterval(updateNavigationWidget, 5000);
  
  // Listen for storage changes (when settings are updated)
  window.addEventListener('storage', async (e) => {
    if (e.key === AUTO_COMMIT_CONFIG_KEY) {
      console.log('PWA Auto-commit: Config changed, resetting timer and interval');
      // Config changed - this SHOULD reset the timer
      await setTimerData(TIMER_START_KEY, Date.now());
      resetAutoCommitTimer();
      updateNavigationWidget();
    }
  });
  
  // Listen for page visibility changes - but DON'T reset the timer
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('PWA Auto-commit: Page visible, ensuring timer is running');
      // Just ensure timer is running, don't reset the countdown
      if (!autoCommitTimer) {
        resetAutoCommitTimer();
      }
    } else {
      // Page hidden - timer continues running
      console.log('PWA Auto-commit: Page hidden, timer continues in background');
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

// Function to check timer status (for debugging)
async function checkTimerStatus() {
  const config = await getAutoCommitConfig();
  const timerData = await getTimerData();
  
  console.log('=== Auto-commit Status ===');
  console.log('Enabled:', config.enabled);
  console.log('Interval:', config.interval, 'minutes');
  
  if (timerData.timerStart) {
    const elapsedMs = Date.now() - timerData.timerStart;
    const intervalMs = config.interval * 60 * 1000;
    const remainingMs = intervalMs - elapsedMs;
    
    console.log('Timer started:', new Date(timerData.timerStart).toLocaleTimeString());
    console.log('Elapsed time:', Math.floor(elapsedMs / 60000), 'minutes');
    console.log('Time until next commit:', Math.ceil(remainingMs / 60000), 'minutes');
  } else {
    console.log('Timer not started yet');
  }
  
  if (timerData.lastCommitTime) {
    console.log('Last commit:', new Date(timerData.lastCommitTime).toLocaleString());
  }
  console.log('=========================');
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
  initializePWAAutoCommit,
  updateNavigationWidget
};

// Also make available globally for debugging
window.pwaAutoCommit = {
  performAutoCommit,
  resetAutoCommitTimer,
  getDataHash,
  showAutoCommitNotification,
  triggerAutoCommit,
  initializePWAAutoCommit,
  updateNavigationWidget,
  checkTimerStatus
};