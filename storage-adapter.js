// Storage Adapter - Bridges chrome.storage.local calls to IndexedDB
// This allows existing code to work with minimal changes

import { storageManager } from './storage-manager.js';

// Create a chrome.storage.local compatible API
export const chromeStorageAdapter = {
    local: {
        // Get data from storage
        get(keys, callback) {
            // Make it work with both callback and promise style
            const promise = this._get(keys);
            if (callback) {
                promise.then(result => callback(result)).catch(() => callback({}));
            }
            return promise;
        },
        
        async _get(keys) {
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
                    result[keys] = await this.getKey(keys);
                } else if (Array.isArray(keys)) {
                    // Multiple keys
                    for (const key of keys) {
                        result[key] = await this.getKey(key);
                    }
                } else if (typeof keys === 'object') {
                    // Object with defaults
                    for (const [key, defaultValue] of Object.entries(keys)) {
                        const value = await this.getKey(key);
                        result[key] = value !== null ? value : defaultValue;
                    }
                }
                
                return result;
            } catch (error) {
                console.error('Storage get error:', error);
                return {};
            }
        },
        
        // Helper to get a single key
        async getKey(key) {
            if (key === 'pathways') {
                // Return pathways as array (extension format)
                const pathways = await storageManager.getPathways();
                // Sort by created date to maintain consistent order
                return pathways.sort((a, b) => (a.created || 0) - (b.created || 0));
            } else if (key === 'githubToken' || key === 'githubRepo' || key === 'githubPath') {
                const config = await storageManager.getGitHubConfig();
                if (config) {
                    if (key === 'githubToken') return config.token;
                    if (key === 'githubRepo') return config.repo;
                    if (key === 'githubPath') return config.path;
                }
                return null;
            } else {
                // Try as a pathway ID first
                const pathway = await storageManager.getPathway(key);
                if (pathway) return pathway;
                
                // Otherwise, it's a setting
                return await storageManager.getSetting(key);
            }
        },
        
        // Set data in storage
        set(items, callback) {
            const promise = this._set(items);
            if (callback) {
                promise.then(() => callback()).catch(() => callback());
            }
            return promise;
        },
        
        async _set(items) {
            try {
                for (const [key, value] of Object.entries(items)) {
                    if (key === 'pathways') {
                        // Handle pathways array (extension format)
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
                    } else if (value && typeof value === 'object' && value.id && value.steps) {
                        // This looks like a pathway object
                        await storageManager.savePathway(value);
                    } else {
                        // Regular setting
                        await storageManager.setSetting(key, value);
                    }
                }
            } catch (error) {
                console.error('Storage set error:', error);
            }
        },
        
        // Remove data from storage
        remove(keys, callback) {
            const promise = this._remove(keys);
            if (callback) {
                promise.then(() => callback()).catch(() => callback());
            }
            return promise;
        },
        
        async _remove(keys) {
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
                        // Try as pathway ID first
                        try {
                            await storageManager.deletePathway(key);
                        } catch {
                            // If not a pathway, remove as setting
                            await storageManager.delete('settings', key);
                        }
                    }
                }
            } catch (error) {
                console.error('Storage remove error:', error);
            }
        },
        
        // Clear all data
        clear(callback) {
            const promise = this._clear();
            if (callback) {
                promise.then(() => callback()).catch(() => callback());
            }
            return promise;
        },
        
        async _clear() {
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
            } catch (error) {
                console.error('Storage clear error:', error);
            }
        }
    }
};

// Make it globally available for existing code
window.chrome = window.chrome || {};
window.chrome.storage = chromeStorageAdapter;