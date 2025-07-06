// Link Audit Dashboard JS
import { secureGet, secureSet } from './secure-storage.js';

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => s?.replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c])) || '';

// Current state
let allPathways = [];
let authDomains = [];
let exemptDomains = [];
let currentPathwayFilter = '';
let currentStatusFilter = '';
let currentLinkData = null;

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
  const themeIcon = $('#theme-toggle').querySelector('i');
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

// Format timestamp as a relative time
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now = Date.now();
  const diff = now - timestamp; // Fixed: now - timestamp (not timestamp - now)
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 30) {
    return new Date(timestamp).toLocaleDateString();
  } else if (days > 0) {
    return rtf.format(-days, 'day'); // Negative value for "days ago"
  } else if (hours > 0) {
    return rtf.format(-hours, 'hour'); // Negative value for "hours ago"
  } else if (minutes > 0) {
    return rtf.format(-minutes, 'minute'); // Negative value for "minutes ago"
  } else {
    return rtf.format(-seconds, 'second'); // Negative value for "seconds ago"
  }
}

// Get status badge HTML
function getStatusBadge(bookmark) {
  if (!bookmark.lastChecked) {
    return '<span class="badge bg-secondary">Not Checked</span>';
  }
  
  // Handle exempted domains
  if (bookmark.isExemptDomain) {
    return '<span class="badge bg-success">Exempt Domain</span>';
  }
  
  // We now check for exempt domains when loading pathways
  // This block was redundant and wasn't effective due to async nature
  
  // Handle authentication required links - don't show for exempt domains
  if (!bookmark.isExemptDomain && 
      (bookmark.requiresAuth || bookmark.status === 401 || bookmark.status === 403)) {
    return '<span class="badge bg-info text-dark">Auth Required</span>';
  }
  
  if (bookmark.available === true) {
    if (bookmark.redirectUrl) {
      return '<span class="badge bg-warning text-dark">Redirected</span>';
    }
    if (bookmark.checkError) {
      return '<span class="badge bg-info text-dark">Likely Working</span>';
    }
    return '<span class="badge bg-success">Healthy</span>';
  }
  
  if (bookmark.status >= 400) {
    return `<span class="badge bg-danger">Error ${bookmark.status}</span>`;
  }
  
  if (bookmark.checkError) {
    return '<span class="badge bg-danger">Failed</span>';
  }
  
  return '<span class="badge bg-warning text-dark">Warning</span>';
}

// Populate the audit results table
function updateAuditTable() {
  console.log('Updating audit table...');
  const tbody = $('#auditResults');
  tbody.innerHTML = '';
  
  let filteredLinks = [];
  let totalCount = 0;
  let healthyCount = 0;
  let brokenCount = 0;
  let redirectedCount = 0;
  let uncheckedCount = 0;
  let authRequiredCount = 0;
  let exemptCount = 0;
  
  // Collect all bookmarks from all pathways
  allPathways.forEach((pathway, pathwayIndex) => {
    if (!pathway.steps) return;
    
    pathway.steps.forEach((step, stepIndex) => {
      if (!step.bookmarks) return;
      
      step.bookmarks.forEach((bookmark, bookmarkIndex) => {
        totalCount++;
        
        // Debug each bookmark
        if (bookmark.lastChecked) {
          console.log(`Processing checked bookmark: ${bookmark.title} - available: ${bookmark.available}, status: ${bookmark.status}`);
        }
        
        // Count by status
        if (!bookmark.lastChecked) {
          uncheckedCount++;
        } else if (bookmark.isExemptDomain) {
          // Exempt domains get their own category
          exemptCount++;
        } else if (bookmark.requiresAuth || bookmark.status === 401 || bookmark.status === 403) {
          // Auth required links get their own category
          authRequiredCount++;
        } else if (bookmark.available) {
          if (bookmark.redirectUrl) {
            redirectedCount++;
          } else if (bookmark.checkError) {
            // They're marked as available but had an error - count as healthy but could add another category
            healthyCount++;
          } else {
            healthyCount++;
          }
        } else {
          brokenCount++;
        }
        
        // Apply filters
        if (currentPathwayFilter && currentPathwayFilter !== pathwayIndex.toString()) {
          return;
        }
        
        // Helper functions for status checks
        const needsAuth = bm => !bm.isExemptDomain && (bm.requiresAuth || bm.status === 401 || bm.status === 403);
        const isExempt = bm => bm.isExemptDomain === true;
        
        if (currentStatusFilter) {
          if (currentStatusFilter === 'ok' && 
             (bookmark.available !== true || bookmark.redirectUrl || needsAuth(bookmark) || isExempt(bookmark))) {
            return;
          }
          if (currentStatusFilter === 'redirect' && 
             (!bookmark.redirectUrl)) {
            return;
          }
          if (currentStatusFilter === 'auth' && 
             (!needsAuth(bookmark))) {
            return;
          }
          if (currentStatusFilter === 'exempt' && 
             (!isExempt(bookmark))) {
            return;
          }
          if (currentStatusFilter === 'error' && 
             (bookmark.available !== false || needsAuth(bookmark) || isExempt(bookmark))) {
            return;
          }
          if (currentStatusFilter === 'unchecked' && 
             (bookmark.lastChecked !== null)) {
            return;
          }
        }
        
        filteredLinks.push({
          bookmark,
          pathway,
          pathwayIndex,
          step,
          stepIndex,
          bookmarkIndex
        });
      });
    });
  });
  
  // Update stats
  $('#totalLinks').textContent = totalCount;
  $('#healthyLinks').textContent = healthyCount;
  $('#brokenLinks').textContent = brokenCount;
  $('#redirectedLinks').textContent = redirectedCount;
  $('#uncheckedLinks').textContent = uncheckedCount;
  
  // Update auth required count if element exists
  if ($('#authRequiredLinks')) {
    $('#authRequiredLinks').textContent = authRequiredCount;
  }
  
  // Update exempt domains count if element exists
  if ($('#exemptLinks')) {
    $('#exemptLinks').textContent = exemptCount;
  }
  
  $('#resultsCount').textContent = `${filteredLinks.length} results`;
  
  // Sort links by status (broken first, then auth required, then exempt, then redirected, then healthy, then unchecked)
  filteredLinks.sort((a, b) => {
    // Helper functions for status checks
    const needsAuth = bm => !bm.isExemptDomain && (bm.requiresAuth || bm.status === 401 || bm.status === 403);
    const isExempt = bm => bm.isExemptDomain === true;
    
    // First priority: broken links
    if (a.bookmark.available === false && b.bookmark.available !== false) return -1;
    if (a.bookmark.available !== false && b.bookmark.available === false) return 1;
    
    // Second priority: auth required links
    if (needsAuth(a.bookmark) && !needsAuth(b.bookmark)) return -1;
    if (!needsAuth(a.bookmark) && needsAuth(b.bookmark)) return 1;
    
    // Third priority: exempt domain links
    if (isExempt(a.bookmark) && !isExempt(b.bookmark)) return -1;
    if (!isExempt(a.bookmark) && isExempt(b.bookmark)) return 1;
    
    // Fourth priority: redirected links
    if (a.bookmark.redirectUrl && !b.bookmark.redirectUrl) return -1;
    if (!a.bookmark.redirectUrl && b.bookmark.redirectUrl) return 1;
    
    // Fifth priority: unchecked links
    if (!a.bookmark.lastChecked && b.bookmark.lastChecked) return -1;
    if (a.bookmark.lastChecked && !b.bookmark.lastChecked) return 1;
    
    // Last checked date (newest first)
    return (b.bookmark.lastChecked || 0) - (a.bookmark.lastChecked || 0);
  });
  
  // Populate table
  filteredLinks.forEach(item => {
    const tr = document.createElement('tr');
    
    // Set row class based on status
    if (!item.bookmark.lastChecked) {
      tr.classList.add('table-secondary');
    } else if (item.bookmark.isExemptDomain) {
      tr.classList.add('table-success'); // Green for exempt domains
    } else if (!item.bookmark.isExemptDomain && (item.bookmark.requiresAuth || item.bookmark.status === 401 || item.bookmark.status === 403)) {
      tr.classList.add('table-primary'); // Blue for auth required links
    } else if (item.bookmark.available === false) {
      tr.classList.add('table-danger');
    } else if (item.bookmark.redirectUrl) {
      tr.classList.add('table-warning');
    } else if (item.bookmark.checkError) {
      tr.classList.add('table-info');
    }
    
    // SECURITY: Escape user-controlled content to prevent XSS
    tr.innerHTML = `
      <td>${esc(item.bookmark.title)}</td>
      <td>
        <a href="${esc(item.bookmark.url)}" target="_blank" class="text-truncate d-inline-block" style="max-width: 250px;">${esc(item.bookmark.url)}</a>
      </td>
      <td>${esc(item.pathway.name)}</td>
      <td>${getStatusBadge(item.bookmark)}</td>
      <td>${formatRelativeTime(item.bookmark.lastChecked)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary view-details-btn" 
          data-pathway-index="${item.pathwayIndex}" 
          data-step-index="${item.stepIndex}" 
          data-bookmark-index="${item.bookmarkIndex}">
          <i class="bi bi-info-circle"></i>
        </button>
        <button class="btn btn-sm btn-outline-secondary check-link-btn" 
          data-pathway-index="${item.pathwayIndex}" 
          data-step-index="${item.stepIndex}" 
          data-bookmark-index="${item.bookmarkIndex}">
          <i class="bi bi-arrow-repeat"></i>
        </button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Add event listeners to detail buttons
  document.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', () => showLinkDetails(
      btn.dataset.pathwayIndex,
      btn.dataset.stepIndex,
      btn.dataset.bookmarkIndex
    ));
  });
  
  // Add event listeners to check buttons
  document.querySelectorAll('.check-link-btn').forEach(btn => {
    btn.addEventListener('click', () => checkSingleLink(
      btn.dataset.pathwayIndex,
      btn.dataset.stepIndex,
      btn.dataset.bookmarkIndex
    ));
  });
}

// Load pathways and populate filters
function loadPathways() {
  chrome.storage.local.get({pathways: [], exemptDomains: []}, ({pathways, exemptDomains}) => {
    console.log('Loading pathways for audit table...');
    console.log('Found', pathways.length, 'pathways');
    
    // Debug: check if pathways have audit data
    let totalBookmarks = 0;
    let checkedBookmarks = 0;
    pathways.forEach(pathway => {
      if (pathway.steps) {
        pathway.steps.forEach(step => {
          if (step.bookmarks) {
            totalBookmarks += step.bookmarks.length;
            step.bookmarks.forEach(bookmark => {
              if (bookmark.lastChecked) {
                checkedBookmarks++;
                console.log('Found checked bookmark:', bookmark.title, '- Status:', bookmark.status, '- Last checked:', new Date(bookmark.lastChecked).toLocaleString());
              }
            });
          }
        });
      }
    });
    console.log(`Found ${checkedBookmarks} previously checked bookmarks out of ${totalBookmarks} total`);
    
    // Store original data for comparison
    window.originalPathwaysData = JSON.parse(JSON.stringify(pathways));
    
    // Add a detailed audit data check
    console.log('=== DETAILED AUDIT DATA CHECK ===');
    pathways.forEach((pathway, pIdx) => {
      if (pathway.steps) {
        pathway.steps.forEach((step, sIdx) => {
          if (step.bookmarks) {
            step.bookmarks.forEach((bookmark, bIdx) => {
              if (bookmark.lastChecked) {
                console.log(`AUDIT DATA FOUND: P${pIdx}S${sIdx}B${bIdx} - ${bookmark.title}`, {
                  lastChecked: bookmark.lastChecked,
                  available: bookmark.available,
                  status: bookmark.status,
                  isValid: bookmark.isValid,
                  checkError: bookmark.checkError
                });
              }
            });
          }
        });
      }
    });
    console.log('=== END DETAILED AUDIT DATA CHECK ===');
    
    allPathways = pathways;
    
    // Log what we're setting allPathways to
    console.log('Setting allPathways to:', allPathways.length, 'pathways');
    if (allPathways.length > 0 && allPathways[0].steps) {
      console.log('First pathway has', allPathways[0].steps.length, 'steps');
      if (allPathways[0].steps[0] && allPathways[0].steps[0].bookmarks) {
        console.log('First step has', allPathways[0].steps[0].bookmarks.length, 'bookmarks');
        const firstBookmark = allPathways[0].steps[0].bookmarks[0];
        if (firstBookmark) {
          console.log('First bookmark audit data:', {
            title: firstBookmark.title,
            lastChecked: firstBookmark.lastChecked,
            available: firstBookmark.available,
            status: firstBookmark.status
          });
        }
      }
    }
    
    // Pre-process bookmarks to ensure exempt domains are properly marked
    pathways.forEach(pathway => {
      if (!pathway.steps) return;
      
      pathway.steps.forEach(step => {
        if (!step.bookmarks) return;
        
        step.bookmarks.forEach(bookmark => {
          if (!bookmark.url) return;
          
          try {
            const urlObj = new URL(bookmark.url);
            const hostname = urlObj.hostname.toLowerCase();
            
            // Check if this bookmark is for an exempt domain
            for (const exemptDomain of exemptDomains) {
              const domain = exemptDomain.domain.toLowerCase();
              if (hostname === domain || 
                  hostname === 'www.' + domain || 
                  domain === 'www.' + hostname ||
                  hostname.endsWith('.' + domain)) {
                bookmark.isExemptDomain = true;
                bookmark.requiresAuth = false; // Override auth required for exempt domains
                break;
              }
            }
          } catch (e) {}
        });
      });
    });
    
    // Populate pathway filter
    const pathwaySelect = $('#pathwayFilter');
    pathwaySelect.innerHTML = '<option value="">All Pathways</option>';
    
    pathways.forEach((pathway, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = pathway.name;
      pathwaySelect.appendChild(option);
    });
    
    // Update the table
    updateAuditTable();
  });
}

// Show link details in modal
function showLinkDetails(pathwayIndex, stepIndex, bookmarkIndex) {
  const pathway = allPathways[pathwayIndex];
  if (!pathway) return;
  
  const step = pathway.steps[stepIndex];
  if (!step) return;
  
  const bookmark = step.bookmarks[bookmarkIndex];
  if (!bookmark) return;
  
  // Set current link data for action buttons
  currentLinkData = {
    pathwayIndex: parseInt(pathwayIndex),
    stepIndex: parseInt(stepIndex),
    bookmarkIndex: parseInt(bookmarkIndex),
    bookmark
  };
  
  // Populate modal fields
  $('#modalTitle').textContent = bookmark.title;
  $('#modalUrl').textContent = bookmark.url;
  $('#modalUrl').href = bookmark.url;
  $('#modalPathway').textContent = pathway.name;
  $('#modalStep').textContent = step.name;
  
  // Status information
  if (!bookmark.lastChecked) {
    $('#modalStatus').textContent = 'Not Checked';
    $('#modalStatus').className = 'text-secondary';
  } else if (bookmark.isExemptDomain) {
    $('#modalStatus').textContent = 'Exempt Domain (Auto-Approved)';
    $('#modalStatus').className = 'text-success';
  } else if (bookmark.available) {
    if (bookmark.redirectUrl) {
      $('#modalStatus').textContent = `Redirected (${bookmark.status || '3xx'})`;
      $('#modalStatus').className = 'text-warning';
    } else if (bookmark.checkError) {
      $('#modalStatus').textContent = 'Likely Working (with verification issues)';
      $('#modalStatus').className = 'text-info';
    } else {
      $('#modalStatus').textContent = bookmark.status ? `OK (${bookmark.status})` : 'OK';
      $('#modalStatus').className = 'text-success';
    }
  } else {
    $('#modalStatus').textContent = bookmark.status ? `Error (${bookmark.status})` : 'Error';
    $('#modalStatus').className = 'text-danger';
  }
  
  // Last checked date
  $('#modalLastChecked').textContent = bookmark.lastChecked ? 
    new Date(bookmark.lastChecked).toLocaleString() : 
    'Never';
  
  // Handle redirect information
  if (bookmark.redirectUrl) {
    $('#modalRedirectRow').style.display = '';
    $('#modalRedirectUrl').textContent = bookmark.redirectUrl;
    $('#modalRedirectUrl').href = bookmark.redirectUrl;
  } else {
    $('#modalRedirectRow').style.display = 'none';
  }
  
  // Handle error information
  if (bookmark.checkError) {
    $('#modalErrorRow').style.display = '';
    $('#modalError').textContent = bookmark.checkError;
  } else {
    $('#modalErrorRow').style.display = 'none';
  }
  
  // Set edit link URL
  $('#editLinkBtn').href = `edit-bookmark.html?pathwayId=${pathwayIndex}&stepIndex=${stepIndex}&bookmarkIndex=${bookmarkIndex}`;
  
  // Show the modal
  try {
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      new bootstrap.Modal($('#linkDetailModal')).show();
    } else {
      console.error('Bootstrap not available, falling back to element show');
      const modal = $('#linkDetailModal');
      modal.style.display = 'block';
      modal.classList.add('show');
    }
  } catch (error) {
    console.error('Error showing modal:', error);
    alert('Error showing link details. Please check the console for details.');
  }
}

// Check a single link
async function checkSingleLink(pathwayIndex, stepIndex, bookmarkIndex) {
  const pathway = allPathways[pathwayIndex];
  if (!pathway) return;
  
  const step = pathway.steps[stepIndex];
  if (!step) return;
  
  const bookmark = step.bookmarks[bookmarkIndex];
  if (!bookmark) return;
  
  // Show checking status
  if (currentLinkData && 
      currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
      currentLinkData.stepIndex === parseInt(stepIndex) &&
      currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
    $('#modalStatus').textContent = 'Checking...';
    $('#modalStatus').className = 'text-info';
    $('#recheckLinkBtn').disabled = true;
  }
  
  try {
    // Send message to background script to check link
    const result = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'checkSingleLink',
        url: bookmark.url
      }, resolve);
    });
    
    // Update bookmark with results
    bookmark.lastChecked = Date.now();
    bookmark.status = result.status;
    bookmark.available = result.available;
    bookmark.redirectUrl = result.redirectUrl;
    bookmark.checkError = result.checkError;
    
    // Save updated pathways
    chrome.storage.local.set({pathways: allPathways}, () => {
      // Update table
      updateAuditTable();
      
      // Update modal if it's still open
      if (currentLinkData && 
          currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
          currentLinkData.stepIndex === parseInt(stepIndex) &&
          currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
        // Re-populate with updated data
        showLinkDetails(pathwayIndex, stepIndex, bookmarkIndex);
      }
    });
  } catch (error) {
    console.error('Error checking link:', error);
    
    // Re-enable button if modal is still open
    if (currentLinkData && 
        currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
        currentLinkData.stepIndex === parseInt(stepIndex) &&
        currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
      $('#recheckLinkBtn').disabled = false;
    }
  }
}

// Update link URL to redirected URL
function updateToRedirectUrl() {
  if (!currentLinkData || !currentLinkData.bookmark.redirectUrl) return;
  
  const { pathwayIndex, stepIndex, bookmarkIndex, bookmark } = currentLinkData;
  
  // Update the bookmark URL
  bookmark.url = bookmark.redirectUrl;
  bookmark.redirectUrl = null;
  
  // Save the changes
  chrome.storage.local.set({pathways: allPathways}, () => {
    // Hide the modal
    bootstrap.Modal.getInstance($('#linkDetailModal')).hide();
    
    // Update the table
    updateAuditTable();
  });
}

// Open link in archive.org
function viewInArchiveOrg() {
  if (!currentLinkData || !currentLinkData.bookmark.url) return;
  
  const archiveUrl = `https://web.archive.org/web/*/${currentLinkData.bookmark.url}`;
  window.open(archiveUrl, '_blank');
}

// Check all links directly in web app mode
async function checkAllLinksDirectly() {
  console.log('Starting direct link checking...');
  
  // Get all pathways from storage directly
  const pathwaysData = await new Promise((resolve, reject) => {
    chrome.storage.local.get('pathways', (data) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(data.pathways || []);
      }
    });
  });
  
  console.log('Loaded pathways for checking:', pathwaysData.length, 'pathways');
  
  if (pathwaysData.length === 0) {
    console.log('No pathways found to check');
    return;
  }
  
  // Create a deep copy to avoid modifying the original
  const pathways = JSON.parse(JSON.stringify(pathwaysData));
  let totalChecked = 0;
  let totalLinks = 0;
  
  // Count total links first
  pathways.forEach(pathway => {
    if (pathway.steps) {
      pathway.steps.forEach(step => {
        if (step.bookmarks) {
          totalLinks += step.bookmarks.length;
        }
      });
    }
  });
  
  console.log(`Found ${totalLinks} links to check`);
  
  // Check each link
  for (let pIdx = 0; pIdx < pathways.length; pIdx++) {
    const pathway = pathways[pIdx];
    if (!pathway.steps) continue;
    
    for (let sIdx = 0; sIdx < pathway.steps.length; sIdx++) {
      const step = pathway.steps[sIdx];
      if (!step.bookmarks) continue;
      
      for (let bIdx = 0; bIdx < step.bookmarks.length; bIdx++) {
        const bookmark = step.bookmarks[bIdx];
        console.log(`Checking link ${totalChecked + 1}/${totalLinks}: ${bookmark.title}`);
        
        try {
          // Simple link check using fetch with no-cors mode
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(bookmark.url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          // Update bookmark with check result
          bookmark.lastChecked = Date.now();
          bookmark.status = response.status || 'OK';
          bookmark.isValid = true;
          bookmark.available = true; // Mark as available for audit table
          
        } catch (error) {
          console.log(`Error checking ${bookmark.url}:`, error.message);
          bookmark.lastChecked = Date.now();
          bookmark.status = error.name === 'AbortError' ? 'Timeout' : 'Error';
          bookmark.checkError = error.message;
          bookmark.isValid = false;
          bookmark.available = false; // Mark as unavailable for audit table
        }
        
        totalChecked++;
      }
    }
  }
  
  // Save updated pathways back to storage
  try {
    // First get the current pathways from storage to make sure we have the latest data
    const currentData = await new Promise((resolve, reject) => {
      chrome.storage.local.get('pathways', (data) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(data.pathways || []);
        }
      });
    });
    
    console.log('Current pathways before save:', currentData.length, 'pathways');
    console.log('Updated pathways to save:', pathways.length, 'pathways');
    
    // Make sure we're not saving empty data
    if (pathways.length === 0 && currentData.length > 0) {
      console.error('WARNING: Preventing save of empty pathways array!');
      throw new Error('Refusing to save empty pathways - would lose all data');
    }
    
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ pathways }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    console.log(`Link checking complete. Checked ${totalChecked} links and saved data.`);
    
    // VERIFICATION: Re-read from storage to confirm data was saved
    console.log('=== VERIFYING STORAGE SAVE ===');
    const verificationData = await new Promise((resolve, reject) => {
      chrome.storage.local.get('pathways', (data) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(data.pathways || []);
        }
      });
    });
    
    let verificationChecked = 0;
    verificationData.forEach((pathway, pIdx) => {
      if (pathway.steps) {
        pathway.steps.forEach((step, sIdx) => {
          if (step.bookmarks) {
            step.bookmarks.forEach((bookmark, bIdx) => {
              if (bookmark.lastChecked) {
                verificationChecked++;
                console.log(`VERIFIED IN STORAGE: P${pIdx}S${sIdx}B${bIdx} - ${bookmark.title}`, {
                  lastChecked: bookmark.lastChecked,
                  available: bookmark.available,
                  status: bookmark.status
                });
              }
            });
          }
        });
      }
    });
    console.log(`VERIFICATION COMPLETE: Found ${verificationChecked} checked bookmarks in storage`);
    console.log('=== END VERIFICATION ===');
    
  } catch (error) {
    console.error('Error saving link check results:', error);
    throw error; // Re-throw to prevent silent data loss
  }
}

// Check all links
async function checkAllLinks() {
  // Show loading state
  $('#checkAllLinksBtn').innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Checking...';
  $('#checkAllLinksBtn').disabled = true;

  try {
    // Check if we're in a browser extension context
    let hasPermission = false;
    let isWebApp = false;
    
    if (typeof chrome !== 'undefined' && chrome.permissions) {
      try {
        hasPermission = await chrome.permissions.contains({
          origins: ["http://*/*", "https://*/*"]
        });
      } catch (e) {
        console.warn('Unable to check permissions:', e);
        isWebApp = true;
      }
    } else {
      // We're in a web app, not an extension
      isWebApp = true;
      console.log('Running in web app mode - using basic link checking');
    }

    if (!hasPermission && !isWebApp) {
      // Show a message to the user about permissions needed (extension mode only)
      const permissionResult = await showPermissionDialog();
      if (!permissionResult) {
        // User declined; show a warning that link checks will be limited
        showToast('Link audit will run with limited capabilities. Some links may show as valid without being checked.', 'warning');
      }
    } else if (isWebApp) {
      // Web app mode - inform user about limitations
      showToast('Running in web app mode. Link checking will use basic methods due to browser security restrictions.', 'info');
    }

    // Check all links directly (web app mode) or via background script (extension mode)
    if (isWebApp) {
      // Web app mode - check links directly
      await checkAllLinksDirectly();
    } else {
      // Extension mode - use background script
      await new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: 'auditAllLinks'
        }, resolve);
      });
    }

    // Reload pathways and update table
    loadPathways();
  } catch (error) {
    console.error('Error checking all links:', error);
    showToast(`Error checking links: ${error.message}`, 'danger');
  } finally {
    // Reset button state
    $('#checkAllLinksBtn').innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Check All Links';
    $('#checkAllLinksBtn').disabled = false;
  }
}

// Show permission dialog
async function showPermissionDialog() {
  const result = await new Promise(resolve => {
    let permissionModal;

    // Create modal if doesn't exist
    if (!document.getElementById('permissionModal')) {
      const modalDiv = document.createElement('div');
      modalDiv.className = 'modal fade';
      modalDiv.id = 'permissionModal';
      modalDiv.setAttribute('tabindex', '-1');
      modalDiv.setAttribute('aria-labelledby', 'permissionModalLabel');
      modalDiv.setAttribute('aria-hidden', 'true');

      modalDiv.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="permissionModalLabel">Permissions Required</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p>To properly check links, Curator needs permission to connect to all websites.</p>
              <p>Without this permission, many link checks will fail due to browser security restrictions (CSP).</p>
              <p>Would you like to grant this permission now?</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="permissionDenyBtn">No, Continue Limited</button>
              <button type="button" class="btn btn-primary" id="permissionGrantBtn">Grant Permission</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modalDiv);

      // Create new modal instance
      try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          permissionModal = new bootstrap.Modal(modalDiv);
        } else {
          console.error('Bootstrap not available for modal creation');
          resolve(false);
          return;
        }
      } catch (error) {
        console.error('Error creating permission modal:', error);
        resolve(false);
        return;
      }

      // Add event handlers
      document.getElementById('permissionGrantBtn').addEventListener('click', async () => {
        try {
          if (typeof chrome !== 'undefined' && chrome.permissions) {
            const granted = await chrome.permissions.request({
              origins: ["http://*/*", "https://*/*"]
            });
            permissionModal.hide();
            resolve(granted);
          } else {
            // Web app mode - can't grant permissions
            console.log('Web app mode - cannot grant browser extension permissions');
            permissionModal.hide();
            resolve(false);
          }
        } catch (e) {
          console.error('Error requesting permissions:', e);
          permissionModal.hide();
          resolve(false);
        }
      });

      document.getElementById('permissionDenyBtn').addEventListener('click', () => {
        permissionModal.hide();
        resolve(false);
      });
    } else {
      // Modal exists, get existing modal instance
      try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          permissionModal = new bootstrap.Modal(document.getElementById('permissionModal'));
        } else {
          console.error('Bootstrap not available for existing modal');
          resolve(false);
          return;
        }
      } catch (error) {
        console.error('Error creating modal instance for existing modal:', error);
        resolve(false);
        return;
      }
      
      // Add event handlers
      const grantBtn = document.getElementById('permissionGrantBtn');
      const denyBtn = document.getElementById('permissionDenyBtn');

      // Remove old handlers and add new ones
      const newGrantBtn = grantBtn.cloneNode(true);
      const newDenyBtn = denyBtn.cloneNode(true);
      grantBtn.parentNode.replaceChild(newGrantBtn, grantBtn);
      denyBtn.parentNode.replaceChild(newDenyBtn, denyBtn);

      newGrantBtn.addEventListener('click', async () => {
        try {
          if (typeof chrome !== 'undefined' && chrome.permissions) {
            const granted = await chrome.permissions.request({
              origins: ["http://*/*", "https://*/*"]
            });
            permissionModal.hide();
            resolve(granted);
          } else {
            // Web app mode - can't grant permissions
            console.log('Web app mode - cannot grant browser extension permissions');
            permissionModal.hide();
            resolve(false);
          }
        } catch (e) {
          console.error('Error requesting permissions:', e);
          permissionModal.hide();
          resolve(false);
        }
      });

      newDenyBtn.addEventListener('click', () => {
        permissionModal.hide();
        resolve(false);
      });
    }

    if (permissionModal) {
      permissionModal.show();
    } else {
      console.error('Permission modal not available');
      resolve(false);
    }
  });

  return result;
}

// Show toast notification
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer') || createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  toastContainer.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();

  // Auto-remove after shown
  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

// Create toast container if it doesn't exist
function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
  container.style.zIndex = '1060';
  document.body.appendChild(container);
  return container;
}

// Load and display authentication domains
async function loadAuthDomains() {
  try {
    // Use secure storage with encryption
    const domains = await secureGet('authDomains', [], true);
    
    // Save to global state
    authDomains = domains;
    
    // Update the auth domains list in the modal
    renderAuthDomainsList();
  } catch (error) {
    console.error('Error loading auth domains:', error);
    // Fallback to loading without decryption if necessary
    chrome.storage.local.get({ authDomains: [] }, ({ authDomains: domains }) => {
      authDomains = domains;
      renderAuthDomainsList();
    });
  }
}

// Render the auth domains list in the modal
function renderAuthDomainsList() {
  const list = $('#authDomainsList');
  
  // Show or hide the empty message
  $('#emptyAuthDomainsMsg').style.display = authDomains.length ? 'none' : 'block';
  
  // Remove existing items (except the empty message)
  document.querySelectorAll('#authDomainsList .auth-domain-item').forEach(item => item.remove());
  
  // Add each domain to the list
  authDomains.forEach((domain, index) => {
    const item = document.createElement('div');
    item.className = 'list-group-item auth-domain-item';
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-bold">${esc(domain.displayName || domain.domain)}</div>
          <div class="small text-muted">${esc(domain.domain)}</div>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm btn-outline-danger delete-auth-domain" data-index="${index}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="small mt-1">
        <span class="badge bg-secondary">Username: ${esc(domain.username)}</span>
        <span class="badge bg-secondary">Password: ${'•'.repeat(8)}</span>
      </div>
    `;
    
    list.appendChild(item);
  });
  
  // Add event listeners for delete buttons
  document.querySelectorAll('.delete-auth-domain').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      if (confirm(`Remove ${authDomains[index].domain} from your authentication allowlist?`)) {
        deleteAuthDomain(index);
      }
    });
  });
}

// Add a new domain to the auth list
async function addAuthDomain(domain, username, password, displayName = '') {
  // First check if the domain already exists
  const existingIndex = authDomains.findIndex(d => d.domain === domain);
  
  if (existingIndex >= 0) {
    // Update existing domain
    authDomains[existingIndex] = {
      domain,
      username,
      password,
      displayName: displayName || authDomains[existingIndex].displayName
    };
  } else {
    // Add new domain
    authDomains.push({
      domain,
      username,
      password,
      displayName
    });
  }
  
  try {
    // Save with encryption - true parameter enables encryption
    await secureSet('authDomains', authDomains, true);
    
    // Re-render the list
    renderAuthDomainsList();
    
    // Show success message
    const existingAlert = $('#authDomainsSuccessAlert');
    if (existingAlert) existingAlert.remove();
    
    const alert = document.createElement('div');
    alert.id = 'authDomainsSuccessAlert';
    alert.className = 'alert alert-success mt-3';
    alert.innerHTML = `<i class="bi bi-check-circle me-2"></i> Domain ${existingIndex >= 0 ? 'updated' : 'added'} successfully!`;
    
    // Insert before the form
    $('#addAuthDomainForm').before(alert);
    
    // Clear the form
    $('#domainInput').value = '';
    $('#usernameInput').value = '';
    $('#passwordInput').value = '';
    $('#domainNameInput').value = '';
    
    // Remove the alert after a few seconds
    setTimeout(() => {
      if (alert.parentNode) {
        alert.parentNode.removeChild(alert);
      }
    }, 3000);
  } catch (error) {
    console.error('Error saving auth domain:', error);
    
    // Show error message
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-danger mt-3';
    errorAlert.innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i> Error saving domain: ${esc(error.message)}`;
    
    // Insert before the form
    $('#addAuthDomainForm').before(errorAlert);
    
    // Remove the alert after a few seconds
    setTimeout(() => {
      if (errorAlert.parentNode) {
        errorAlert.parentNode.removeChild(errorAlert);
      }
    }, 5000);
    
    // Fallback to non-encrypted storage as a last resort
    chrome.storage.local.set({ authDomains }, () => {
      renderAuthDomainsList();
    });
  }
}

// Delete a domain from the auth list
async function deleteAuthDomain(index) {
  if (index < 0 || index >= authDomains.length) return;
  
  // Remove the domain
  authDomains.splice(index, 1);
  
  try {
    // Save with encryption
    await secureSet('authDomains', authDomains, true);
    
    // Re-render the list
    renderAuthDomainsList();
  } catch (error) {
    console.error('Error deleting auth domain:', error);
    
    // Fallback to non-encrypted storage
    chrome.storage.local.set({ authDomains }, () => {
      renderAuthDomainsList();
    });
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Check if URL matches an auth domain
function findMatchingAuthDomain(url) {
  const domain = extractDomain(url);
  if (!domain) return null;
  
  // Find exact domain match
  let match = authDomains.find(d => d.domain.toLowerCase() === domain);
  if (match) return match;
  
  // Check for subdomain matches (e.g. sub.example.com should match example.com)
  for (const authDomain of authDomains) {
    if (domain.endsWith(`.${authDomain.domain}`) || domain === authDomain.domain) {
      return authDomain;
    }
  }
  
  return null;
}

// Add current URL domain to auth list
function addCurrentUrlToAuthList() {
  if (!currentLinkData || !currentLinkData.bookmark || !currentLinkData.bookmark.url) {
    return;
  }
  
  const domain = extractDomain(currentLinkData.bookmark.url);
  if (!domain) {
    alert('Could not extract domain from URL');
    return;
  }
  
  // Pre-fill the domain in the form
  $('#domainInput').value = domain;
  $('#domainNameInput').value = domain;
  
  // Close current modal and open auth domains modal
  bootstrap.Modal.getInstance($('#linkDetailModal')).hide();
  new bootstrap.Modal($('#authDomainsModal')).show();
}

// Check a single link with auth credentials if available
async function checkLinkWithAuth(url) {
  // First check if the domain is in our auth list
  const authDomain = findMatchingAuthDomain(url);
  
  if (authDomain) {
    // We have credentials for this domain
    console.log(`Found auth credentials for ${url}`);
    
    // Send message to check with auth
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'checkLinkWithAuth',
        url: url,
        auth: {
          username: authDomain.username,
          password: authDomain.password
        }
      }, resolve);
    });
  } else {
    // No auth credentials, use normal check
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'checkSingleLink',
        url: url
      }, resolve);
    });
  }
}

// Override the checkSingleLink function to use auth if available
const originalCheckSingleLink = checkSingleLink;
checkSingleLink = async function(pathwayIndex, stepIndex, bookmarkIndex) {
  const pathway = allPathways[pathwayIndex];
  if (!pathway) return;
  
  const step = pathway.steps[stepIndex];
  if (!step) return;
  
  const bookmark = step.bookmarks[bookmarkIndex];
  if (!bookmark) return;
  
  // Show checking status
  if (currentLinkData && 
      currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
      currentLinkData.stepIndex === parseInt(stepIndex) &&
      currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
    $('#modalStatus').textContent = 'Checking...';
    $('#modalStatus').className = 'text-info';
    $('#recheckLinkBtn').disabled = true;
  }
  
  try {
    // Use the auth-aware check function instead
    const result = await checkLinkWithAuth(bookmark.url);
    
    // Log the check method to help with debugging
    console.log(`Check method used for ${bookmark.url}: ${result.checkMethod || 'unknown'}`);
    
    // Update bookmark with results
    bookmark.lastChecked = Date.now();
    bookmark.status = result.status;
    bookmark.available = result.available;
    bookmark.redirectUrl = result.redirectUrl;
    bookmark.checkError = result.checkError;
    bookmark.requiresAuth = result.requiresAuth;
    bookmark.checkMethod = result.checkMethod; // Store this for debugging
    
    // For IIS or other special servers, show more details in case of failure
    if (result.checkError && !result.available && result.requiresAuth) {
      console.warn(`Auth failure details - URL: ${bookmark.url}, Method: ${result.checkMethod}, Status: ${result.status}`);
      
      // Add server type hint if we detect patterns suggesting IIS
      if (bookmark.url.toLowerCase().includes('bcpublicservice.gov.bc.ca') || 
          bookmark.url.toLowerCase().includes('asp') ||
          bookmark.url.toLowerCase().includes('.iis')) {
        bookmark.checkError += ' (Possibly an IIS server)';
      }
    }
    
    // Save updated pathways
    chrome.storage.local.set({pathways: allPathways}, () => {
      // Update table
      updateAuditTable();
      
      // Update modal if it's still open
      if (currentLinkData && 
          currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
          currentLinkData.stepIndex === parseInt(stepIndex) &&
          currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
        // Re-populate with updated data
        showLinkDetails(pathwayIndex, stepIndex, bookmarkIndex);
      }
    });
  } catch (error) {
    console.error('Error checking link:', error);
    
    // Re-enable button if modal is still open
    if (currentLinkData && 
        currentLinkData.pathwayIndex === parseInt(pathwayIndex) &&
        currentLinkData.stepIndex === parseInt(stepIndex) &&
        currentLinkData.bookmarkIndex === parseInt(bookmarkIndex)) {
      $('#recheckLinkBtn').disabled = false;
    }
  }
};

// Override the showLinkDetails function to show auth section if needed
const originalShowLinkDetails = showLinkDetails;
showLinkDetails = function(pathwayIndex, stepIndex, bookmarkIndex) {
  // Call the original function first
  originalShowLinkDetails(pathwayIndex, stepIndex, bookmarkIndex);
  
  // Now handle the auth section visibility
  const bookmark = allPathways[pathwayIndex]?.steps[stepIndex]?.bookmarks[bookmarkIndex];
  if (!bookmark) return;
  
  // Show auth section if the link requires authentication
  const needsAuth = bookmark.requiresAuth || bookmark.status === 401 || bookmark.status === 403;
  $('#authDomainSection').classList.toggle('d-none', !needsAuth);
  
  // Disable the "Add to Auth Allowlist" button if the domain is already in the list
  if (needsAuth && bookmark.url) {
    const matchingDomain = findMatchingAuthDomain(bookmark.url);
    $('#addToAuthListBtn').disabled = !!matchingDomain;
    
    if (matchingDomain) {
      $('#addToAuthListBtn').innerHTML = 'Domain Already in Allowlist';
    } else {
      $('#addToAuthListBtn').innerHTML = 'Add to Auth Allowlist';
    }
  }
  
  // Add Exempt Domain section for broken links
  // First check if the exempt domain section already exists, if not create it
  let exemptDomainSection = $('#exemptDomainSection');
  if (!exemptDomainSection) {
    exemptDomainSection = document.createElement('div');
    exemptDomainSection.id = 'exemptDomainSection';
    exemptDomainSection.className = 'd-none border-top mt-3 pt-3';
    exemptDomainSection.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">Problem With This Link?</h6>
        <button id="addToExemptListBtn" class="btn btn-sm btn-outline-primary">Add to Exempt Domains</button>
      </div>
      <p class="small text-muted">If this link works when opened in your browser but fails link checks, add it to the exempt domains list.</p>
    `;
    
    // Get the auth domain section and insert the exempt domain section after it
    const authDomainSection = $('#authDomainSection');
    if (authDomainSection) {
      authDomainSection.parentNode.insertBefore(exemptDomainSection, authDomainSection.nextSibling);
      
      // Add click handler for the exempt domains button
      $('#addToExemptListBtn').addEventListener('click', addCurrentUrlToExemptList);
    }
  }
  
  // Show exempt domain section if the link is broken or has an error
  const isBroken = bookmark.available === false || bookmark.checkError;
  const isExempt = bookmark.isExemptDomain === true;
  
  // Helper to check if a domain is already in the exempt list
  function isInExemptList(url) {
    const domain = extractDomain(url);
    if (!domain) return false;
    
    return exemptDomains.some(d => d.domain.toLowerCase() === domain.toLowerCase());
  }
  
  // Only show for broken links that aren't already exempt and don't need auth
  const showExemptSection = isBroken && !isExempt && !needsAuth && bookmark.url;
  exemptDomainSection.classList.toggle('d-none', !showExemptSection);
  
  // Disable the button if the domain is already in the exempt list
  if (showExemptSection && bookmark.url) {
    const alreadyExempt = isInExemptList(bookmark.url);
    
    if ($('#addToExemptListBtn')) {
      $('#addToExemptListBtn').disabled = alreadyExempt;
      
      if (alreadyExempt) {
        $('#addToExemptListBtn').innerHTML = 'Domain Already Exempt';
      } else {
        $('#addToExemptListBtn').innerHTML = 'Add to Exempt Domains';
      }
    }
  }
};

// Load and display exempt domains
function loadExemptDomains() {
  chrome.storage.local.get({ exemptDomains: [] }, ({ exemptDomains: domains }) => {
    // Save to global state
    exemptDomains = domains;
    
    // Update the exempt domains list in the modal
    renderExemptDomainsList();
  });
}

// Render the exempt domains list in the modal
function renderExemptDomainsList() {
  const list = $('#exemptDomainsList');
  
  // Show or hide the empty message
  $('#emptyExemptDomainsMsg').style.display = exemptDomains.length ? 'none' : 'block';
  
  // Remove existing items (except the empty message)
  document.querySelectorAll('#exemptDomainsList .exempt-domain-item').forEach(item => item.remove());
  
  // Add each domain to the list
  exemptDomains.forEach((domain, index) => {
    const item = document.createElement('div');
    item.className = 'list-group-item exempt-domain-item';
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-bold">${esc(domain.domain)}</div>
          <div class="small text-muted">${esc(domain.reason || 'No reason specified')}</div>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm btn-outline-danger delete-exempt-domain" data-index="${index}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
    
    list.appendChild(item);
  });
  
  // Add event listeners for delete buttons
  document.querySelectorAll('.delete-exempt-domain').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      if (confirm(`Remove ${exemptDomains[index].domain} from your exempt domains list?`)) {
        deleteExemptDomain(index);
      }
    });
  });
}

// Add a new domain to the exempt list
function addExemptDomain(domain, reason) {
  // First check if the domain already exists
  const existingIndex = exemptDomains.findIndex(d => d.domain.toLowerCase() === domain.toLowerCase());
  
  if (existingIndex >= 0) {
    // Update existing domain
    exemptDomains[existingIndex] = {
      domain,
      reason: reason || exemptDomains[existingIndex].reason
    };
  } else {
    // Add new domain
    exemptDomains.push({
      domain,
      reason
    });
  }
  
  // Save to storage
  chrome.storage.local.set({ exemptDomains }, () => {
    // Re-render the list
    renderExemptDomainsList();
    
    // Show success message
    const existingAlert = $('#exemptDomainsSuccessAlert');
    if (existingAlert) existingAlert.remove();
    
    const alert = document.createElement('div');
    alert.id = 'exemptDomainsSuccessAlert';
    alert.className = 'alert alert-success mt-3';
    alert.innerHTML = `<i class="bi bi-check-circle me-2"></i> Domain ${existingIndex >= 0 ? 'updated' : 'added'} successfully!`;
    
    // Insert before the form
    $('#addExemptDomainForm').before(alert);
    
    // Clear the form
    $('#exemptDomainInput').value = '';
    $('#exemptReasonInput').value = '';
    
    // Remove the alert after a few seconds
    setTimeout(() => {
      if (alert.parentNode) {
        alert.parentNode.removeChild(alert);
      }
    }, 3000);
  });
}

// Delete a domain from the exempt list
function deleteExemptDomain(index) {
  if (index < 0 || index >= exemptDomains.length) return;
  
  // Remove the domain
  exemptDomains.splice(index, 1);
  
  // Save to storage
  chrome.storage.local.set({ exemptDomains }, () => {
    // Re-render the list
    renderExemptDomainsList();
  });
}

// Add current URL domain to exempt list
function addCurrentUrlToExemptList() {
  if (!currentLinkData || !currentLinkData.bookmark || !currentLinkData.bookmark.url) {
    return;
  }
  
  const domain = extractDomain(currentLinkData.bookmark.url);
  if (!domain) {
    alert('Could not extract domain from URL');
    return;
  }
  
  // Pre-fill the domain in the form
  $('#exemptDomainInput').value = domain;
  $('#exemptReasonInput').value = 'Blocks automated requests but works in browser';
  
  // Close current modal and open auth domains modal with exempt tab active
  bootstrap.Modal.getInstance($('#linkDetailModal')).hide();
  
  // Show the domains modal and activate the exempt domains tab
  new bootstrap.Modal($('#authDomainsModal')).show();
  const tabElement = document.querySelector('#exempt-domains-tab');
  const tab = new bootstrap.Tab(tabElement);
  tab.show();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme based on preference
  setTheme(getPreferredTheme());
  
  // Add theme toggle handler
  $('#theme-toggle').addEventListener('click', toggleTheme);
  
  // Wait for storage to be ready before loading data
  try {
    if (window.storageReadyPromise) {
      console.log('Waiting for storage to be ready...');
      await window.storageReadyPromise;
      console.log('Storage ready, loading audit data...');
    }
  } catch (error) {
    console.error('Storage initialization error:', error);
  }
  
  // Load pathways, auth domains, and exempt domains
  loadPathways();
  loadAuthDomains();
  loadExemptDomains();
  
  // Add filter change event listeners
  $('#pathwayFilter').addEventListener('change', e => {
    currentPathwayFilter = e.target.value;
    updateAuditTable();
  });
  
  $('#statusFilter').addEventListener('change', e => {
    currentStatusFilter = e.target.value;
    updateAuditTable();
  });
  
  // Add modal action button event listeners
  $('#recheckLinkBtn').addEventListener('click', () => {
    if (currentLinkData) {
      checkSingleLink(
        currentLinkData.pathwayIndex,
        currentLinkData.stepIndex,
        currentLinkData.bookmarkIndex
      );
    }
  });
  
  $('#updateRedirectBtn').addEventListener('click', updateToRedirectUrl);
  $('#archiveOrgBtn').addEventListener('click', viewInArchiveOrg);
  
  // Add check all links button event listener
  $('#checkAllLinksBtn').addEventListener('click', checkAllLinks);
  
  // Add manage auth domains button event listener
  $('#manageAuthDomainsBtn').addEventListener('click', () => {
    new bootstrap.Modal($('#authDomainsModal')).show();
  });
  
  // Add auth domain form submission handler
  $('#addAuthDomainForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const domain = $('#domainInput').value.trim();
    const username = $('#usernameInput').value.trim();
    const password = $('#passwordInput').value;
    const displayName = $('#domainNameInput').value.trim();
    
    if (domain && username && password) {
      addAuthDomain(domain, username, password, displayName);
    }
  });
  
  // Add exempt domain form submission handler
  $('#addExemptDomainForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const domain = $('#exemptDomainInput').value.trim();
    const reason = $('#exemptReasonInput').value.trim();
    
    if (domain) {
      addExemptDomain(domain, reason);
    }
  });
  
  // Add to auth list button in link detail modal
  $('#addToAuthListBtn').addEventListener('click', addCurrentUrlToAuthList);
});