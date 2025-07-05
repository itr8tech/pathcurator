// Curator popup – add current page as a bookmark

// Prefill fields from query parameters (sent by background.js)
const params = new URLSearchParams(location.search);
const prefillTitle = params.get('title') || '';
const prefillURL   = params.get('url')   || '';
const prefillDesc  = params.get('desc')  || '';

function loadPathways(selectedIdx = 0) {
  chrome.storage.local.get({ pathways: [] }, ({ pathways }) => {
    const sel = document.getElementById('pathwaySelect');
    sel.innerHTML = pathways.map((p, i) =>
      `<option value="${i}" ${i === selectedIdx ? 'selected' : ''}>${p.name}</option>`
    ).join('');
    loadSteps(0);
  });
}

function loadSteps(selectedIdx = 0) {
  const pIdx = +document.getElementById('pathwaySelect').value;
  chrome.storage.local.get({ pathways: [] }, ({ pathways }) => {
    const steps = pathways[pIdx]?.steps || [];
    const sel = document.getElementById('stepSelect');
    sel.innerHTML = steps.map((s, i) =>
      `<option value="${i}" ${i === selectedIdx ? 'selected' : ''}>${s.name}</option>`
    ).join('');
  });
}

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

document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme based on preference
  setTheme(getPreferredTheme());
  
  // Add theme toggle handler
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Prefill fields from query parameters
  document.getElementById('titleInput').value       = prefillTitle;
  document.getElementById('descriptionInput').value = prefillDesc;

  loadPathways();
  document.getElementById('pathwaySelect').addEventListener('change', () => loadSteps());

  // --- Save bookmark ---
  document.getElementById('saveBtn').addEventListener('click', () => {
    const pIdx = +document.getElementById('pathwaySelect').value;
    const sIdx = +document.getElementById('stepSelect').value;

    const bm = {
      title:       document.getElementById('titleInput').value.trim(),
      url:         prefillURL || prompt('Page URL to save:', '') || '',
      description: document.getElementById('descriptionInput').value.trim(),
      context:     document.getElementById('contextInput').value.trim(),
      type:        document.getElementById('linkTypeSelect').value,
      contentType: document.getElementById('contentTypeSelect').value,
      added:       Date.now(),
      // Link audit fields
      lastChecked: null,
      status: null,
      available: null,
      redirectUrl: null,
      checkError: null
    };

    chrome.storage.local.get({ pathways: [] }, ({ pathways }) => {
      const pathway = pathways[pIdx];
      if (!pathway) return;
      const step = pathway.steps[sIdx];
      if (!step) return;

      (step.bookmarks = step.bookmarks || []).push(bm);
      chrome.storage.local.set({ pathways }, () => window.close());
    });
  });

  // --- New Pathway ---
  document.getElementById('newPathwayBtn').addEventListener('click', () => {
    // Open new pathway edit page
    window.open('edit-pathway.html', '_blank');
  });

  // --- New Step ---
  document.getElementById('newStepBtn').addEventListener('click', () => {
    const pIdx = +document.getElementById('pathwaySelect').value;
    // Open new step edit page
    window.open(`edit-step.html?pathwayId=${pIdx}`, '_blank');
  });
});