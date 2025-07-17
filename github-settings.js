// GitHub Settings Page JavaScript
import * as GitHub from './github-api.js';

// DOM helper functions
const $ = id => document.getElementById(id);
const showElement = id => $(id).classList.remove('d-none');
const hideElement = id => $(id).classList.add('d-none');

// UI Elements
const authStatusLoading = $('auth-status-loading');
const authStatusLoggedOut = $('auth-status-logged-out');
const authStatusLoggedIn = $('auth-status-logged-in');
const repoSettingsCard = $('repo-settings-card');
const repoSettingsLoading = $('repo-settings-loading');
const repoSettingsForm = $('repo-settings-form');
const githubUsername = $('github-username');
const repositorySelect = $('repository-select');
const branchSelect = $('branch-select');
const filepathInput = $('filepath-input');
const githubToken = $('github-token');
const toggleTokenVisibility = $('toggle-token-visibility');
const loginBtn = $('btn-login');
const logoutBtn = $('btn-logout');
const saveSettingsBtn = $('btn-save-settings');

// Wait for storage to be ready
async function waitForStorageReady() {
  return new Promise((resolve) => {
    // If in development mode, storage is ready immediately
    if (window.location.protocol === 'http:') {
      resolve();
      return;
    }
    
    // In production, wait a bit for the storage manager to initialize
    // Look for specific indicators that storage is enhanced
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max
    
    const checkStorageReady = () => {
      attempts++;
      
      // Check various indicators that storage might be ready
      const storageReady = (
        window.storageManagerReady || 
        (chrome?.storage?.local && chrome.storage.local.enhanced) ||
        attempts >= maxAttempts
      );
      
      if (storageReady) {
        console.log('Storage is ready (attempts:', attempts, ')');
        resolve();
      } else {
        console.log('Waiting for storage to be ready... (attempt', attempts, ')');
        setTimeout(checkStorageReady, 100);
      }
    };
    
    // Start checking after a small delay to let polyfill load
    setTimeout(checkStorageReady, 200);
  });
}

// Initialize the page
async function init() {
  try {
    console.log('Initializing GitHub settings page...');
    console.log('Current protocol:', window.location.protocol);
    console.log('Development mode:', window.location.protocol === 'http:');
    
    // Wait for storage to be ready
    await waitForStorageReady();
    
    // Debug storage contents
    if (window.location.protocol === 'http:') {
      console.log('localStorage github_access_token:', localStorage.getItem('github_access_token'));
      console.log('localStorage github_config:', localStorage.getItem('github_config'));
    } else {
      // In production, check both Chrome storage and localStorage
      console.log('Checking Chrome storage availability:', !!chrome?.storage?.local);
      console.log('localStorage github_access_token:', localStorage.getItem('github_access_token'));
      console.log('localStorage github_config:', localStorage.getItem('github_config'));
      
      // Try to get from Chrome storage
      if (chrome?.storage?.local) {
        chrome.storage.local.get(['github_access_token', 'github_config'], (result) => {
          console.log('Chrome storage github_access_token:', result.github_access_token ? 'EXISTS' : 'NULL');
          console.log('Chrome storage github_config:', result.github_config);
        });
      }
    }
    
    // Check if the user is authenticated
    const isLoggedIn = await GitHub.isAuthenticated();
    console.log('Authentication check result:', isLoggedIn);
    
    // Hide loading UI
    hideElement('auth-status-loading');
    
    if (isLoggedIn) {
      console.log('User is authenticated, loading user state...');
      // User is logged in
      await handleLoggedInState();
    } else {
      console.log('User is not authenticated, showing login UI');
      // User is logged out
      showElement('auth-status-logged-out');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    
    // Try to check the GitHub config as a fallback
    try {
      const config = await GitHub.getGitHubConfig();
      console.log('GitHub config check:', config);
      
      if (config && config.username) {
        // We have a username, so user might be logged in
        console.log('Found username in config, attempting to verify authentication...');
        await handleLoggedInState();
        return;
      }
    } catch (configError) {
      console.error('Config check error:', configError);
    }
    
    // Show logged out state as fallback
    hideElement('auth-status-loading');
    showElement('auth-status-logged-out');
    
    // Don't show error message for expected initialization issues
    if (!error.message.includes('storage') && !error.message.includes('chrome')) {
      showError('Failed to initialize: ' + error.message);
    }
  }
}

// Handle the logged in state
async function handleLoggedInState() {
  try {
    console.log('Handling logged in state...');
    
    // Show logged in UI first
    showElement('auth-status-logged-in');
    
    // Try to get user info
    let userInfo;
    try {
      userInfo = await GitHub.getUserInfo();
      console.log('Got user info:', userInfo.login);
      githubUsername.textContent = userInfo.login;
    } catch (userError) {
      console.error('Error getting user info:', userError);
      
      // Check if it's an auth error
      if (userError.message.includes('401') || userError.message.includes('authentication')) {
        // Token is invalid
        hideElement('auth-status-logged-in');
        showElement('auth-status-logged-out');
        hideElement('repo-settings-card');
        hideElement('auto-commit-settings-card');
        return;
      }
      
      // Try to get username from config as fallback
      const config = await GitHub.getGitHubConfig();
      if (config && config.username) {
        githubUsername.textContent = config.username;
      } else {
        githubUsername.textContent = 'Unknown User';
      }
    }
    
    // Show repository settings
    showElement('repo-settings-card');
    
    // Show auto-commit settings
    console.log('Showing auto-commit settings card');
    showElement('auto-commit-settings-card');
    
    // Load repositories
    await loadRepositories();
    
    // Load current configuration
    await loadCurrentConfig();
    
    // Load auto-commit settings after the card is shown
    await loadAutoCommitSettings();
  } catch (error) {
    console.error('Error handling logged in state:', error);
    
    // Only show error if it's not a storage/chrome error
    if (!error.message.includes('storage') && !error.message.includes('chrome')) {
      showError('Failed to load user data: ' + error.message);
    }
    
    // If the error is due to authentication, show logged out state
    if (error.message.includes('authentication') || error.message.includes('401')) {
      hideElement('auth-status-logged-in');
      showElement('auth-status-logged-out');
      hideElement('repo-settings-card');
      hideElement('auto-commit-settings-card');
    }
  }
}

// Load user's repositories
async function loadRepositories() {
  try {
    // Show loading UI
    hideElement('repo-settings-form');
    showElement('repo-settings-loading');
    
    // Get repositories
    const repositories = await GitHub.getRepositories();
    
    // Populate repository select
    repositorySelect.innerHTML = '<option value="">Select a repository</option>';
    repositories.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo.name;
      option.textContent = repo.name;
      repositorySelect.appendChild(option);
    });
    
    // Hide loading UI
    hideElement('repo-settings-loading');
    showElement('repo-settings-form');
  } catch (error) {
    console.error('Error loading repositories:', error);
    showError('Failed to load repositories: ' + error.message);
    
    // Hide loading UI
    hideElement('repo-settings-loading');
    showElement('repo-settings-form');
  }
}

// Load branches for the selected repository
async function loadBranches(repository) {
  try {
    // Clear branch select
    branchSelect.innerHTML = '<option value="main">main</option>';
    
    if (!repository) return;
    
    // Get branches
    const branches = await GitHub.getBranches(repository);
    
    // Populate branch select
    branchSelect.innerHTML = '';
    branches.forEach(branch => {
      const option = document.createElement('option');
      option.value = branch.name;
      option.textContent = branch.name;
      branchSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading branches:', error);
    showError('Failed to load branches: ' + error.message);
    
    // Set default branch option
    branchSelect.innerHTML = '<option value="main">main</option>';
  }
}

// Load current GitHub configuration
async function loadCurrentConfig() {
  try {
    const config = await GitHub.getGitHubConfig();
    console.log('Loaded GitHub config:', config);
    
    // Show debug info if username is missing
    if (!config.username) {
      console.warn('GitHub username is missing from config. This may indicate an incomplete authentication.');
    }
    
    // Set repository if available
    if (config.repository) {
      repositorySelect.value = config.repository;
      await loadBranches(config.repository);
    }
    
    // Set branch if available
    if (config.branch) {
      branchSelect.value = config.branch;
    }
    
    // Set filepath if available
    if (config.filepath) {
      filepathInput.value = config.filepath;
    } else {
      filepathInput.value = 'curator-pathways.json';
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
    showError('Failed to load configuration: ' + error.message);
  }
}

// Handle login button click
async function handleLogin() {
  try {
    // Get token from input
    const token = githubToken.value.trim();
    
    // Validate token
    if (!token) {
      showError('Please enter a GitHub personal access token');
      return;
    }
    
    // Validate token format - should be a PAT (ghp_xxx)
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      const confirmNonPAT = confirm(
        'Warning: This does not appear to be a GitHub Personal Access Token (PAT). ' +
        'PATs typically start with "ghp_" or "github_pat_".\n\n' +
        'Are you sure this is a valid token with the required scope?'
      );
      
      if (!confirmNonPAT) {
        return;
      }
    }
    
    // Check token length - PATs are typically at least 40 chars
    if (token.length < 40) {
      const confirmShortToken = confirm(
        'Warning: This token appears to be too short for a GitHub Personal Access Token. ' +
        'PATs are typically at least 40 characters long.\n\n' +
        'Are you sure this is a complete, valid token?'
      );
      
      if (!confirmShortToken) {
        return;
      }
    }
    
    // Disable login button
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="bi bi-github"></i> Connecting...';
    
    // Show security reminder - only if authStatusLoggedOut exists
    // This was the problematic part - we were trying to append to a potentially null parent
    let securityReminder = null;
    if (authStatusLoggedOut) {
      securityReminder = document.createElement('div');
      securityReminder.className = 'alert alert-warning mt-3';
      securityReminder.innerHTML = `
        <i class="bi bi-shield-exclamation me-2"></i>
        <strong>Security Reminder:</strong> Your token will be stored securely in this extension.
        For maximum security, consider using a token with minimal scopes and a limited expiration date.
      `;
      authStatusLoggedOut.appendChild(securityReminder);
    }
    
    try {
      // Authenticate with GitHub using token
      await GitHub.authenticateWithToken(token);
      
      // Clear token input for security
      githubToken.value = '';
      
      // Hide logged out UI
      hideElement('auth-status-logged-out');
      
      // Show logged in UI
      await handleLoggedInState();
    } finally {
      // Remove the security reminder
      if (securityReminder && securityReminder.parentNode) {
        securityReminder.parentNode.removeChild(securityReminder);
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Provide more helpful error messages
    if (error.message.includes('401')) {
      showError('Authentication failed: Invalid token or insufficient permissions. Make sure your token has the "public_repo" scope.');
    } else if (error.message.includes('403')) {
      showError('Permission denied. Your token may have expired or have insufficient scopes.');
    } else {
      showError('Login failed: ' + error.message);
    }
  } finally {
    // Re-enable login button
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="bi bi-github"></i> Connect to GitHub';
  }
}

// Handle logout button click
async function handleLogout() {
  try {
    // Disable logout button
    logoutBtn.disabled = true;
    logoutBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i> Disconnecting...';
    
    // Logout from GitHub
    await GitHub.logout();
    
    // Hide logged in UI
    hideElement('auth-status-logged-in');
    hideElement('repo-settings-card');
    hideElement('auto-commit-settings-card');
    
    // Show logged out UI
    showElement('auth-status-logged-out');
  } catch (error) {
    console.error('Logout error:', error);
    showError('Logout failed: ' + error.message);
  } finally {
    // Re-enable logout button
    logoutBtn.disabled = false;
    logoutBtn.innerHTML = '<i class="bi bi-box-arrow-right"></i> Disconnect';
  }
}

// Handle repository selection change
async function handleRepositoryChange() {
  const repository = repositorySelect.value;
  
  if (repository) {
    await loadBranches(repository);
  } else {
    branchSelect.innerHTML = '<option value="main">main</option>';
  }
}

// Handle save settings button click
async function handleSaveSettings() {
  try {
    // Get settings
    const repository = repositorySelect.value;
    const branch = branchSelect.value;
    const filepath = filepathInput.value.trim();
    
    // Validate
    if (!repository) {
      showError('Please select a repository');
      return;
    }
    
    if (!branch) {
      showError('Please select a branch');
      return;
    }
    
    if (!filepath) {
      showError('Please enter a file path');
      return;
    }
    
    // Disable save button
    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';
    
    // Save settings
    await GitHub.configureRepository(repository, branch, filepath);
    
    // Check if file exists in repository and offer to import
    try {
      const fileResult = await GitHub.getFileContent(filepath);
      
      if (fileResult.exists) {
        // File exists in GitHub, ask user if they want to import
        const importConfirmed = confirm(
          `A file named "${filepath}" already exists in the selected repository.\n\n` +
          `Would you like to import the data from this file into your Curator extension?\n\n` +
          `This will overwrite your current pathways with the ones from GitHub.`
        );
        
        if (importConfirmed) {
          try {
            // Parse the JSON content
            const importedData = JSON.parse(fileResult.content);
            
            // Validate that this is a valid pathways array
            if (!Array.isArray(importedData)) {
              throw new Error('The file does not contain a valid pathways array');
            }
            
            // Save to local storage
            await chrome.storage.local.set({ pathways: importedData });
            showSuccess('Settings saved and pathways imported successfully!');
          } catch (parseError) {
            console.error('Error parsing GitHub file:', parseError);
            showError(`The file does not contain valid JSON data: ${parseError.message}`);
          }
        } else {
          showSuccess('Settings saved successfully. No data was imported.');
        }
      } else {
        // File doesn't exist yet
        showSuccess('Settings saved successfully');
      }
    } catch (fileError) {
      console.error('Error checking file existence:', fileError);
      // Don't show error to user, just continue
      showSuccess('Settings saved successfully');
    }
  } catch (error) {
    console.error('Save settings error:', error);
    showError('Failed to save settings: ' + error.message);
  } finally {
    // Re-enable save button
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = 'Save Settings';
  }
}

// Show error message
function showError(message) {
  alert(message);
}

// Show success message
function showSuccess(message) {
  alert(message);
}

// Add event listeners
// Handle toggle token visibility
function toggleTokenVisibilityHandler() {
  const isPassword = githubToken.type === 'password';
  githubToken.type = isPassword ? 'text' : 'password';
  toggleTokenVisibility.innerHTML = `<i class="bi bi-eye${isPassword ? '-slash' : ''}"></i>`;
}

// Debug function to check current configuration
async function handleDebug() {
  try {
    const config = await GitHub.getGitHubConfig();
    const isAuth = await GitHub.isAuthenticated();
    
    let userInfo = null;
    if (isAuth) {
      try {
        userInfo = await GitHub.getUserInfo();
      } catch (e) {
        userInfo = { error: e.message };
      }
    }
    
    const debugInfo = {
      isAuthenticated: isAuth,
      config: config,
      userInfo: userInfo,
      timestamp: new Date().toISOString()
    };
    
    document.getElementById('debug-config').textContent = JSON.stringify(debugInfo, null, 2);
    document.getElementById('debug-output').classList.remove('d-none');
  } catch (error) {
    document.getElementById('debug-config').textContent = 'Error: ' + error.message;
    document.getElementById('debug-output').classList.remove('d-none');
  }
}

// Auto-commit settings
const AUTO_COMMIT_CONFIG_KEY = 'auto_commit_config';

// Load auto-commit settings
async function loadAutoCommitSettings() {
  try {
    console.log('Loading auto-commit settings...');
    
    // Wait for storage to be ready
    await waitForStorageReady();
    
    let config;
    
    // Use enhanced Chrome storage for PWA
    config = await new Promise((resolve) => {
      chrome.storage.local.get(AUTO_COMMIT_CONFIG_KEY, (result) => {
        const autoCommitConfig = result[AUTO_COMMIT_CONFIG_KEY] || {
          enabled: false,
          interval: 15,
          messagePrefix: 'Auto-commit:'
        };
        console.log('Auto-commit config from enhanced Chrome storage:', autoCommitConfig);
        resolve(autoCommitConfig);
      });
    });
    
    // Update UI
    console.log('Updating auto-commit UI with config:', config);
    document.getElementById('auto-commit-enabled').checked = config.enabled;
    document.getElementById('auto-commit-interval').value = config.interval;
    document.getElementById('auto-commit-message').value = config.messagePrefix;
    
    // Show/hide options based on enabled state
    if (config.enabled) {
      document.getElementById('auto-commit-options').classList.remove('d-none');
      console.log('Showing auto-commit options because enabled =', config.enabled);
    } else {
      console.log('Hiding auto-commit options because enabled =', config.enabled);
    }
  } catch (error) {
    console.error('Error loading auto-commit settings:', error);
  }
}

// Save auto-commit settings
async function saveAutoCommitSettings() {
  try {
    const config = {
      enabled: document.getElementById('auto-commit-enabled').checked,
      interval: parseInt(document.getElementById('auto-commit-interval').value),
      messagePrefix: document.getElementById('auto-commit-message').value || 'Auto-commit:'
    };
    
    // Save to enhanced Chrome storage
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [AUTO_COMMIT_CONFIG_KEY]: config }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    
    // Trigger storage event to notify auto-commit system
    window.dispatchEvent(new StorageEvent('storage', {
      key: AUTO_COMMIT_CONFIG_KEY,
      newValue: JSON.stringify(config),
      storageArea: localStorage
    }));
    
    // Also notify via global function if available
    if (window.pwaAutoCommit && window.pwaAutoCommit.resetAutoCommitTimer) {
      window.pwaAutoCommit.resetAutoCommitTimer();
    }
    
    showSuccess('Auto-commit settings saved successfully');
  } catch (error) {
    console.error('Error saving auto-commit settings:', error);
    showError('Failed to save auto-commit settings: ' + error.message);
  }
}

// Toggle auto-commit options visibility
function toggleAutoCommitOptions() {
  const enabled = document.getElementById('auto-commit-enabled').checked;
  const options = document.getElementById('auto-commit-options');
  
  if (enabled) {
    options.classList.remove('d-none');
  } else {
    options.classList.add('d-none');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize
  init();
  
  // Auth buttons
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  
  // Repository select
  repositorySelect.addEventListener('change', handleRepositoryChange);
  
  // Save settings button
  saveSettingsBtn.addEventListener('click', handleSaveSettings);
  
  // Token visibility toggle
  toggleTokenVisibility.addEventListener('click', toggleTokenVisibilityHandler);
  
  // Auto-commit settings
  document.getElementById('auto-commit-enabled').addEventListener('change', toggleAutoCommitOptions);
  document.getElementById('btn-save-auto-commit').addEventListener('click', saveAutoCommitSettings);
  
  // Debug button
  const debugBtn = document.getElementById('btn-debug');
  if (debugBtn) {
    debugBtn.addEventListener('click', handleDebug);
  }
  
  // Show debug section if there are authentication issues
  // We'll check this after a short delay to allow initialization
  setTimeout(async () => {
    try {
      const isAuth = await GitHub.isAuthenticated();
      if (isAuth) {
        const config = await GitHub.getGitHubConfig();
        if (!config.username) {
          // Username is missing, show debug section
          document.getElementById('debug-section').classList.remove('d-none');
        }
      }
    } catch (error) {
      // Show debug section if there are errors
      document.getElementById('debug-section').classList.remove('d-none');
    }
  }, 1000);
});