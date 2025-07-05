// Edit Pathway JS
import { updatePathwayVersion } from './version-utils.js';

// Check if chrome API is available
if (!window.chrome) {
    console.error('Chrome API not available!');
} else if (!window.chrome.storage) {
    console.error('Chrome storage API not available!');
} else {
    console.log('Chrome API ready:', typeof window.chrome.storage.local);
    console.log('Storage enhanced:', window.chromeStorageEnhanced);
}

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Get pathway ID from URL
const getPathwayId = () => {
  const params = new URLSearchParams(location.search);
  return params.get('id');
};

// Save helper
const save = async (pathways, cb) => {
  // If editing an existing pathway, update its version info
  const pathwayId = getPathwayId();
  if (pathwayId !== null && pathways[parseInt(pathwayId)]) {
    const pathwayIndex = parseInt(pathwayId);
    // First create a deep copy to ensure we don't lose any nested data
    const pathwayCopy = JSON.parse(JSON.stringify(pathways[pathwayIndex]));
    // Then update the version
    const updatedPathway = await updatePathwayVersion(pathwayCopy);
    pathways[pathwayIndex] = updatedPathway;
  }

  chrome.storage.local.set({pathways}, cb);
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

// Header image handling
let headerImageData = null;
let cropper = null;
let cropperModal = null;

// Process uploaded image
function processHeaderImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please select a valid image file');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    // Set the cropper image source
    const cropperImage = $('#cropperImage');
    cropperImage.src = e.target.result;
    
    // Initialize cropper after image is loaded
    cropperImage.onload = function() {
      // Destroy previous cropper if exists
      if (cropper) {
        cropper.destroy();
      }
      
      // Initialize Cropper.js with settings to ensure proper sizing
      cropper = new Cropper(cropperImage, {
        aspectRatio: 4/1,
        viewMode: 1,        // Restrict the crop box to not exceed the size of the canvas
        guides: true,
        center: true,
        responsive: true,
        autoCropArea: 1,    // Use maximum size
        dragMode: 'move',   // Allow moving the image by default
        minContainerWidth: 800,  // Set minimum container size
        minContainerHeight: 350,
        ready: function() {
          // Once the cropper is ready, adjust to show maximum size
          const containerData = cropper.getContainerData();
          const canvasData = cropper.getCanvasData();

          // Scale up the image to fit the container better
          const scale = Math.min(
            containerData.width / canvasData.naturalWidth,
            containerData.height / canvasData.naturalHeight
          ) * 0.9; // Scale to 90% of the container

          // Apply the scaling
          cropper.zoomTo(scale);

          // Center the image
          cropper.moveTo(
            (containerData.width - canvasData.width * scale) / 2,
            (containerData.height - canvasData.height * scale) / 2
          );

          // Calculate dimensions for the crop box
          const cropBoxWidth = Math.min(containerData.width * 0.9, canvasData.width * scale);
          const cropBoxHeight = cropBoxWidth / 4;  // Maintain 4:1 ratio

          // Position in the center
          const cropBoxLeft = (containerData.width - cropBoxWidth) / 2;
          const cropBoxTop = (containerData.height - cropBoxHeight) / 2;

          // Set the crop box to these dimensions
          cropper.setCropBoxData({
            left: cropBoxLeft,
            top: cropBoxTop,
            width: cropBoxWidth,
            height: cropBoxHeight
          });
        }
      });
      
      // Show the modal
      cropperModal.show();
    };
  };
  
  reader.readAsDataURL(file);
}

// Apply crop and update preview
function applyCrop() {
  if (!cropper) return;
  
  // Get the cropped canvas
  const canvas = cropper.getCroppedCanvas({
    width: 1200,    // Set desired width
    height: 300,    // Set desired height
    minWidth: 600,  // Minimum width
    minHeight: 150, // Minimum height
    fillColor: '#fff',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });
  
  if (!canvas) {
    alert('Failed to crop image');
    return;
  }
  
  // Convert to jpeg with 75% quality
  canvas.toBlob((blob) => {
    // Convert blob to base64
    const reader = new FileReader();
    reader.onload = function(e) {
      // Store data for saving
      headerImageData = e.target.result;
      
      // Update preview
      updateHeaderPreview(headerImageData);
      
      // Close the modal
      cropperModal.hide();
    };
    
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.75); // JPEG format with 75% quality
}

// Update header preview
function updateHeaderPreview(imageData) {
  const headerPreview = $('#headerPreview');
  const placeholder = $('#headerPlaceholder');
  const actions = $('#headerActions');
  
  if (imageData) {
    headerPreview.style.backgroundImage = `url(${imageData})`;
    placeholder.style.display = 'none';
    actions.style.display = 'flex';
  } else {
    headerPreview.style.backgroundImage = '';
    placeholder.style.display = 'flex';
    actions.style.display = 'none';
  }
}

// Remove the header image
function removeHeaderImage() {
  headerImageData = null;
  updateHeaderPreview(null);
}

// Load pathway data for editing
function loadPathwayData() {
  const pathwayId = getPathwayId();
  
  // If no pathway ID is provided, we're creating a new pathway
  if (!pathwayId) {
    // Set page title to "Create Pathway"
    document.title = "Create Pathway - Curator";
    $('h1').textContent = "Create Pathway";
    return;
  }
  
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[parseInt(pathwayId)];
    if (!pathway) {
      alert('Pathway not found');
      navigateBack();
      return;
    }
    
    // Populate form fields
    $('#pathwayName').value = pathway.name;
    $('#pathwayDescription').value = pathway.description || '';
    $('#pathwayContentWarning').value = pathway.contentWarning || '';
    $('#pathwayAcknowledgments').value = pathway.acknowledgments || '';
    
    // Load header image if exists
    if (pathway.headerImage) {
      headerImageData = pathway.headerImage;
      updateHeaderPreview(headerImageData);
    }
  });
}

// Save pathway data
async function savePathway(e) {
  e.preventDefault();
  
  const name = $('#pathwayName').value.trim();
  const description = $('#pathwayDescription').value;
  const contentWarning = $('#pathwayContentWarning').value;
  const acknowledgments = $('#pathwayAcknowledgments').value;
  
  if (!name) {
    alert('Pathway name is required');
    return;
  }
  
  const pathwayId = getPathwayId();
  
  chrome.storage.local.get({pathways: []}, async ({pathways}) => {
    try {
      // Create a complete deep copy of the pathways array to avoid reference issues
      const pathwaysCopy = JSON.parse(JSON.stringify(pathways));
      
      if (pathwayId) {
        // Make sure we're working with a valid pathway
        if (!pathwaysCopy[pathwayId]) {
          alert('Pathway not found');
          return;
        }
        
        // First make a deep copy of the pathway to preserve all nested objects
        const pathwayCopy = JSON.parse(JSON.stringify(pathwaysCopy[pathwayId]));
        
        // Update only the fields from the form
        pathwayCopy.name = name;
        pathwayCopy.description = description;
        pathwayCopy.contentWarning = contentWarning;
        pathwayCopy.acknowledgments = acknowledgments;
        
        // Update header image if changed
        if (headerImageData !== null) {
          pathwayCopy.headerImage = headerImageData;
        } else if (headerImageData === null && pathwayCopy.headerImage) {
          // Remove header image if it was deleted
          delete pathwayCopy.headerImage;
        }
        
        // Ensure created date exists
        if (!pathwayCopy.created) {
          pathwayCopy.created = Date.now();
        }
        
        // IMPORTANT: we do not modify the steps array or any other properties
        // This ensures all pathway content is preserved
        // Steps should already be preserved in our deep copy
        
        // Update the pathway in our pathways array
        pathwaysCopy[pathwayId] = pathwayCopy;
      } else {
        // Create new pathway
        const newPathway = {
          name,
          description,
          contentWarning,
          acknowledgments,
          steps: [],
          created: Date.now()
        };
        
        // Add header image if one was uploaded
        if (headerImageData) {
          newPathway.headerImage = headerImageData;
        }

        // Add the new pathway
        pathwaysCopy.push(newPathway);

        // The new pathway will get version info added in the save function
        const lastIndex = pathwaysCopy.length - 1;
        pathwaysCopy[lastIndex] = await updatePathwayVersion(pathwaysCopy[lastIndex]);
      }
      
      // Save changes - this will also update version info
      await save(pathwaysCopy, () => {
        // Log success for debugging
        console.log('Pathway saved successfully');
        
        // Navigate back to the appropriate page
        if (pathwayId) {
          window.location.href = `pathway-detail.html?id=${pathwayId}`;
        } else {
          window.location.href = 'dashboard.html';
        }
      });
    } catch (error) {
      console.error('Error saving pathway:', error);
      alert('Error saving pathway. Please try again.');
    }
  });
}

// Handle navigation
function navigateBack() {
  const pathwayId = getPathwayId();
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
  
  // Initialize the bootstrap modal
  cropperModal = new bootstrap.Modal(document.getElementById('cropperModal'));
  
  loadPathwayData();
  
  // Set up header image event listeners
  $('#uploadHeaderBtn').addEventListener('click', () => {
    $('#headerImageInput').click();
  });
  
  $('#headerImageInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      processHeaderImage(e.target.files[0]);
    }
  });
  
  $('#removeHeaderBtn').addEventListener('click', removeHeaderImage);
  
  // Cropper modal event listeners
  $('#rotateLeftBtn').addEventListener('click', () => {
    if (cropper) cropper.rotate(-90);
  });
  
  $('#rotateRightBtn').addEventListener('click', () => {
    if (cropper) cropper.rotate(90);
  });
  
  $('#resetCropBtn').addEventListener('click', () => {
    if (cropper) cropper.reset();
  });
  
  $('#applyCropBtn').addEventListener('click', applyCrop);
  
  // Set up pathway form event listeners
  $('#pathwayForm').addEventListener('submit', async (e) => {
    try {
      await savePathway(e);
    } catch (error) {
      console.error('Error in savePathway:', error);
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
});