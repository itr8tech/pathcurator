// Dashboard adapter for SPA mode
// This provides router-compatible functions for the dashboard

// Override navigation functions to use router
function createNewPathway() {
    window.location.hash = '#/edit-pathway/new';
}

// Override all the navigation functions in dashboard.js
window.createNewPathway = createNewPathway;

// Patch other navigation functions once dashboard.js loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for dashboard.js to load
    setTimeout(() => {
        // Override the original createNewPathway if it exists
        if (window.createNewPathway !== createNewPathway) {
            window.createNewPathway = createNewPathway;
        }
        
        // Patch any click handlers that might be set up
        const addPathwayBtn = document.getElementById('addPathway');
        if (addPathwayBtn) {
            // Remove existing listeners and add our own
            addPathwayBtn.removeEventListener('click', window.createNewPathway);
            addPathwayBtn.addEventListener('click', createNewPathway);
        }
        
        const emptyStateBtn = document.getElementById('emptyStateBtn');
        if (emptyStateBtn) {
            emptyStateBtn.removeEventListener('click', window.createNewPathway);
            emptyStateBtn.addEventListener('click', createNewPathway);
        }
    }, 100);
});

// Export for module use
export { createNewPathway };