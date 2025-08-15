// Edit Bookmark JS
import { updatePathwayVersion } from './version-utils.js';

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Get parameters from URL
const getParams = () => {
  const params = new URLSearchParams(location.search);
  return {
    pathwayId: params.get('pathwayId'),
    stepIndex: params.get('stepIndex'),
    bookmarkIndex: params.get('bookmarkIndex')
  };
};

// Save helper
const save = async (pathways, pathwayIndex, cb) => {
  try {
    // Update version and lastUpdated timestamp whenever saving
    if (pathwayIndex !== undefined && pathways[pathwayIndex]) {
      // First create a deep copy to ensure we don't lose any nested data
      const pathwayCopy = JSON.parse(JSON.stringify(pathways[pathwayIndex]));
      // Then update the version
      const updatedPathway = await updatePathwayVersion(pathwayCopy);
      pathways[pathwayIndex] = updatedPathway;
    }

    chrome.storage.local.set({pathways}, cb);
  } catch (error) {
    console.error('Error in save function:', error);
    // Call callback even on error
    if (typeof cb === 'function') cb();
  }
};

// Theme handling functions
function getPreferredTheme() {
  // Check if user has already set a preference
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme) {
    return storedTheme;
  }
  
  // Otherwise, respect OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Update the icon
  const themeIcon = document.getElementById('theme-toggle').querySelector('i');
  if (theme === 'dark') {
    themeIcon.classList.remove('bi-moon-stars-fill');
    themeIcon.classList.add('bi-sun-fill');
  } else {
    themeIcon.classList.remove('bi-sun-fill');
    themeIcon.classList.add('bi-moon-stars-fill');
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-bs-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// Load steps for selection
function loadSteps(selectedStepIndex) {
  const { pathwayId } = getParams();
  
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[parseInt(pathwayId)];
    if (!pathway) return;
    
    const stepSelect = $('#stepSelect');
    // Clear existing options safely
    stepSelect.innerHTML = '';
    
    // Add options using DOM methods to prevent XSS
    pathway.steps.forEach((step, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = step.name; // Safe - uses textContent instead of innerHTML
      if (index === parseInt(selectedStepIndex)) {
        option.selected = true;
      }
      stepSelect.appendChild(option);
    });
  });
}

// Load bookmark data for editing
function loadBookmarkData() {
  const { pathwayId, stepIndex, bookmarkIndex } = getParams();
  
  // If no bookmark index is provided, we're creating a new bookmark
  if (bookmarkIndex === null) {
    // Set page title to "Create Bookmark"
    document.title = "Create Bookmark - Curator";
    $('h1').textContent = "Create Bookmark";
    
    // Load steps for selection
    loadSteps(stepIndex);
    return;
  }
  
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[parseInt(pathwayId)];
    if (!pathway) {
      alert('Pathway not found');
      navigateBack();
      return;
    }
    
    const step = pathway.steps[stepIndex];
    if (!step) {
      alert('Step not found');
      navigateBack();
      return;
    }
    
    const bookmark = step.bookmarks[bookmarkIndex];
    if (!bookmark) {
      alert('Bookmark not found');
      navigateBack();
      return;
    }
    
    // Populate form fields
    $('#bookmarkTitle').value = bookmark.title;
    $('#bookmarkUrl').value = bookmark.url;
    $('#bookmarkDescription').value = bookmark.description || '';
    $('#bookmarkContext').value = bookmark.context || '';
    
    // Determine bookmark type based on required field (primary) or type field (legacy)
    let bookmarkType = 'Required'; // Default
    if (bookmark.required === false || bookmark.type === 'bonus' || bookmark.type === 'Bonus') {
      bookmarkType = 'Bonus';
    } else if (bookmark.required === true || bookmark.type === 'required' || bookmark.type === 'Required') {
      bookmarkType = 'Required';
    }
    $('#bookmarkType').value = bookmarkType;
    
    // Set content type (default to "Read" if not set)
    const contentType = bookmark.contentType || 'Read';
    $('#bookmarkContentType').value = contentType;
    
    // Load steps for selection
    loadSteps(stepIndex);
  });
}

// Save bookmark data
async function saveBookmark(e) {
  e.preventDefault();
  
  const title = $('#bookmarkTitle').value.trim();
  const url = $('#bookmarkUrl').value.trim();
  const description = $('#bookmarkDescription').value;
  const context = $('#bookmarkContext').value;
  const type = $('#bookmarkType').value;
  const contentType = $('#bookmarkContentType').value;
  const targetStepIndex = parseInt($('#stepSelect').value);
  
  if (!title || !url) {
    alert('Title and URL are required');
    return;
  }
  
  const { pathwayId, stepIndex, bookmarkIndex } = getParams();
  
  if (!pathwayId || stepIndex === null) {
    alert('Pathway and step information is required');
    return;
  }
  
  chrome.storage.local.get({pathways: []}, async ({pathways}) => {
    try {
      // Create a deep copy of the pathways array to avoid reference issues
      const pathwaysCopy = JSON.parse(JSON.stringify(pathways));
      
      const pathway = pathwaysCopy[pathwayId];
      if (!pathway) {
        alert('Pathway not found');
        return;
      }
      
      // Create bookmark object
      const bookmark = {
        title,
        url,
        description,
        context,
        type,
        required: type === 'Required' ? true : false, // Set required field based on type
        contentType,
        added: Date.now(),
        // Link audit fields
        lastChecked: null,
        status: null,
        available: null,
        redirectUrl: null,
        checkError: null
      };
      
      // If editing existing bookmark, preserve certain fields
      if (bookmarkIndex !== null) {
        const originalBookmark = pathway.steps[stepIndex]?.bookmarks[bookmarkIndex];
        if (originalBookmark) {
          // Preserve original added date
          if (originalBookmark.added) {
            bookmark.added = originalBookmark.added;
          }
          // Preserve link audit fields if they exist
          if (originalBookmark.lastChecked) bookmark.lastChecked = originalBookmark.lastChecked;
          if (originalBookmark.status !== null) bookmark.status = originalBookmark.status;
          if (originalBookmark.available !== null) bookmark.available = originalBookmark.available;
          if (originalBookmark.redirectUrl) bookmark.redirectUrl = originalBookmark.redirectUrl;
          if (originalBookmark.checkError) bookmark.checkError = originalBookmark.checkError;
        }
      }
      
      // Check if the step is changing
      if (targetStepIndex !== parseInt(stepIndex)) {
        // Remove from original step if editing an existing bookmark
        if (bookmarkIndex !== null) {
          pathway.steps[stepIndex].bookmarks.splice(bookmarkIndex, 1);
        }
        
        // Add to target step
        pathway.steps[targetStepIndex].bookmarks = pathway.steps[targetStepIndex].bookmarks || [];
        pathway.steps[targetStepIndex].bookmarks.push(bookmark);
      } else {
        // Operate on the same step
        if (bookmarkIndex !== null) {
          // Update existing bookmark
          pathway.steps[stepIndex].bookmarks[bookmarkIndex] = bookmark;
        } else {
          // Add new bookmark
          pathway.steps[stepIndex].bookmarks = pathway.steps[stepIndex].bookmarks || [];
          pathway.steps[stepIndex].bookmarks.push(bookmark);
        }
      }
      
      // Save changes with version update
      await save(pathwaysCopy, parseInt(pathwayId), () => {
        // Log success for debugging
        console.log('Bookmark saved successfully');
        
        // Navigate back to pathway detail
        window.location.href = `pathway-detail.html?id=${pathwayId}`;
      });
    } catch (error) {
      console.error('Error saving bookmark:', error);
      alert('Error saving bookmark. Please try again.');
    }
  });
}

// Handle navigation
function navigateBack() {
  const { pathwayId } = getParams();
  if (pathwayId) {
    window.location.href = `pathway-detail.html?id=${pathwayId}`;
  } else {
    window.location.href = 'dashboard.html';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme based on preference
  setTheme(getPreferredTheme());
  
  // Add theme toggle handler
  $('#theme-toggle').addEventListener('click', toggleTheme);
  
  loadBookmarkData();
  
  // Set up event listeners
  $('#bookmarkForm').addEventListener('submit', async (e) => {
    try {
      await saveBookmark(e);
    } catch (error) {
      console.error('Error in saveBookmark:', error);
      alert('An error occurred while saving. Please try again.');
    }
  });
  $('#backButton').addEventListener('click', e => {
    e.preventDefault();
    navigateBack();
  });
  $('#cancelButton').addEventListener('click', e => {
    e.preventDefault();
    navigateBack();
  });
  
  // Show content type icons when content type changes
  $('#bookmarkContentType').addEventListener('change', function() {
    // The visual feedback will be helpful in the form
    const contentTypeValue = this.value;
    // In a real implementation, you might update a preview element here
  });
});