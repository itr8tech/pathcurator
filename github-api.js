// GitHub API Integration Module
import { secureGet, secureSet } from './secure-storage.js';

// GitHub API constants
const GITHUB_API_URL = 'https://api.github.com';
const TOKEN_STORAGE_KEY = 'github_access_token';
const GITHUB_CONFIG_KEY = 'github_config';

// Get GitHub access token from secure storage
async function getAccessToken() {
  // In development mode, use localStorage
  if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
    console.log('Using localStorage for token (development mode)');
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  
  try {
    return await secureGet(TOKEN_STORAGE_KEY, null, true);
  } catch (error) {
    console.error('Error getting token from secure storage:', error);
    // Fallback to localStorage
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
}

// Save GitHub access token to secure storage
async function saveAccessToken(token) {
  // In development mode, use localStorage
  if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
    console.log('Using localStorage for token save (development mode)');
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    return true;
  }
  
  try {
    return await secureSet(TOKEN_STORAGE_KEY, token, true);
  } catch (error) {
    console.error('Error saving token to secure storage:', error);
    // Fallback to localStorage
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    return true;
  }
}

// Get GitHub configuration from storage
async function getGitHubConfig() {
  try {
    // First try localStorage for development
    if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
      console.log('Using localStorage for GitHub config (development mode)');
      const storedConfig = localStorage.getItem(GITHUB_CONFIG_KEY);
      if (storedConfig) {
        try {
          return JSON.parse(storedConfig);
        } catch (e) {
          console.error('Error parsing stored config:', e);
        }
      }
      return { 
        username: null,
        repository: null,
        branch: 'main',
        filepath: 'curator-pathways.json'
      };
    }
    
    // Check if chrome storage is available and working
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage API not available, falling back to direct storage manager');
      
      // Try to use storage manager directly
      try {
        const { storageManager } = await import('./storage-manager.js');
        const config = await storageManager.getGitHubConfig();
        return config || { 
          username: null,
          repository: null,
          branch: 'main',
          filepath: 'curator-pathways.json'
        };
      } catch (fallbackError) {
        console.error('Fallback storage manager failed:', fallbackError);
        return { 
          username: null,
          repository: null,
          branch: 'main',
          filepath: 'curator-pathways.json'
        };
      }
    }
    
    // Use a proper Promise wrapper for chrome.storage.local.get
    const data = await new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(GITHUB_CONFIG_KEY, (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
    console.log('Raw storage data for GitHub config:', data);
    
    // Handle cases where data is undefined or null
    if (!data || typeof data !== 'object') {
      console.warn('Chrome storage returned invalid data:', data);
      return { 
        username: null,
        repository: null,
        branch: 'main',
        filepath: 'curator-pathways.json'
      };
    }
    
    return data[GITHUB_CONFIG_KEY] || { 
      username: null,
      repository: null,
      branch: 'main',
      filepath: 'curator-pathways.json'
    };
  } catch (error) {
    console.error('Error getting GitHub config:', error);
    return { 
      username: null,
      repository: null,
      branch: 'main',
      filepath: 'curator-pathways.json'
    };
  }
}

// Save GitHub configuration to storage
async function saveGitHubConfig(config) {
  try {
    console.log('Saving GitHub config:', config);
    
    // First try localStorage for development
    if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
      console.log('Using localStorage for GitHub config save (development mode)');
      localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(config));
      return true;
    }
    
    // Check if chrome storage is available and working
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage API not available, falling back to direct storage manager');
      
      // Try to use storage manager directly
      try {
        const { storageManager } = await import('./storage-manager.js');
        const result = await storageManager.setGitHubConfig(config);
        console.log('GitHub config save result (storage manager):', result);
        return result;
      } catch (fallbackError) {
        console.error('Fallback storage manager save failed:', fallbackError);
        throw fallbackError;
      }
    }
    
    // Use a proper Promise wrapper for chrome.storage.local.set
    const result = await new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ [GITHUB_CONFIG_KEY]: config }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(true);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
    console.log('GitHub config save result:', result);
    return result;
  } catch (error) {
    console.error('Error saving GitHub config:', error);
    throw error;
  }
}

// Check if user is authenticated
async function isAuthenticated() {
  try {
    const token = await getAccessToken();
    if (token) {
      return true;
    }
    
    // Fallback: check if we have a username in config
    const config = await getGitHubConfig();
    return !!(config && config.username);
  } catch (error) {
    console.error('Error checking authentication:', error);
    
    // Last resort: check localStorage directly
    try {
      const storedToken = localStorage.getItem('github_token_backup');
      return !!storedToken;
    } catch (e) {
      return false;
    }
  }
}

// Get user information
async function getUserInfo() {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated with GitHub');
    
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid, clear it
        await saveAccessToken(null);
        throw new Error('GitHub authentication expired. Please log in again.');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error getting user info:', error);
    throw error;
  }
}

// Authenticate with GitHub (using personal access token)
async function authenticate() {
  try {
    // For security reasons, we don't use prompt() as it's not secure
    // Instead, we assume the token will be entered in the GitHub settings UI
    // This function should only be called from the settings UI with token as parameter
    
    // If no token is provided, return authentication error
    // The UI should handle getting the token from the user in a secure way
    return {
      error: 'Please enter a token in the GitHub Settings UI'
    };
  } catch (error) {
    console.error('GitHub authentication error:', error);
    throw error;
  }
}

// Authenticate with token (to be called from the settings UI)
async function authenticateWithToken(token) {
  try {
    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new Error('Invalid token provided');
    }
    
    // Validate the token by making a request to the GitHub API
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Invalid GitHub token: ${response.status} ${response.statusText}`);
    }
    
    // Token is valid, save it securely
    await saveAccessToken(token);
    
    // Also save a backup in localStorage for fallback
    try {
      localStorage.setItem('github_token_backup', 'authenticated');
    } catch (e) {
      console.warn('Could not save backup auth state');
    }
    
    // Get and save the user info
    const userInfo = await response.json();
    console.log('GitHub user info received:', userInfo);
    
    const config = await getGitHubConfig();
    console.log('Current GitHub config before update:', config);
    
    config.username = userInfo.login;
    console.log('Updated GitHub config with username:', config);
    
    await saveGitHubConfig(config);
    console.log('GitHub config saved successfully');
    
    // Verify the save worked
    const savedConfig = await getGitHubConfig();
    console.log('Verified saved GitHub config:', savedConfig);
    
    return userInfo;
  } catch (error) {
    console.error('GitHub authentication error:', error);
    throw error;
  }
}

// Get repositories for the authenticated user
async function getRepositories() {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated with GitHub');
    
    const response = await fetch(`${GITHUB_API_URL}/user/repos?sort=updated`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching repositories:', error);
    throw error;
  }
}

// Get branches for a specific repository
async function getBranches(repo) {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated with GitHub');
    
    const config = await getGitHubConfig();
    const username = config.username;
    
    if (!username) throw new Error('GitHub username not found');
    if (!repo) throw new Error('Repository name is required');
    
    const response = await fetch(`${GITHUB_API_URL}/repos/${username}/${repo}/branches`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch branches: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching branches:', error);
    throw error;
  }
}

// Commit a file to a GitHub repository
async function commitFile(content, message, customFilepath = null) {
  try {
    // Validate input
    if (!content) throw new Error('No content provided to commit');
    
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated with GitHub');
    
    const config = await getGitHubConfig();
    const { username, repository, branch } = config;
    // Use custom filepath if provided, otherwise use the one from config
    const filepath = customFilepath || config.filepath;
    
    if (!username) throw new Error('GitHub username not found');
    if (!repository) throw new Error('Repository not selected');
    if (!filepath) throw new Error('File path not specified');
    
    // Convert the content to Base64
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    
    // Check if file already exists to get its SHA
    let sha = null;
    try {
      const fileResponse = await fetch(`${GITHUB_API_URL}/repos/${username}/${repository}/contents/${filepath}?ref=${branch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (fileResponse.ok) {
        const fileData = await fileResponse.json();
        sha = fileData.sha;
      }
    } catch (error) {
      console.log('File does not exist yet, creating new file');
    }
    
    // Prepare the commit data
    const commitData = {
      message: message || `Update ${filepath}`,
      content: base64Content,
      branch
    };
    
    // If file exists, include its SHA to update it
    if (sha) {
      commitData.sha = sha;
    }
    
    // Commit the file
    const response = await fetch(`${GITHUB_API_URL}/repos/${username}/${repository}/contents/${filepath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(commitData)
    });

    if (!response.ok) {
      const errorData = await response.json();

      // Special handling for 409 conflict errors
      if (response.status === 409) {
        throw new Error(`Failed to commit file: 409 - ${errorData.message}\n\nThe file has been modified on GitHub since your last sync. Use the 'Import from GitHub' option first to sync your local data, then try again.`);
      }

      throw new Error(`Failed to commit file: ${response.status} ${response.statusText} - ${errorData.message}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error committing file to GitHub:', error);
    throw error;
  }
}

// Log out from GitHub (clear token)
async function logout() {
  try {
    // Clear the token securely
    await saveAccessToken(null);
    
    // Clear the backup
    try {
      localStorage.removeItem('github_token_backup');
    } catch (e) {
      console.warn('Could not clear backup auth state');
    }
    
    // Reset the config except for filepath
    const config = await getGitHubConfig();
    config.username = null;
    config.repository = null;
    config.branch = 'main';
    await saveGitHubConfig(config);
    
    return true;
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
}

// Configure GitHub repository settings
async function configureRepository(repository, branch, filepath) {
  try {
    const config = await getGitHubConfig();
    
    if (repository) config.repository = repository;
    if (branch) config.branch = branch;
    if (filepath) config.filepath = filepath;
    
    await saveGitHubConfig(config);
    return config;
  } catch (error) {
    console.error('Error configuring repository:', error);
    throw error;
  }
}

// Get file content from GitHub repository
async function getFileContent(filepath = null) {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated with GitHub');
    
    const config = await getGitHubConfig();
    const { username, repository, branch } = config;
    // Use provided filepath or default from config
    const path = filepath || config.filepath;
    
    if (!username) throw new Error('GitHub username not found');
    if (!repository) throw new Error('Repository not selected');
    if (!path) throw new Error('File path not specified');
    
    const response = await fetch(`${GITHUB_API_URL}/repos/${username}/${repository}/contents/${path}?ref=${branch}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.status === 404) {
      return { exists: false };
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }
    
    const fileData = await response.json();
    // Decode content from base64
    const content = decodeURIComponent(escape(atob(fileData.content)));
    
    return { 
      exists: true, 
      content,
      sha: fileData.sha,
      size: fileData.size,
      url: fileData.html_url
    };
  } catch (error) {
    console.error('Error fetching file from GitHub:', error);
    if (error.message.includes('404')) {
      return { exists: false };
    }
    throw error;
  }
}

// Export functions
export {
  isAuthenticated,
  getUserInfo,
  authenticate,
  authenticateWithToken,
  getRepositories,
  getBranches,
  commitFile,
  logout,
  getGitHubConfig,
  configureRepository,
  getFileContent
};