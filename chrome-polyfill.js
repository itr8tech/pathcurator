// Chrome Extension API Polyfill for Web App
// This provides compatibility for extension code running as a web app

// Initialize storage manager on load
let storageReady = false;
let storageManager = null;

// Import and initialize storage
import('./storage-manager.js').then(module => {
    storageManager = module.storageManager;
    return storageManager.init();
}).then(() => {
    storageReady = true;
    console.log('Storage manager initialized');
}).catch(err => {
    console.error('Failed to initialize storage:', err);
});

// Helper to ensure storage is ready
async function ensureStorageReady() {
    if (!storageReady) {
        // Wait for storage to be ready
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (storageReady) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
        });
    }
}

// Create chrome.storage.local API
window.chrome = window.chrome || {};
window.chrome.storage = {
    local: {
        get(keys, callback) {
            ensureStorageReady().then(async () => {
                try {
                    let result = {};
                    
                    if (keys === null || keys === undefined) {
                        // Get all data
                        const pathways = await storageManager.getPathways();
                        result.pathways = pathways;
                        
                        // Get all settings
                        const settings = await storageManager.getAll('settings');
                        settings.forEach(setting => {
                            result[setting.key] = setting.value;
                        });
                        
                        // Get GitHub config
                        const githubConfig = await storageManager.getGitHubConfig();
                        if (githubConfig) {
                            result.githubToken = githubConfig.token;
                            result.githubRepo = githubConfig.repo;
                            result.githubPath = githubConfig.path;
                        }
                    } else if (typeof keys === 'string') {
                        // Single key
                        if (keys === 'pathways') {
                            result.pathways = await storageManager.getPathways();
                        } else if (keys === 'githubToken' || keys === 'githubRepo' || keys === 'githubPath') {
                            const config = await storageManager.getGitHubConfig();
                            if (config) {
                                if (keys === 'githubToken') result.githubToken = config.token;
                                if (keys === 'githubRepo') result.githubRepo = config.repo;
                                if (keys === 'githubPath') result.githubPath = config.path;
                            }
                        } else {
                            const value = await storageManager.getSetting(keys);
                            if (value !== null) result[keys] = value;
                        }
                    } else if (Array.isArray(keys)) {
                        // Multiple keys
                        for (const key of keys) {
                            if (key === 'pathways') {
                                result.pathways = await storageManager.getPathways();
                            } else {
                                const value = await storageManager.getSetting(key);
                                if (value !== null) result[key] = value;
                            }
                        }
                    } else if (typeof keys === 'object') {
                        // Object with defaults
                        for (const [key, defaultValue] of Object.entries(keys)) {
                            if (key === 'pathways') {
                                result.pathways = await storageManager.getPathways();
                                if (result.pathways.length === 0) result.pathways = defaultValue;
                            } else {
                                const value = await storageManager.getSetting(key);
                                result[key] = value !== null ? value : defaultValue;
                            }
                        }
                    }
                    
                    if (callback) callback(result);
                } catch (error) {
                    console.error('Storage get error:', error);
                    if (callback) callback({});
                }
            });
        },
        
        set(items, callback) {
            console.log('Polyfill set() called with:', Object.keys(items));
            ensureStorageReady().then(async () => {
                try {
                    for (const [key, value] of Object.entries(items)) {
                        console.log(`Processing key: ${key}, value type: ${Array.isArray(value) ? 'array' : typeof value}, length: ${Array.isArray(value) ? value.length : 'N/A'}`);
                        if (key === 'pathways') {
                            // Handle pathways array
                            if (Array.isArray(value)) {
                                // Clear existing pathways and save new ones
                                const existingPathways = await storageManager.getPathways();
                                for (const pathway of existingPathways) {
                                    await storageManager.deletePathway(pathway.id);
                                }
                                // Save each pathway with generated ID and sort order
                                for (let i = 0; i < value.length; i++) {
                                    const pathway = value[i];
                                    // Generate ID based on creation time or index
                                    if (!pathway.id) {
                                        pathway.id = pathway.created ? pathway.created.toString() : Date.now().toString() + i;
                                    }
                                    // Set sort order to maintain array position
                                    pathway.sortOrder = i;
                                    console.log(`Saving pathway "${pathway.name}" with sortOrder: ${pathway.sortOrder}`);
                                    await storageManager.savePathway(pathway);
                                }
                            }
                        } else if (key === 'githubToken' || key === 'githubRepo' || key === 'githubPath') {
                            // Handle GitHub settings
                            const config = await storageManager.getGitHubConfig() || {};
                            if (key === 'githubToken') config.token = value;
                            if (key === 'githubRepo') config.repo = value;
                            if (key === 'githubPath') config.path = value;
                            await storageManager.setGitHubConfig(config);
                        } else {
                            // Regular setting
                            await storageManager.setSetting(key, value);
                        }
                    }
                    
                    if (callback) callback();
                } catch (error) {
                    console.error('Storage set error:', error);
                    if (callback) callback();
                }
            });
        },
        
        remove(keys, callback) {
            ensureStorageReady().then(async () => {
                try {
                    const keysArray = Array.isArray(keys) ? keys : [keys];
                    
                    for (const key of keysArray) {
                        if (key === 'pathways') {
                            // Clear all pathways
                            const pathways = await storageManager.getPathways();
                            for (const pathway of pathways) {
                                await storageManager.deletePathway(pathway.id);
                            }
                        } else if (key === 'githubToken' || key === 'githubRepo' || key === 'githubPath') {
                            // Remove GitHub setting
                            const config = await storageManager.getGitHubConfig() || {};
                            if (key === 'githubToken') delete config.token;
                            if (key === 'githubRepo') delete config.repo;
                            if (key === 'githubPath') delete config.path;
                            await storageManager.setGitHubConfig(config);
                        } else {
                            // Remove as setting
                            await storageManager.delete('settings', key);
                        }
                    }
                    
                    if (callback) callback();
                } catch (error) {
                    console.error('Storage remove error:', error);
                    if (callback) callback();
                }
            });
        },
        
        clear(callback) {
            ensureStorageReady().then(async () => {
                try {
                    // Clear all pathways
                    const pathways = await storageManager.getPathways();
                    for (const pathway of pathways) {
                        await storageManager.deletePathway(pathway.id);
                    }
                    
                    // Clear all settings
                    const settings = await storageManager.getAll('settings');
                    for (const setting of settings) {
                        await storageManager.delete('settings', setting.key);
                    }
                    
                    // Clear GitHub config
                    await storageManager.delete('github', 'config');
                    
                    if (callback) callback();
                } catch (error) {
                    console.error('Storage clear error:', error);
                    if (callback) callback();
                }
            });
        }
    }
};

// Other Chrome APIs
window.chrome.runtime = {
    getURL: (path) => path,
    sendMessage: () => {},
    onMessage: { addListener: () => {} }
};

window.chrome.tabs = {
    create: (options) => window.open(options.url, '_blank'),
    query: () => Promise.resolve([])
};

window.chrome.downloads = {
    download: (options) => {
        const a = document.createElement('a');
        a.href = options.url;
        a.download = options.filename || 'download';
        a.click();
    }
};

// Context menus (no-op for web)
window.chrome.contextMenus = {
    create: () => {},
    removeAll: () => {},
    onClicked: { addListener: () => {} }
};

// Identity (for encryption)
window.chrome.identity = {
    getProfileUserInfo: (callback) => {
        callback({ email: 'user@localhost', id: 'local-user' });
    }
};

console.log('Chrome polyfill loaded');