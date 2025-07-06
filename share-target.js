// Parse shared data from URL parameters
const params = new URLSearchParams(window.location.search);
const sharedUrl = params.get('url') || '';
const sharedTitle = params.get('title') || '';
const sharedText = params.get('text') || '';

// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;
const themeIcon = themeToggle.querySelector('i');

// Initialize theme
const currentTheme = localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
html.setAttribute('data-bs-theme', currentTheme);
updateThemeIcon(currentTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    themeIcon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    themeToggle.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}

// Form elements
const loadingDiv = document.getElementById('loading');
const shareForm = document.getElementById('shareForm');
const successDiv = document.getElementById('success');
const errorDiv = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const urlInput = document.getElementById('url');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const pathwaySelect = document.getElementById('pathway');
const stepSelect = document.getElementById('step');
const contentTypeSelect = document.getElementById('contentType');
const cancelBtn = document.getElementById('cancelBtn');

// Initialize form with shared data
urlInput.value = sharedUrl;
titleInput.value = sharedTitle;
descriptionInput.value = sharedText;

// Load pathways and initialize form
async function initializeForm() {
    try {
        // Get pathways from Chrome storage
        const data = await chrome.storage.local.get(['pathways']);
        const pathways = data.pathways || [];
        
        if (pathways.length === 0) {
            throw new Error('No pathways found. Please create a pathway first.');
        }
        
        // Populate pathway dropdown
        pathways.forEach((pathway, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = pathway.title;
            pathwaySelect.appendChild(option);
        });
        
        // Handle pathway selection
        pathwaySelect.addEventListener('change', function() {
            const selectedIndex = this.value;
            stepSelect.innerHTML = '<option value="">Add to pathway (not in a step)</option>';
            
            if (selectedIndex !== '') {
                const selectedPathway = pathways[selectedIndex];
                if (selectedPathway.steps && selectedPathway.steps.length > 0) {
                    selectedPathway.steps.forEach((step, stepIndex) => {
                        const option = document.createElement('option');
                        option.value = stepIndex;
                        option.textContent = step.title;
                        stepSelect.appendChild(option);
                    });
                }
            }
        });
        
        // If no URL was shared, show error
        if (!sharedUrl) {
            throw new Error('No URL was shared. Please use the share functionality from another app.');
        }
        
        // Try to determine content type from URL
        if (sharedUrl.includes('youtube.com') || sharedUrl.includes('youtu.be') || 
            sharedUrl.includes('vimeo.com')) {
            contentTypeSelect.value = 'video';
        } else if (sharedUrl.includes('github.com')) {
            contentTypeSelect.value = 'tool';
        } else if (sharedUrl.includes('coursera.org') || sharedUrl.includes('udemy.com') || 
                   sharedUrl.includes('edx.org')) {
            contentTypeSelect.value = 'course';
        }
        
        // Show form
        loadingDiv.classList.add('d-none');
        shareForm.classList.remove('d-none');
        
    } catch (error) {
        showError(error.message);
    }
}

// Handle form submission
shareForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    try {
        const pathwayIndex = parseInt(pathwaySelect.value);
        const stepIndex = stepSelect.value ? parseInt(stepSelect.value) : null;
        
        // Get current pathways
        const data = await chrome.storage.local.get(['pathways']);
        const pathways = data.pathways || [];
        
        // Create bookmark object
        const bookmark = {
            id: Date.now().toString(),
            url: urlInput.value,
            title: titleInput.value,
            description: descriptionInput.value,
            contentType: contentTypeSelect.value,
            addedAt: new Date().toISOString(),
            source: 'web-share-api'
        };
        
        // Add bookmark to appropriate location
        if (stepIndex !== null) {
            // Add to specific step
            if (!pathways[pathwayIndex].steps[stepIndex].bookmarks) {
                pathways[pathwayIndex].steps[stepIndex].bookmarks = [];
            }
            pathways[pathwayIndex].steps[stepIndex].bookmarks.push(bookmark);
        } else {
            // Add to pathway root
            if (!pathways[pathwayIndex].bookmarks) {
                pathways[pathwayIndex].bookmarks = [];
            }
            pathways[pathwayIndex].bookmarks.push(bookmark);
        }
        
        // Update pathway modification time
        pathways[pathwayIndex].updatedAt = new Date().toISOString();
        
        // Save updated pathways
        await chrome.storage.local.set({ pathways });
        
        // Show success
        shareForm.classList.add('d-none');
        successDiv.classList.remove('d-none');
        
    } catch (error) {
        showError('Failed to add bookmark: ' + error.message);
    }
});

// Cancel button handler
cancelBtn.addEventListener('click', () => {
    window.close();
});

// Error display function
function showError(message) {
    loadingDiv.classList.add('d-none');
    shareForm.classList.add('d-none');
    errorMessage.textContent = message;
    errorDiv.classList.remove('d-none');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeForm);