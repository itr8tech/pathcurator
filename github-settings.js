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

// Initialize the page
async function init() {
  try {
    // Check if the user is authenticated
    const isLoggedIn = await GitHub.isAuthenticated();
    
    // Hide loading UI
    hideElement('auth-status-loading');
    
    if (isLoggedIn) {
      // User is logged in
      await handleLoggedInState();
    } else {
      // User is logged out
      showElement('auth-status-logged-out');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to initialize: ' + error.message);
    
    // Show logged out state as fallback
    hideElement('auth-status-loading');
    showElement('auth-status-logged-out');
  }
}

// Handle the logged in state
async function handleLoggedInState() {
  try {
    // Show logged in UI
    showElement('auth-status-logged-in');
    
    // Get user info
    const userInfo = await GitHub.getUserInfo();
    githubUsername.textContent = userInfo.login;
    
    // Show repository settings
    showElement('repo-settings-card');
    
    // Load repositories
    await loadRepositories();
    
    // Load current configuration
    await loadCurrentConfig();
  } catch (error) {
    console.error('Error handling logged in state:', error);
    showError('Failed to load user data: ' + error.message);
    
    // If the error is due to authentication, show logged out state
    if (error.message.includes('authentication')) {
      hideElement('auth-status-logged-in');
      showElement('auth-status-logged-out');
      hideElement('repo-settings-card');
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