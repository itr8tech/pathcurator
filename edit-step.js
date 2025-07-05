// Edit Step JS
import { updatePathwayVersion } from './version-utils.js';

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Get parameters from URL
const getParams = () => {
  const params = new URLSearchParams(location.search);
  return {
    pathwayId: params.get('pathwayId'),
    stepIndex: params.get('stepIndex')
  };
};

// Save helper
const save = (pathways, pathwayId, cb) => {
  // Update version and lastUpdated timestamp whenever saving
  if (pathwayId !== undefined && pathways[pathwayId]) {
    pathways[pathwayId] = updatePathwayVersion(pathways[pathwayId]);
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

// Load step data for editing
function loadStepData() {
  const { pathwayId, stepIndex } = getParams();
  
  // If no step index is provided, we're creating a new step
  if (stepIndex === null) {
    // Set page title to "Create Step"
    document.title = "Create Step - Curator";
    $('h1').textContent = "Create Step";
    return;
  }
  
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[pathwayId];
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
    
    // Populate form fields
    $('#stepName').value = step.name;
    $('#stepObjective').value = step.objective || '';
    $('#pauseAndReflect').value = step.pauseAndReflect || '';
  });
}

// Save step data
function saveStep(e) {
  e.preventDefault();
  
  const name = $('#stepName').value.trim();
  const objective = $('#stepObjective').value;
  const pauseAndReflect = $('#pauseAndReflect').value;
  
  if (!name) {
    alert('Step name is required');
    return;
  }
  
  const { pathwayId, stepIndex } = getParams();
  
  if (!pathwayId) {
    alert('Pathway ID is required');
    return;
  }
  
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[pathwayId];
    if (!pathway) {
      alert('Pathway not found');
      return;
    }
    
    // Initialize steps array if needed
    pathway.steps = pathway.steps || [];

    if (stepIndex !== null) {
      // Update existing step
      pathway.steps[stepIndex] = {
        ...pathway.steps[stepIndex],
        name,
        objective,
        pauseAndReflect
      };
    } else {
      // Add new step
      pathway.steps.push({
        name,
        objective,
        pauseAndReflect,
        bookmarks: []
      });
    }

    // Save changes with version update
    save(pathways, pathwayId, () => {
      // Navigate back to pathway detail
      window.location.href = `pathway-detail.html?id=${pathwayId}`;
    });
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
  
  loadStepData();
  
  // Set up event listeners
  $('#stepForm').addEventListener('submit', saveStep);
  $('#backButton').addEventListener('click', e => {
    e.preventDefault();
    navigateBack();
  });
  $('#cancelButton').addEventListener('click', e => {
    e.preventDefault();
    navigateBack();
  });
});