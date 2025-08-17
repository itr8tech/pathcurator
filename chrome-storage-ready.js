// Chrome Storage Ready - Ensures storage is enhanced before use

let storageReady = false;
let storageManager = null;

// Promise that resolves when storage is ready
const storageReadyPromise = new Promise(async (resolve, reject) => {
    try {
        console.log('Initializing storage manager...');
        
        // Dynamic import the storage manager
        const { storageManager: sm } = await import('./storage-manager.js');
        storageManager = sm;
        
        // Initialize IndexedDB
        await storageManager.init();
        
        console.log('Storage manager ready!');
        storageReady = true;
        resolve(storageManager);
    } catch (error) {
        console.error('Failed to initialize storage manager:', error);
        reject(error);
    }
});

// Enhanced chrome storage that waits for IndexedDB to be ready
const createEnhancedStorage = () => ({
    get: function(keys, callback) {
        storageReadyPromise.then(async () => {
            try {
                let result = {};
                
                if (keys === null || keys === undefined) {
                    // Get all data
                    const pathwaysFromDB = await storageManager.getPathways();
                    // Use storage-manager's sorting (by sortOrder, fallback to creation time)
                    result.pathways = pathwaysFromDB;
                    
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
                        const pathwaysFromDB = await storageManager.getPathways();
                        result.pathways = pathwaysFromDB;
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
                            const pathwaysFromDB = await storageManager.getPathways();
                            result.pathways = pathwaysFromDB;
                        } else {
                            const value = await storageManager.getSetting(key);
                            if (value !== null) result[key] = value;
                        }
                    }
                } else if (typeof keys === 'object') {
                    // Object with defaults
                    for (const [key, defaultValue] of Object.entries(keys)) {
                        if (key === 'pathways') {
                            const pathwaysFromDB = await storageManager.getPathways();
                            result.pathways = pathwaysFromDB;
                            if (result.pathways.length === 0) result.pathways = defaultValue;
                        } else {
                            const value = await storageManager.getSetting(key);
                            result[key] = value !== null ? value : defaultValue;
                        }
                    }
                }
                
                console.log('=== STORAGE GET RESULT ===');
                console.log('Requesting keys:', keys);
                console.log('Result keys:', Object.keys(result));
                if (result.pathways) {
                    console.log('Pathways count:', result.pathways.length);
                    console.log('Pathways array is valid:', Array.isArray(result.pathways));
                    result.pathways.forEach((p, i) => {
                        console.log(`Pathway ${i}:`, {
                            name: p.name,
                            id: p.id,
                            created: p.created,
                            stepsCount: p.steps?.length || 0
                        });
                    });
                } else {
                    console.log('No pathways in result');
                }
                console.log('=== END STORAGE GET RESULT ===');
                if (callback) callback(result);
            } catch (error) {
                console.error('Storage get error:', error);
                if (callback) callback({});
            }
        }).catch(error => {
            console.error('Storage not ready:', error);
            if (callback) callback({});
        });
    },
    
    set: function(items, callback) {
        console.log('=== STORAGE SET START ===');
        console.log('Storage set called (enhanced):', items);
        console.log('Is pathways an array?', Array.isArray(items.pathways));
        console.log('Pathways length:', items.pathways?.length);
        
        storageReadyPromise.then(async () => {
            try {
                for (const [key, value] of Object.entries(items)) {
                    if (key === 'pathways') {
                        // Handle pathways array
                        if (Array.isArray(value)) {
                            console.log('Saving pathways array with', value.length, 'items');
                            
                            // Get existing pathways to preserve IDs for existing items
                            const existingPathways = await storageManager.getPathways();
                            const existingSorted = existingPathways;
                            
                            console.log('Current existing pathways:', existingSorted.length);
                            console.log('New pathways to save:', value.length);
                            
                            // Instead of clearing all and re-saving, update each pathway individually
                            const pathwaysToDelete = [];
                            const pathwaysToKeep = new Set();
                            
                            // Process each pathway in the new array
                            for (let i = 0; i < value.length; i++) {
                                const pathway = value[i];
                                
                                console.log(`Processing pathway ${i}:`, {
                                    name: pathway.name,
                                    hasSteps: !!pathway.steps,
                                    stepsCount: pathway.steps?.length || 0,
                                    currentId: pathway.id
                                });
                                
                                // Try to preserve ID from existing pathway at same index
                                if (existingSorted[i] && existingSorted[i].id) {
                                    pathway.id = existingSorted[i].id;
                                    console.log(`Using existing ID: ${pathway.id}`);
                                } else if (!pathway.id) {
                                    // Generate new ID
                                    pathway.id = pathway.created ? pathway.created.toString() : Date.now().toString() + '_' + i;
                                    console.log(`Generated new ID: ${pathway.id}`);
                                }
                                
                                pathwaysToKeep.add(pathway.id);
                                
                                // Set sort order to maintain array position
                                pathway.sortOrder = i;
                                console.log(`About to save pathway ${i} with ID ${pathway.id} and sortOrder ${pathway.sortOrder}. Steps:`, pathway.steps?.length);
                                await storageManager.savePathway(pathway);
                                console.log(`Successfully saved pathway ${i}`);
                            }
                            
                            // Only delete pathways that are no longer in the array
                            for (const existing of existingPathways) {
                                if (!pathwaysToKeep.has(existing.id)) {
                                    console.log('Deleting pathway that is no longer in array:', existing.id, existing.name);
                                    await storageManager.deletePathway(existing.id);
                                }
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
                
                console.log('=== STORAGE SET COMPLETED SUCCESSFULLY ===');
                if (callback) callback();
            } catch (error) {
                console.error('Storage set error:', error);
                if (callback) callback();
            }
        }).catch(error => {
            console.error('Storage not ready for set:', error);
            if (callback) callback();
        });
    },
    
    remove: function(keys, callback) {
        storageReadyPromise.then(async () => {
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
        }).catch(error => {
            console.error('Storage not ready for remove:', error);
            if (callback) callback();
        });
    },
    
    clear: function(callback) {
        storageReadyPromise.then(async () => {
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
        }).catch(error => {
            console.error('Storage not ready for clear:', error);
            if (callback) callback();
        });
    }
});

// Replace the chrome storage API immediately
if (window.chrome && window.chrome.storage) {
    console.log('Replacing chrome.storage.local with enhanced version');
    window.chrome.storage.local = createEnhancedStorage();
    window.chromeStorageEnhanced = true;
}

// Export the promise for other modules to use
window.storageReadyPromise = storageReadyPromise;