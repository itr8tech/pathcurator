// Bookmarklet handler page JavaScript

// Get query parameters for when this page is loaded as a bookmarklet handler
const urlParams = new URLSearchParams(window.location.search);
const bookmarkUrl = urlParams.get('url') || '';
const bookmarkTitle = urlParams.get('title') || '';
const bookmarkDescription = urlParams.get('description') || '';

// Check if this is being used as bookmarklet handler
const isBookmarkletHandler = bookmarkUrl || bookmarkTitle;

// Generate the bookmarklet code
function generateBookmarklet(baseUrl) {
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // Bookmarklet code that will run on any page
    const bookmarkletCode = `
    (function() {
        const url = encodeURIComponent(window.location.href);
        const title = encodeURIComponent(document.title);
        const description = encodeURIComponent(
            document.querySelector('meta[name="description"]')?.content || 
            document.querySelector('meta[property="og:description"]')?.content || 
            ''
        );
        
        // Open PathCurator bookmarklet handler in a new window
        const width = 600;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        window.open(
            '${baseUrl}bookmarklet.html?url=' + url + '&title=' + title + '&description=' + description,
            'PathCuratorBookmark',
            'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',toolbar=no,menubar=no,scrollbars=yes'
        );
    })();
    `.replace(/\s+/g, ' ').trim();
    
    return 'javascript:' + encodeURIComponent(bookmarkletCode);
}

// For standalone bookmarklet page functionality
if (isBookmarkletHandler) {
    // DOM elements
    const form = document.getElementById('bookmarkForm');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const success = document.getElementById('success');
    const pathwaySelect = document.getElementById('pathway');
    const stepSelect = document.getElementById('step');
    const stepGroup = document.getElementById('stepGroup');

    // Set up the bookmarklet link
    if (document.getElementById('bookmarkletLink')) {
        const baseUrl = window.location.origin + window.location.pathname.replace('bookmarklet.html', '');
        document.getElementById('bookmarkletLink').href = generateBookmarklet(baseUrl);
    }

    // Initialize the form
    async function init() {
        try {
            console.log('Initializing bookmarklet with:', { bookmarkUrl, bookmarkTitle, bookmarkDescription });
            
            // Set URL and title from query parameters
            if (document.getElementById('url')) {
                document.getElementById('url').value = decodeURIComponent(bookmarkUrl);
            }
            if (document.getElementById('title')) {
                document.getElementById('title').value = decodeURIComponent(bookmarkTitle);
            }
            if (document.getElementById('description') && bookmarkDescription) {
                document.getElementById('description').value = decodeURIComponent(bookmarkDescription);
            }
            
            // Wait for chrome polyfill to be ready AND enhanced
            await new Promise((resolve, reject) => {
                const checkStorageReady = () => {
                    if (window.chrome && window.chrome.storage && window.chromeStorageEnhanced) {
                        console.log('Chrome storage is ready and enhanced');
                        resolve();
                        return true;
                    }
                    return false;
                };
                
                if (checkStorageReady()) {
                    return;
                }
                
                console.log('Waiting for chrome storage enhancement...');
                const checkInterval = setInterval(() => {
                    if (checkStorageReady()) {
                        clearInterval(checkInterval);
                    }
                }, 100);
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error('Chrome storage API not properly enhanced. Please refresh the page and try again.'));
                }, 10000);
            });
            
            console.log('Chrome storage ready, loading pathways...');
            
            // Load pathways - try multiple storage methods
            let pathways = [];
            let storageMethod = 'unknown';
            
            try {
                // First try chrome.storage.local
                const result = await new Promise((resolve, reject) => {
                    chrome.storage.local.get('pathways', (data) => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(data);
                        }
                    });
                });
                
                console.log('Chrome storage result:', result);
                pathways = result.pathways || [];
                storageMethod = 'chrome.storage.local';
            } catch (chromeError) {
                console.log('Chrome storage failed, trying localStorage fallback:', chromeError);
                
                // Fallback to localStorage
                try {
                    const localData = localStorage.getItem('pathways');
                    if (localData) {
                        pathways = JSON.parse(localData);
                        storageMethod = 'localStorage';
                    }
                } catch (localError) {
                    console.log('localStorage failed too:', localError);
                }
            }
            
            console.log('Storage result:', { pathways, storageMethod, count: pathways.length });
            
            if (pathways.length === 0) {
                throw new Error('No pathways found. Please create a pathway first in the dashboard.');
            }
            
            // Populate pathway select
            pathways.forEach((pathway, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = pathway.name || `Pathway ${index + 1}`;
                pathwaySelect.appendChild(option);
            });
            
            // Show form
            loading.classList.add('d-none');
            form.classList.remove('d-none');
            
            // Handle pathway selection
            pathwaySelect.addEventListener('change', loadSteps);
            
        } catch (err) {
            showError(err.message);
        }
    }

    // Load steps for selected pathway
    async function loadSteps() {
        const pathwayIndex = pathwaySelect.value;
        
        if (!pathwayIndex && pathwayIndex !== '0') {
            stepGroup.classList.add('d-none');
            return;
        }
        
        try {
            const result = await new Promise((resolve, reject) => {
                chrome.storage.local.get('pathways', (data) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(data);
                    }
                });
            });
            
            const pathways = result.pathways || [];
            const pathway = pathways[pathwayIndex];
            
            if (!pathway || !pathway.steps || pathway.steps.length === 0) {
                throw new Error('No steps found in this pathway. Please add steps to the pathway first.');
            }
            
            // Clear and populate step select
            stepSelect.innerHTML = '<option value="">Choose a step...</option>';
            pathway.steps.forEach((step, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = step.name || `Step ${index + 1}`;
                stepSelect.appendChild(option);
            });
            
            stepGroup.classList.remove('d-none');
            
        } catch (err) {
            showError(err.message);
        }
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const pathwayIndex = parseInt(pathwaySelect.value);
            const stepIndex = parseInt(stepSelect.value);
            
            if (isNaN(pathwayIndex) || isNaN(stepIndex)) {
                showError('Please select both a pathway and a step.');
                return;
            }
            
            try {
                console.log('Starting bookmark save process...');
                console.log('Pathway index:', pathwayIndex, 'Step index:', stepIndex);
                
                const result = await new Promise((resolve, reject) => {
                    chrome.storage.local.get('pathways', (data) => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(data);
                        }
                    });
                });
                
                const pathways = result.pathways || [];
                console.log('Current pathways:', pathways.length, 'pathways loaded');
                console.log('Target pathway:', pathways[pathwayIndex]?.name);
                console.log('Target step:', pathways[pathwayIndex]?.steps[stepIndex]?.name);
                
                // Create new bookmark
                const newBookmark = {
                    url: document.getElementById('url').value,
                    title: document.getElementById('title').value,
                    description: document.getElementById('description').value,
                    type: document.getElementById('type').value,
                    contentType: document.getElementById('contentType').value,
                    context: document.getElementById('context').value,
                    required: document.getElementById('required').checked,
                    addedAt: Date.now()
                };
                
                console.log('New bookmark to add:', newBookmark);
                
                // Add bookmark to the selected step
                if (!pathways[pathwayIndex].steps[stepIndex].bookmarks) {
                    pathways[pathwayIndex].steps[stepIndex].bookmarks = [];
                }
                pathways[pathwayIndex].steps[stepIndex].bookmarks.push(newBookmark);
                
                console.log('Bookmark added to pathway, total bookmarks in step:', pathways[pathwayIndex].steps[stepIndex].bookmarks.length);
                
                // Update last modified
                pathways[pathwayIndex].lastUpdated = Date.now();
                
                console.log('Saving pathways to storage...');
                
                // Save pathways
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set({ pathways }, () => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            console.log('Pathways saved successfully to storage');
                            resolve();
                        }
                    });
                });
                
                // Verify the save worked by re-reading from storage
                console.log('Verifying save...');
                const verifyResult = await new Promise((resolve, reject) => {
                    chrome.storage.local.get('pathways', (data) => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(data);
                        }
                    });
                });
                
                const verifyPathways = verifyResult.pathways || [];
                const savedBookmarks = verifyPathways[pathwayIndex]?.steps[stepIndex]?.bookmarks || [];
                console.log('Verification: found', savedBookmarks.length, 'bookmarks in step after save');
                
                const justSaved = savedBookmarks.find(bm => bm.addedAt === newBookmark.addedAt);
                if (justSaved) {
                    console.log('SUCCESS: Bookmark verified in storage:', justSaved.title);
                } else {
                    console.warn('WARNING: Bookmark not found in verification check');
                }
                
                // Show success
                form.classList.add('d-none');
                success.classList.remove('d-none');
                
            } catch (err) {
                showError(err.message);
            }
        });
    }

    // Show error message
    function showError(message) {
        console.error('Bookmarklet error:', message);
        loading.classList.add('d-none');
        if (form) form.classList.add('d-none');
        error.classList.remove('d-none');
        errorMessage.textContent = message;
        
        // Also show alert for debugging
        alert('Bookmarklet Error: ' + message);
    }

    // Initialize on load if elements exist
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired, checking elements...');
        console.log('Form:', form, 'Loading:', loading);
        console.log('URL params:', urlParams.toString());
        
        if (form && loading) {
            console.log('Initializing bookmarklet form...');
            init().catch(err => {
                console.error('Init failed:', err);
                showError(err.message);
            });
        } else if (!bookmarkUrl && !bookmarkTitle) {
            console.log('No URL params detected, showing bookmarklet installation page');
            // This is the bookmarklet installation page
            loading.classList.add('d-none');
        } else {
            console.error('Required elements not found:', { form, loading });
            showError('Page elements not found. Please refresh and try again.');
        }
    });
}

// Export functions for use in other modules
export { generateBookmarklet };

// Create bookmarklet setup UI
export function createBookmarkletUI() {
    const currentUrl = window.location.origin + window.location.pathname.replace(/[^\/]*$/, '');
    const bookmarkletUrl = generateBookmarklet(currentUrl);
    
    return `
        <div class="bookmarklet-setup">
            <h3>Bookmarklet Setup</h3>
            <p>Drag this button to your bookmarks bar to quickly save bookmarks from any webpage:</p>
            <div class="text-center my-4">
                <a href="${bookmarkletUrl}" 
                   class="btn btn-lg btn-primary bookmarklet-button"
                   onclick="alert('Drag this button to your bookmarks bar!'); return false;">
                    <i class="bi bi-bookmark-plus"></i> Add to PathCurator
                </a>
            </div>
            <div class="alert alert-info">
                <h5>How to use:</h5>
                <ol>
                    <li>Drag the button above to your bookmarks bar</li>
                    <li>When viewing any webpage you want to save, click the bookmarklet</li>
                    <li>A popup will open allowing you to add the page to your pathways</li>
                </ol>
            </div>
            <div class="alert alert-warning">
                <strong>Alternative:</strong> You can also manually add bookmarks using the 
                "Add Bookmark" button in the navigation bar.
            </div>
        </div>
    `;
}