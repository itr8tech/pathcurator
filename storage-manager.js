// Storage Manager - Handles data persistence using IndexedDB
// Replaces chrome.storage.local with web-compatible storage

export const storageManager = {
    db: null,
    dbName: 'PathCuratorDB',
    version: 1,
    
    // Initialize IndexedDB
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('pathways')) {
                    const pathwayStore = db.createObjectStore('pathways', { keyPath: 'id' });
                    pathwayStore.createIndex('title', 'title', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                
                if (!db.objectStoreNames.contains('github')) {
                    db.createObjectStore('github', { keyPath: 'key' });
                }
            };
        });
    },
    
    // Generic get operation
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Generic set operation
    async set(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    // Generic delete operation
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get all items from a store
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Pathway-specific methods
    async getPathways() {
        const pathways = await this.getAll('pathways');
        
        console.log('STORAGE-MANAGER: Raw pathways before sorting:', pathways.map(p => `${p.name} (sortOrder: ${p.sortOrder})`));
        
        // Sort by sortOrder if available, fallback to creation time
        const sorted = pathways.sort((a, b) => {
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
                console.log(`STORAGE-MANAGER: Comparing ${a.name} (${a.sortOrder}) vs ${b.name} (${b.sortOrder}) = ${a.sortOrder - b.sortOrder}`);
                return a.sortOrder - b.sortOrder;
            }
            console.log(`STORAGE-MANAGER: Fallback to creation time: ${a.name} vs ${b.name}`);
            return (a.created || 0) - (b.created || 0);
        });
        
        console.log('STORAGE-MANAGER: Final sorted order:', sorted.map(p => `${p.name} (sortOrder: ${p.sortOrder})`));
        return sorted;
    },
    
    async getPathway(id) {
        return this.get('pathways', id);
    },
    
    async savePathway(pathway) {
        if (!pathway.id) {
            pathway.id = Date.now().toString();
        }
        // Map extension field names to our storage format
        if (!pathway.createdDate && pathway.created) {
            pathway.createdDate = new Date(pathway.created).toISOString();
        } else if (!pathway.createdDate) {
            pathway.createdDate = new Date().toISOString();
        }
        pathway.modifiedDate = new Date().toISOString();
        
        // Ensure we have the extension fields
        if (!pathway.created) {
            pathway.created = Date.parse(pathway.createdDate);
        }
        
        // Map title to name if needed
        if (!pathway.title && pathway.name) {
            pathway.title = pathway.name;
        }
        
        await this.set('pathways', pathway);
        return pathway;
    },
    
    async updatePathway(id, pathway) {
        pathway.id = id;
        pathway.modifiedDate = new Date().toISOString();
        return this.set('pathways', pathway);
    },
    
    async deletePathway(id) {
        return this.delete('pathways', id);
    },
    
    // Settings methods
    async getSetting(key) {
        const result = await this.get('settings', key);
        return result ? result.value : null;
    },
    
    async setSetting(key, value) {
        return this.set('settings', { key, value });
    },
    
    // GitHub settings methods
    async getGitHubConfig() {
        const result = await this.get('github', 'config');
        return result ? result.value : null;
    },
    
    async setGitHubConfig(config) {
        return this.set('github', { key: 'config', value: config });
    },
    
    // Export all data (for backup)
    async exportAllData() {
        const pathways = await this.getPathways();
        const settings = await this.getAll('settings');
        const github = await this.getAll('github');
        
        return {
            version: this.version,
            exportDate: new Date().toISOString(),
            data: {
                pathways,
                settings,
                github
            }
        };
    },
    
    // Import data
    async importData(data) {
        // Clear existing data
        const transaction = this.db.transaction(['pathways', 'settings', 'github'], 'readwrite');
        
        // Clear stores
        await new Promise((resolve) => {
            let cleared = 0;
            ['pathways', 'settings', 'github'].forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => {
                    cleared++;
                    if (cleared === 3) resolve();
                };
            });
        });
        
        // Import new data
        if (data.data.pathways) {
            for (const pathway of data.data.pathways) {
                await this.set('pathways', pathway);
            }
        }
        
        if (data.data.settings) {
            for (const setting of data.data.settings) {
                await this.set('settings', setting);
            }
        }
        
        if (data.data.github) {
            for (const item of data.data.github) {
                await this.set('github', item);
            }
        }
    },
    
    // Check if storage is available and working
    async checkStorage() {
        try {
            const test = { id: 'test', data: 'test' };
            await this.set('pathways', test);
            const result = await this.get('pathways', 'test');
            await this.delete('pathways', 'test');
            return result && result.data === 'test';
        } catch (error) {
            console.error('Storage check failed:', error);
            return false;
        }
    }
};