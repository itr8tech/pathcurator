// PathCurator Web App - Main Application
import { router } from './router.js';
import { storageManager } from './storage-manager.js';
import { chromeStorageAdapter } from './storage-adapter.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize storage
    await storageManager.init();
    
    // Set up routing
    router.init();
    
    // Set up add bookmark button
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const addBookmarkModal = new bootstrap.Modal(document.getElementById('addBookmarkModal'));
    
    addBookmarkBtn.addEventListener('click', () => {
        loadPathwaysForBookmark();
        addBookmarkModal.show();
    });
    
    // Handle bookmark form submission
    document.getElementById('saveBookmarkBtn').addEventListener('click', async () => {
        const form = document.getElementById('bookmarkForm');
        if (form.checkValidity()) {
            await saveBookmark();
            addBookmarkModal.hide();
            form.reset();
            // Refresh current view
            router.navigate(window.location.hash);
        } else {
            form.reportValidity();
        }
    });
    
    // Handle pathway selection change
    document.getElementById('bookmarkPathway').addEventListener('change', (e) => {
        if (e.target.value) {
            loadStepsForPathway(e.target.value);
        }
    });
});

// Load pathways for bookmark modal
async function loadPathwaysForBookmark() {
    const pathways = await storageManager.getPathways();
    const select = document.getElementById('bookmarkPathway');
    select.innerHTML = '<option value="">Select a pathway...</option>';
    
    pathways.forEach(pathway => {
        const option = document.createElement('option');
        option.value = pathway.id;
        option.textContent = pathway.title || pathway.name;
        select.appendChild(option);
    });
}

// Load steps for selected pathway
async function loadStepsForPathway(pathwayId) {
    const pathway = await storageManager.getPathway(pathwayId);
    const select = document.getElementById('bookmarkStep');
    select.innerHTML = '<option value="">Select a step...</option>';
    
    if (pathway && pathway.steps) {
        pathway.steps.forEach((step, index) => {
            const option = document.createElement('option');
            option.value = step.id || index.toString();
            option.textContent = step.title || step.name;
            select.appendChild(option);
        });
    }
}

// Save bookmark
async function saveBookmark() {
    const url = document.getElementById('bookmarkUrl').value;
    const title = document.getElementById('bookmarkTitle').value;
    const pathwayId = document.getElementById('bookmarkPathway').value;
    const stepId = document.getElementById('bookmarkStep').value;
    
    const bookmark = {
        id: Date.now().toString(),
        url: url,
        title: title,
        description: '',
        type: 'read',
        required: false,
        addedDate: new Date().toISOString()
    };
    
    // Get the pathway and add bookmark to the specified step
    const pathway = await storageManager.getPathway(pathwayId);
    if (pathway) {
        // Find step by ID or index
        let step;
        if (pathway.steps && pathway.steps.length > 0) {
            step = pathway.steps.find(s => s.id === stepId);
            if (!step && !isNaN(parseInt(stepId))) {
                // Try to find by index if ID not found
                step = pathway.steps[parseInt(stepId)];
            }
        }
        
        if (step) {
            if (!step.bookmarks) {
                step.bookmarks = [];
            }
            step.bookmarks.push(bookmark);
            await storageManager.updatePathway(pathwayId, pathway);
        }
    }
}

// Export for use in other modules
window.app = {
    storageManager,
    router,
    loadPathwaysForBookmark,
    loadStepsForPathway
};