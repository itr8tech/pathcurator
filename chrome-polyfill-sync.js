// Chrome Extension API Polyfill - Synchronous version
// This provides immediate compatibility for extension code

// Create chrome API stubs immediately
window.chrome = window.chrome || {};

console.log('Chrome polyfill starting...');

// Track enhancement status
window.chromeStorageEnhanced = false;

// Basic storage API (will be enhanced once IndexedDB is ready)
window.chrome.storage = {
    local: {
        get: function(keys, callback) {
            console.log('Chrome storage get called (basic):', keys);
            // Temporary implementation that returns empty data
            // This prevents immediate errors while async storage loads
            setTimeout(() => {
                try {
                    if (typeof keys === 'object' && !Array.isArray(keys)) {
                        // Object with defaults
                        const result = {};
                        for (const [key, defaultValue] of Object.entries(keys)) {
                            result[key] = defaultValue;
                        }
                        console.log('Chrome storage get result (basic):', result);
                        if (callback) callback(result);
                    } else {
                        console.log('Chrome storage get result (basic): {}');
                        if (callback) callback({});
                    }
                } catch (error) {
                    console.error('Error in basic storage get:', error);
                    if (callback) callback({});
                }
            }, 0);
        },
        set: function(items, callback) {
            console.log('Chrome storage set called (basic):', items);
            console.warn('WARNING: Using basic storage - data will not persist!');
            // No-op for now
            setTimeout(() => {
                if (callback) callback();
            }, 0);
        },
        remove: function(keys, callback) {
            console.log('Chrome storage remove called (basic):', keys);
            setTimeout(() => {
                if (callback) callback();
            }, 0);
        },
        clear: function(callback) {
            console.log('Chrome storage clear called (basic)');
            setTimeout(() => {
                if (callback) callback();
            }, 0);
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

console.log('Chrome polyfill (sync) loaded');

// Now load the async storage enhancement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceStorage);
} else {
    enhanceStorage();
}

function enhanceStorage() {
    console.log('Attempting to enhance storage...');
    // Dynamically import and enhance the storage API
    import('./storage-manager.js').then(({ storageManager }) => {
        console.log('Storage manager imported, initializing...');
        return storageManager.init().then(() => {
            console.log('Storage manager ready, enhancing chrome.storage API');
            
            // Replace the basic storage API with the full implementation
            window.chrome.storage.local = {
                get: function(keys, callback) {
                    (async () => {
                        try {
                            let result = {};
                            
                            if (keys === null || keys === undefined) {
                                // Get all data
                                const pathways = await storageManager.getPathways();
                                result.pathways = pathways.sort((a, b) => (a.created || 0) - (b.created || 0));
                                
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
                                    result.pathways = result.pathways.sort((a, b) => (a.created || 0) - (b.created || 0));
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
                                        result.pathways = result.pathways.sort((a, b) => (a.created || 0) - (b.created || 0));
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
                                        result.pathways = result.pathways.sort((a, b) => (a.created || 0) - (b.created || 0));
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
                    })();
                },
                
                set: function(items, callback) {
                    (async () => {
                        try {
                            for (const [key, value] of Object.entries(items)) {
                                if (key === 'pathways') {
                                    // Handle pathways array
                                    if (Array.isArray(value)) {
                                        // Clear existing pathways and save new ones
                                        const existingPathways = await storageManager.getPathways();
                                        for (const pathway of existingPathways) {
                                            await storageManager.deletePathway(pathway.id);
                                        }
                                        // Save each pathway with generated ID
                                        for (let i = 0; i < value.length; i++) {
                                            const pathway = value[i];
                                            // Generate ID based on creation time or index
                                            if (!pathway.id) {
                                                pathway.id = pathway.created ? pathway.created.toString() : Date.now().toString() + i;
                                            }
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
                    })();
                },
                
                remove: function(keys, callback) {
                    (async () => {
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
                    })();
                },
                
                clear: function(callback) {
                    (async () => {
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
                    })();
                }
            };
            
            window.chromeStorageEnhanced = true;
            console.log('Chrome storage API enhanced with IndexedDB');
        });
    }).catch(err => {
        console.error('Failed to enhance storage API:', err);
        console.error('Keeping basic storage API as fallback');
    });
}