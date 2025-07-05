// GitHub Integration Module
import { secureSet, secureGet } from './secure-storage.js';

// GitHub API base URL
const API_BASE_URL = 'https://api.github.com';

// Storage keys for GitHub configuration
const GITHUB_TOKEN_KEY = 'githubAccessToken';
const GITHUB_USERNAME_KEY = 'githubUsername';
const GITHUB_REPO_KEY = 'githubRepository';
const GITHUB_BRANCH_KEY = 'githubBranch';

// Variables to store GitHub auth and repository information (in-memory only)
let githubUsername = null;
let selectedRepository = null;
let selectedBranch = 'main';

// Load saved GitHub configuration
async function loadGitHubConfig() {
  try {
    // Get username, repo and branch from regular storage
    const { githubUsername: username, githubRepository: repo, githubBranch: branch } = 
      await new Promise(resolve => {
        chrome.storage.local.get({
          githubUsername: null,
          githubRepository: null,
          githubBranch: 'main'
        }, resolve);
      });
    
    // Get token with encryption
    const accessToken = await secureGet(GITHUB_TOKEN_KEY, null, true);
    
    // Update local variables
    githubUsername = username;
    selectedRepository = repo;
    selectedBranch = branch || 'main';
    
    return {
      githubAccessToken: accessToken,
      githubUsername: username,
      githubRepository: repo,
      githubBranch: branch || 'main'
    };
  } catch (error) {
    console.error('Error loading GitHub config:', error);
    return {
      githubAccessToken: null,
      githubUsername: null,
      githubRepository: null,
      githubBranch: 'main'
    };
  }
}

// Save GitHub configuration
async function saveGitHubConfig(config) {
  try {
    // Store the token securely with encryption
    if (config.accessToken !== undefined) {
      await secureSet(GITHUB_TOKEN_KEY, config.accessToken, true);
    }
    
    // Store other config values in regular storage
    await new Promise(resolve => {
      chrome.storage.local.set({
        githubUsername: config.username || githubUsername,
        githubRepository: config.repository || selectedRepository,
        githubBranch: config.branch || selectedBranch
      }, resolve);
    });
    
    // Update the in-memory variables
    githubUsername = config.username || githubUsername;
    selectedRepository = config.repository || selectedRepository;
    selectedBranch = config.branch || selectedBranch;
    
    return true;
  } catch (error) {
    console.error('Error saving GitHub config:', error);
    throw error;
  }
}

// Authenticate with GitHub
async function authenticateWithGitHub() {
  try {
    // Use Chrome's identity API to authenticate with GitHub
    const redirectURL = chrome.identity.getRedirectURL();
    const clientId = await getClientId();
    
    // Request only the minimal permissions needed
    // public_repo - access to public repositories
    // If private repos are needed, use 'repo' scope, but avoid it if possible
    const authURL = new URL('https://github.com/login/oauth/authorize');
    authURL.searchParams.set('client_id', clientId);
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('scope', 'public_repo');
    authURL.searchParams.set('state', generateRandomState());
    
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authURL.toString(),
      interactive: true
    });
    
    // Extract the authorization code from the response URL
    const urlParams = new URLSearchParams(new URL(responseUrl).search);
    const authCode = urlParams.get('code');
    
    if (!authCode) {
      throw new Error('No authorization code received from GitHub');
    }
    
    // Exchange the code for an access token
    const tokenResponse = await exchangeCodeForToken(authCode, redirectURL, clientId);
    const accessToken = tokenResponse.access_token;
    
    // Get user info
    const userInfo = await fetchUserInfo(accessToken);
    githubUsername = userInfo.login;
    
    // Save the configuration
    await saveGitHubConfig({
      accessToken,
      username: githubUsername
    });
    
    return {
      accessToken,
      username: githubUsername
    };
  } catch (error) {
    console.error('GitHub authentication failed:', error);
    throw error;
  }
}

// Get client ID from manifest
async function getClientId() {
  return new Promise((resolve, reject) => {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id;
    
    if (!clientId || clientId === '${GITHUB_CLIENT_ID}') {
      reject(new Error('GitHub Client ID not configured in manifest'));
    } else {
      resolve(clientId);
    }
  });
}

// Generate a random state parameter for OAuth security
function generateRandomState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Exchange the authorization code for an access token
async function exchangeCodeForToken(code, redirectUri, clientId) {
  // NOTE: This should ideally happen on a server due to the client secret requirement
  // For this extension, we'll use GitHub's OAuth web flow which doesn't require a client secret
  // See: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
  
  // For demonstration, we're showing a simplified version
  // In production, you should use a proxy service or GitHub's device flow
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      // client_secret: CLIENT_SECRET, // This shouldn't be in client-side code
      code: code,
      redirect_uri: redirectUri
    })
  });
  
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Fetch user information from GitHub API
async function fetchUserInfo(token = null) {
  // If no token is provided, try to get it from storage
  if (!token) {
    token = await secureGet(GITHUB_TOKEN_KEY, null, true);
    if (!token) {
      throw new Error('Not authenticated with GitHub');
    }
  }
  
  const response = await fetch(`${API_BASE_URL}/user`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Fetch user's repositories
async function fetchRepositories() {
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  if (!token) {
    throw new Error('Not authenticated with GitHub');
  }
  
  const response = await fetch(`${API_BASE_URL}/user/repos?sort=updated&per_page=100`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Select a repository for saving data
async function selectRepository(repositoryName) {
  selectedRepository = repositoryName;
  
  // Save the configuration
  await saveGitHubConfig({
    repository: selectedRepository
  });
  
  return selectedRepository;
}

// Fetch branches for the selected repository
async function fetchBranches() {
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  if (!token || !githubUsername || !selectedRepository) {
    throw new Error('GitHub configuration incomplete');
  }
  
  const response = await fetch(`${API_BASE_URL}/repos/${githubUsername}/${selectedRepository}/branches`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch branches: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Select a branch for saving data
async function selectBranch(branchName) {
  selectedBranch = branchName;
  
  // Save the configuration
  await saveGitHubConfig({
    branch: selectedBranch
  });
  
  return selectedBranch;
}

// Check if file exists in the repository
async function checkFileExists(filePath) {
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  if (!token || !githubUsername || !selectedRepository) {
    throw new Error('GitHub configuration incomplete');
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/repos/${githubUsername}/${selectedRepository}/contents/${filePath}?ref=${selectedBranch}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.status === 404) {
      return false;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to check file existence: ${response.status} ${response.statusText}`);
    }
    
    return true;
  } catch (error) {
    if (error.message.includes('404')) {
      return false;
    }
    throw error;
  }
}

// Commit JSON data to the repository
async function commitJsonToRepository(filePath, jsonData, commitMessage) {
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  if (!token || !githubUsername || !selectedRepository) {
    throw new Error('GitHub configuration incomplete');
  }
  
  // Convert data to string if it's an object
  const content = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
  
  // Base64 encode the content
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  
  // Check if the file already exists to get its SHA
  let sha = null;
  const fileExists = await checkFileExists(filePath);
  
  if (fileExists) {
    const response = await fetch(`${API_BASE_URL}/repos/${githubUsername}/${selectedRepository}/contents/${filePath}?ref=${selectedBranch}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get file details: ${response.status} ${response.statusText}`);
    }
    
    const fileData = await response.json();
    sha = fileData.sha;
  }
  
  // Prepare the request body
  const requestBody = {
    message: commitMessage,
    content: base64Content,
    branch: selectedBranch
  };
  
  // Include SHA if the file exists (to update it)
  if (sha) {
    requestBody.sha = sha;
  }
  
  // Make the commit
  const response = await fetch(`${API_BASE_URL}/repos/${githubUsername}/${selectedRepository}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to commit to repository: ${response.status} ${response.statusText}\n${errorText}`);
  }
  
  return await response.json();
}

// Check if the user is authenticated with GitHub
async function isAuthenticated() {
  await loadGitHubConfig();
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  return !!token;
}

// Check if a repository is selected
async function hasSelectedRepository() {
  await loadGitHubConfig();
  return !!selectedRepository;
}

// Get the current GitHub configuration
async function getGitHubConfig() {
  await loadGitHubConfig();
  // Get token but don't include it in the returned config for security
  const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
  return {
    authenticated: !!token,
    username: githubUsername,
    repository: selectedRepository,
    branch: selectedBranch
  };
}

// Logout/disconnect from GitHub (with proper token revocation)
async function disconnectGitHub() {
  try {
    // Try to revoke the token if possible
    const token = await secureGet(GITHUB_TOKEN_KEY, null, true);
    if (token) {
      try {
        // Attempt to revoke the authorization token 
        // (This will fail without client secret, but we try anyway)
        await fetch(`${API_BASE_URL}/applications/${await getClientId()}/token`, {
          method: 'DELETE',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
      } catch (e) {
        // Ignore revocation errors - we'll still clear the local token
        console.log('Token revocation failed, continuing with local cleanup');
      }
    }
    
    // Reset all GitHub configuration
    await saveGitHubConfig({
      accessToken: null,
      username: null,
      repository: null,
      branch: 'main'
    });
    
    // Also clear in-memory variables
    githubUsername = null;
    selectedRepository = null;
    selectedBranch = 'main';
    
    return true;
  } catch (error) {
    console.error('Error disconnecting from GitHub:', error);
    throw error;
  }
}

// Export the functions
export {
  authenticateWithGitHub,
  fetchRepositories,
  selectRepository,
  fetchBranches,
  selectBranch,
  commitJsonToRepository,
  isAuthenticated,
  hasSelectedRepository,
  getGitHubConfig,
  disconnectGitHub
};