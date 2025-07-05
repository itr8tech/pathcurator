// Pathway Detail JS - Focused management of a single pathway
import { updatePathwayVersion, formatVersion, formatTimestamp } from './version-utils.js';
import { exportPathwayAsHTML, exportPathwayAsCSV, exportStepAsHTML, exportStepAsCSV } from './web-exports.js';

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => s?.replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c])) || '';

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

// Simple markdown
function md(t='') {
  if(!t.trim()) return '';
  let h = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
           .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return h.split(/\n+/).map(l => 
    /^[*-]\s+/.test(l) ? '<li>' + l.slice(2) + '</li>' : '<p>' + l + '</p>'
  ).join('');
}

// Get pathway ID from URL
const getPathwayId = () => {
  const params = new URLSearchParams(location.search);
  return params.get('id');
};

// Get pathway index as number
const getPathwayIndex = () => {
  const id = getPathwayId();
  return id ? parseInt(id) : null;
};

// Format date
const formatDate = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};

// Save helper with version update and async error handling
const save = async (pathways, pathwayIndex, cb) => {
  try {
    // Validate inputs
    if (!Array.isArray(pathways)) {
      console.error('Invalid pathways array for saving:', pathways);
      if (typeof cb === 'function') cb();
      return;
    }

    // Update version and lastUpdated timestamp whenever saving
    if (pathwayIndex !== undefined && pathways[pathwayIndex]) {
      try {
        // Make a deep copy to avoid reference issues
        const pathwayCopy = JSON.parse(JSON.stringify(pathways[pathwayIndex]));

        // Try to update with the imported function
        let updatedPathway;
        try {
          updatedPathway = await updatePathwayVersion(pathwayCopy);
        } catch (moduleError) {
          console.error('Error calling updatePathwayVersion:', moduleError);

          // Manual fallback for version updating
          updatedPathway = pathwayCopy;
          updatedPathway.lastUpdated = Date.now();
          if (!updatedPathway.version) {
            updatedPathway.version = `fallback-${Date.now()}`;
          }
          console.warn('Using fallback version update mechanism');
        }

        // Validate the result
        if (updatedPathway && typeof updatedPathway === 'object') {
          pathways[pathwayIndex] = updatedPathway;
        } else {
          console.error('Failed to update pathway version, using original');
        }
      } catch (versionError) {
        console.error('Error in version update process:', versionError);
        // Continue with save anyway
      }
    }

    // Save to Chrome storage with error handling
    chrome.storage.local.set({pathways}, () => {
      if (chrome.runtime.lastError) {
        console.error('Chrome storage save error:', chrome.runtime.lastError);
      }

      // Always call callback even if there was an error
      if (typeof cb === 'function') cb();
    });
  } catch (error) {
    console.error('Unexpected error in save function:', error);
    // Call callback even on error
    if (typeof cb === 'function') cb();
  }
};

// Store open/closed state of details elements
function saveOpenState() {
  // Create an array to store which steps are open
  const openStates = [];
  document.querySelectorAll('#stepsList details').forEach((details, index) => {
    openStates[index] = details.hasAttribute('open');
  });
  return openStates;
}

// Restore open/closed state of details elements
function restoreOpenState(openStates) {
  if (!openStates || !openStates.length) return;
  
  document.querySelectorAll('#stepsList details').forEach((details, index) => {
    if (index < openStates.length && openStates[index]) {
      details.setAttribute('open', '');
    }
  });
}

// Load pathway data
function loadPathwayData(openStates = null) {
  const pathwayId = getPathwayId();
  if (!pathwayId) {
    alert('No pathway specified');
    window.location.href = 'dashboard.html';
    return;
  }
  
  // Convert to numeric index
  const pathwayIndex = parseInt(pathwayId);

  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    console.log('=== PATHWAY DETAIL LOADING ===');
    console.log('- pathwayId (from URL):', pathwayId, typeof pathwayId);
    console.log('- pathwayIndex (converted):', pathwayIndex, typeof pathwayIndex);
    console.log('- pathways array length:', pathways.length);
    console.log('- pathways array:', pathways);
    
    if (pathways.length > 0) {
      pathways.forEach((p, i) => {
        console.log(`  Pathway ${i}:`, {
          name: p.name,
          id: p.id,
          stepsCount: p.steps?.length || 0
        });
      });
    }
    
    const pathway = pathways[pathwayIndex];
    console.log('- pathway found at index', pathwayIndex, ':', !!pathway);
    
    // Debug bookmark counts like dashboard does
    if (pathway && pathway.steps) {
      console.log('=== PATHWAY DETAIL BOOKMARK DEBUG ===');
      pathway.steps.forEach((step, sIdx) => {
        console.log(`Step ${sIdx} (${step.name}):`, step.bookmarks?.length || 0, 'bookmarks');
        if (step.bookmarks && step.bookmarks.length > 0) {
          step.bookmarks.forEach((bookmark, bIdx) => {
            console.log(`  Bookmark ${bIdx}: "${bookmark.title}" (required: ${bookmark.required}, type: ${bookmark.type})`);
          });
        }
      });
      console.log('=== END BOOKMARK DEBUG ===');
    }
    if (pathway) {
      console.log('- pathway details:', {
        name: pathway.name,
        stepsCount: pathway.steps?.length || 0
      });
    }
    
    if (!pathway) {
      console.error('Pathway not found at index', pathwayIndex);
      alert('Pathway not found');
      window.location.href = 'dashboard.html';
      return;
    }

    // Populate pathway details
    $('#pathwayTitle').textContent = pathway.name;
    $('#pathwayTitleOverlay').textContent = pathway.name;
    $('#pathwayDescription').innerHTML = md(pathway.description || '');
    $('#stepCount').textContent = pathway.steps?.length || 0;
    
    // Count total bookmarks
    const bookmarkCount = pathway.steps?.reduce((total, step) => 
      total + (step.bookmarks?.length || 0), 0) || 0;
    $('#bookmarkCount').textContent = bookmarkCount;
    
    // Show created date if available
    $('#createdDate').textContent = pathway.created ? 
      formatDate(pathway.created) : 'Unknown';
      
    // Show version info if available
    if (pathway.version) {
      $('#versionInfo').textContent = formatVersion(pathway.version);
    }
    
    // Show last updated date if available
    if (pathway.lastUpdated) {
      $('#lastUpdatedDate').textContent = formatTimestamp(pathway.lastUpdated);
    } else {
      $('#lastUpdatedContainer').style.display = 'none';
    }
    
    // Show creator info if available
    if (pathway.createdBy) {
      $('#creatorInfo').textContent = pathway.createdBy;
    } else {
      $('#creatorInfoContainer').style.display = 'none';
    }
    
    // Show modifier info if available and different from creator
    if (pathway.modifiedBy && pathway.modifiedBy !== pathway.createdBy) {
      $('#modifierInfo').textContent = pathway.modifiedBy;
    } else {
      $('#modifierInfoContainer').style.display = 'none';
    }
    
    // Handle header image - show custom image or default
    if (pathway.headerImage) {
      // Show custom header image
      $('#pathwayHeaderImage').style.backgroundImage = `url(${pathway.headerImage})`;
    } else {
      // Show default header image - using a gradient as default
      $('#pathwayHeaderImage').style.backgroundImage = 'linear-gradient(135deg, #4a6fc0 0%, #2F6173 50%, #357385 100%)';
    }
    // Always show the header image container
    $('#headerImageContainer').classList.remove('d-none');
    
    // Handle Content Warning
    if (pathway.contentWarning && pathway.contentWarning.trim()) {
      $('#pathwayContentWarning').innerHTML = md(pathway.contentWarning);
      $('#contentWarningContainer').classList.remove('d-none');
    } else {
      $('#contentWarningContainer').classList.add('d-none');
    }
    
    // Handle Acknowledgments
    if (pathway.acknowledgments && pathway.acknowledgments.trim()) {
      $('#pathwayAcknowledgments').innerHTML = md(pathway.acknowledgments);
      $('#acknowledgmentsContainer').classList.remove('d-none');
    } else {
      $('#acknowledgmentsContainer').classList.add('d-none');
    }

    // Render steps
    renderSteps(pathway, pathwayId);
    
    // Restore open/closed state if provided
    if (openStates) {
      restoreOpenState(openStates);
    }
  });
}

// Render steps list
function renderSteps(pathway, pathwayId) {
  const stepsHtml = (pathway.steps || [])
    .map((step, index) => {
      const required = (step.bookmarks || []).filter(b => b.required !== false);
      const bonus = (step.bookmarks || []).filter(b => b.required === false);
      
      return `
      <details class="card mb-3">
        <summary class="card-header step-header d-flex align-items-center">
          <span class="drag-handle-step me-2"><i class="bi bi-grip-vertical"></i></span>
          <span>${esc(step.name)}</span>
          <div class="ms-2">
            ${required.length > 0 ? `<span class="badge text-bg-primary">${required.length}</span>` : ''}
            ${bonus.length > 0 ? `<span class="badge text-bg-info ms-1">${bonus.length}</span>` : ''}
          </div>
          <div class="ms-auto btn-group">
            <button data-action="edit-step" data-step="${index}" class="btn btn-sm btn-outline-secondary">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button data-action="add-bookmark" data-step="${index}" class="btn btn-sm btn-outline-primary">
              <i class="bi bi-plus-lg"></i> Bookmark
            </button>
            <div class="btn-group">
              <button data-action="export-step" data-step="${index}" class="btn btn-sm btn-outline-secondary">
                <i class="bi bi-box-arrow-up-right"></i>
              </button>
              <button class="btn btn-sm btn-outline-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Export Options</span>
              </button>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item" href="#" data-action="export-step-csv" data-step="${index}">Export as CSV</a></li>
                <li><a class="dropdown-item" href="#" data-action="export-step-json" data-step="${index}">Export as JSON</a></li>
              </ul>
            </div>
            <button data-action="delete-step" data-step="${index}" class="btn btn-sm btn-outline-danger">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </summary>
        
        <div class="card-body">
          ${step.objective ? `<div class="mb-3 fst-italic">${md(step.objective)}</div>` : ''}

          <div id="bookmarks-${index}" class="mt-3">
            ${renderBookmarks(step.bookmarks || [], index, pathwayId)}
          </div>

          ${step.pauseAndReflect ? `
          <div class="mt-4 p-3 bg-light rounded pause-reflect-section">
            <h5 class="mb-3"><i class="bi bi-journal-text me-2"></i> Pause and Reflect</h5>
            <div class="pause-reflect-content">${md(step.pauseAndReflect)}</div>
          </div>` : ''}
        </div>
      </details>`;
    })
    .join('');
  
  $('#stepsList').innerHTML = stepsHtml;
  initSortable(pathway, pathwayId);
}

// Render bookmarks with separate required and bonus sections
function renderBookmarks(bookmarks, stepIndex, pathwayId) {
  if (!bookmarks.length) {
    return '<div class="text-center text-muted py-3">No bookmarks yet</div>';
  }
  
  // Filter by required flag, not by type field
  const required = bookmarks.filter(b => b.required !== false);
  const bonus = bookmarks.filter(b => b.required === false);
  
  return `
    ${required.length > 0 ? `
      <h6>Required Resources</h6>
      <ul class="list-group mb-3">
        ${required.map((bookmark, index) => renderBookmark(bookmark, stepIndex, pathwayId, bookmarks.indexOf(bookmark))).join('')}
      </ul>
    ` : ''}
    
    ${bonus.length > 0 ? `
      <h6 class="mt-4">Bonus Resources</h6>
      <ul class="list-group mb-3">
        ${bonus.map((bookmark, index) => renderBookmark(bookmark, stepIndex, pathwayId, bookmarks.indexOf(bookmark))).join('')}
      </ul>
    ` : ''}
  `;
}

// Render a single bookmark
function renderBookmark(bookmark, stepIndex, pathwayId, bookmarkIndex) {
  const isBonus = bookmark.required === false;
  const badgeClass = isBonus ? 'text-bg-info' : 'text-bg-primary';
  const badgeText = isBonus ? 'BONUS' : 'REQUIRED';
  
  // Content type icon mapping
  const contentType = bookmark.contentType || 'Read';
  const contentTypeIcons = {
    'Read': 'bi-book',
    'Watch': 'bi-play-btn',
    'Listen': 'bi-headphones',
    'Participate': 'bi-person-workspace'
  };
  
  const contentTypeIcon = contentTypeIcons[contentType] || 'bi-book';
  const contentTypeBadgeClass = {
    'Read': 'bg-success',
    'Watch': 'bg-danger',
    'Listen': 'bg-warning text-dark',
    'Participate': 'bg-info'
  }[contentType] || 'bg-secondary';
  
  // Link health status indicator
  let linkStatusIcon = '';
  let linkStatusTitle = 'Link has not been checked yet';
  
  if (bookmark.lastChecked) {
    const daysSinceCheck = Math.floor((Date.now() - bookmark.lastChecked) / (24 * 60 * 60 * 1000));
    const checkedTimeAgo = daysSinceCheck === 0 ? 'today' : 
                           daysSinceCheck === 1 ? 'yesterday' : 
                           `${daysSinceCheck} days ago`;
    
    if (bookmark.available === true) {
      // Show redirect icon if redirected
      if (bookmark.redirectUrl) {
        linkStatusIcon = '<i class="bi bi-arrow-return-right text-warning ms-2"></i>';
        linkStatusTitle = `Link redirects to ${bookmark.redirectUrl} (checked ${checkedTimeAgo})`;
      } 
      // Show potential issue icon if there was an error but we're still marking it as available
      else if (bookmark.checkError) {
        linkStatusIcon = '<i class="bi bi-info-circle text-info ms-2"></i>';
        linkStatusTitle = `Link appears valid but couldn't be fully verified: ${bookmark.checkError} (checked ${checkedTimeAgo})`;
      }
      // Show success icon for confirmed working links 
      else {
        linkStatusIcon = '<i class="bi bi-check-circle-fill text-success ms-2"></i>';
        linkStatusTitle = `Link is working (Status: ${bookmark.status || 'OK'}, checked ${checkedTimeAgo})`;
      }
    } 
    // For definitely unavailable links, show error icon
    else {
      linkStatusIcon = '<i class="bi bi-exclamation-triangle-fill text-danger ms-2"></i>';
      linkStatusTitle = bookmark.checkError ? 
        `Error: ${bookmark.checkError} (checked ${checkedTimeAgo})` : 
        `Link may be broken (Status: ${bookmark.status || 'Error'}, checked ${checkedTimeAgo})`;
    }
  }

  return `
    <li class="list-group-item d-flex align-items-start" 
        data-step="${stepIndex}" data-bookmark="${bookmarkIndex}">
      <span class="drag-handle-bm me-2"><i class="bi bi-grip-vertical"></i></span>
      <div class="flex-grow-1">
        <div class="d-flex align-items-center">
          <span class="badge ${contentTypeBadgeClass} me-2" title="${contentType}">
            <i class="bi ${contentTypeIcon}"></i>
          </span>
          <a href="${bookmark.url}" target="_blank" class="fw-semibold">${esc(bookmark.title)}</a>
          <span class="badge ${badgeClass} ms-2">${badgeText}</span>
          <span title="${linkStatusTitle}">${linkStatusIcon}</span>
        </div>
        <p class="small text-body-secondary mb-1">${esc(bookmark.description)}</p>
        <p class="fst-italic small mb-0">${esc(bookmark.context)}</p>
      </div>
      <div class="btn-group ms-2">
        <button data-action="edit-bookmark" data-step="${stepIndex}" data-bookmark="${bookmarkIndex}" 
                class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button data-action="delete-bookmark" data-step="${stepIndex}" data-bookmark="${bookmarkIndex}" 
                class="btn btn-sm btn-outline-danger">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </li>`;
}

// Initialize Sortable for drag and drop functionality
function initSortable(pathway, pathwayId) {
  try {
    // Enable step sorting
    const stepsList = $('#stepsList');
    if (stepsList && stepsList.children.length > 1) {
      new Sortable(stepsList, {
        handle: '.drag-handle-step',
        animation: 150,
        onEnd: () => {
          try {
            // Save the open state before we possibly modify the DOM
            const openStates = saveOpenState();

            // Get the new order
            const newOrder = [];
            [...stepsList.children].forEach((item) => {
              // Find data-step attribute safely
              const stepElement = item.querySelector('[data-step]');
              if (stepElement && stepElement.dataset.step !== undefined) {
                const stepIndex = +stepElement.dataset.step;
                if (!isNaN(stepIndex)) {
                  newOrder.push(stepIndex);
                }
              }
            });

            // Only proceed if we have a valid order
            if (newOrder.length > 0) {
              console.log('Step reordering triggered with order:', newOrder);
              reorderSteps(pathway, pathwayId, newOrder);
            } else {
              console.error('Could not determine step order from DOM');
              // Restore the view without saving changes
              loadPathwayData(openStates);
            }
          } catch (error) {
            console.error('Error in step sorting event handler:', error);
            // Restore the view
            loadPathwayData();
          }
        }
      });
    }

    // Enable bookmark sorting within each step
    $$('[id^="bookmarks-"]').forEach((container, containerIndex) => {
      if (!container) return;

      const bookmarkContainers = container.querySelectorAll('.list-group');
      if (!bookmarkContainers || bookmarkContainers.length === 0) return;

      // Setup sorting for both required and bonus sections
      bookmarkContainers.forEach(bookmarkList => {
        if (bookmarkList && bookmarkList.children.length > 1) {
          new Sortable(bookmarkList, {
            handle: '.drag-handle-bm',
            animation: 150,
            onEnd: (evt) => {
              try {
                // Save the open state before we possibly modify the DOM
                const openStates = saveOpenState();

                // Get the step index
                let stepIndex = -1;
                if (evt.item && evt.item.dataset.step !== undefined) {
                  stepIndex = +evt.item.dataset.step;
                }

                // Verify we have a valid step index
                if (isNaN(stepIndex) || stepIndex < 0) {
                  console.error('Invalid step index for bookmark sorting:', stepIndex);
                  return loadPathwayData(openStates);
                }

                // Get the new order of bookmarks
                const newOrder = [];
                [...bookmarkList.children].forEach(item => {
                  if (item && item.dataset.bookmark !== undefined) {
                    const bookmarkIndex = +item.dataset.bookmark;
                    if (!isNaN(bookmarkIndex)) {
                      newOrder.push(bookmarkIndex);
                    }
                  }
                });

                // Only proceed if we have a valid order
                if (newOrder.length > 0) {
                  console.log('Bookmark reordering triggered with order:', {
                    stepIndex,
                    newOrder
                  });
                  reorderBookmarks(pathway, pathwayId, stepIndex, newOrder);
                } else {
                  console.error('Could not determine bookmark order from DOM');
                  // Restore the view without saving changes
                  loadPathwayData(openStates);
                }
              } catch (error) {
                console.error('Error in bookmark sorting event handler:', error);
                // Restore the view
                loadPathwayData();
              }
            }
          });
        }
      });
    });
  } catch (error) {
    console.error('Error initializing sortable:', error);
  }
}

// Reorder steps after drag and drop - now with async/await
async function reorderSteps(pathway, pathwayId, newOrder) {
  // Save which steps are currently open before reordering
  const openStates = saveOpenState();

  // Use Promise to handle the Chrome storage callback
  const pathwaysData = await new Promise(resolve => {
    chrome.storage.local.get({pathways: []}, data => {
      resolve(data);
    });
  });

  try {
    // Safety check for pathways array
    if (!pathwaysData || !pathwaysData.pathways) {
      console.error('Failed to get pathways data from storage');
      loadPathwayData(openStates);
      return;
    }

    // Make a deep copy to prevent state corruption
    const pathways = JSON.parse(JSON.stringify(pathwaysData.pathways));

    // Validate that we have the pathway and its steps
    const pathwayIndex = getPathwayIndex();
    if (!pathways[pathwayIndex] || !pathways[pathwayIndex].steps) {
      console.error('Cannot reorder steps: pathway or steps not found');
      loadPathwayData(openStates);
      return; // Exit without making changes
    }

    // Validate the new order
    if (!Array.isArray(newOrder) || newOrder.length === 0) {
      console.error('Invalid new order for steps:', newOrder);
      loadPathwayData(openStates);
      return; // Exit without making changes
    }

    // Ensure we're working with a copy of the original steps
    const originalSteps = [...pathways[pathwayIndex].steps];

    // Create the reordered array with validation
    const reorderedSteps = [];
    for (let i = 0; i < newOrder.length; i++) {
      const index = newOrder[i];
      // Check if index is valid
      if (index >= 0 && index < originalSteps.length) {
        reorderedSteps.push(originalSteps[index]);
      } else {
        console.warn(`Invalid step index in new order: ${index}`);
      }
    }

    // Only update if we have a valid reordered array
    if (reorderedSteps.length > 0) {
      // Log the reordering
      console.log('Successfully reordering steps:', {
        originalCount: originalSteps.length,
        reorderedCount: reorderedSteps.length,
        newOrder: newOrder
      });

      // Apply the changes
      pathways[pathwayIndex].steps = reorderedSteps;

      // Use a promise for the save operation
      await new Promise(resolve => {
        // Save with proper error handling
        save(pathways, pathwayIndex, () => {
          resolve();
        });
      });

      // Now reload the data to show the changes
      loadPathwayData(openStates);
    } else {
      console.error('No valid steps in reordered array');
      // Reload anyway to restore original state
      loadPathwayData(openStates);
    }
  } catch (error) {
    console.error('Error during step reordering:', error);
    // Reload to restore original state
    loadPathwayData(openStates);
  }
}

// Reorder bookmarks after drag and drop - now with async/await
async function reorderBookmarks(pathway, pathwayId, stepIndex, newOrder) {
  // Save which steps are currently open before reordering
  const openStates = saveOpenState();

  // Use Promise to handle the Chrome storage callback
  const pathwaysData = await new Promise(resolve => {
    chrome.storage.local.get({pathways: []}, data => {
      resolve(data);
    });
  });

  try {
    // Safety check for pathways array
    if (!pathwaysData || !pathwaysData.pathways) {
      console.error('Failed to get pathways data from storage');
      loadPathwayData(openStates);
      return;
    }

    // Make a deep copy to prevent state corruption
    const pathways = JSON.parse(JSON.stringify(pathwaysData.pathways));

    // Validate that we have the pathway, step, and bookmarks
    if (!pathways[getPathwayIndex()] || !pathways[getPathwayIndex()].steps ||
        !pathways[getPathwayIndex()].steps[stepIndex]) {
      console.error('Cannot reorder bookmarks: pathway or step not found');
      loadPathwayData(openStates);
      return; // Exit without making changes
    }

    const step = pathways[getPathwayIndex()].steps[stepIndex];

    // Validate that step has bookmarks
    if (!step.bookmarks || !Array.isArray(step.bookmarks)) {
      console.error('No bookmarks array found for step');
      loadPathwayData(openStates);
      return; // Exit without making changes
    }

    // Validate new order
    if (!Array.isArray(newOrder) || newOrder.length === 0) {
      console.error('Invalid new order for bookmarks:', newOrder);
      loadPathwayData(openStates);
      return; // Exit without making changes
    }

    // Ensure we're working with a copy of the original bookmarks
    const originalBookmarks = [...step.bookmarks];

    // Create the reordered array with validation
    const reorderedBookmarks = [];
    for (let i = 0; i < newOrder.length; i++) {
      const index = newOrder[i];
      // Check if index is valid
      if (index >= 0 && index < originalBookmarks.length) {
        reorderedBookmarks.push(originalBookmarks[index]);
      } else {
        console.warn(`Invalid bookmark index in new order: ${index}`);
      }
    }

    // Only update if we have a valid reordered array
    if (reorderedBookmarks.length > 0) {
      // Log the reordering
      console.log('Successfully reordering bookmarks:', {
        originalCount: originalBookmarks.length,
        reorderedCount: reorderedBookmarks.length,
        newOrder: newOrder
      });

      // Apply the changes
      step.bookmarks = reorderedBookmarks;

      // Use a promise for the save operation
      await new Promise(resolve => {
        // Save with proper error handling
        save(pathways, pathwayIndex, () => {
          resolve();
        });
      });

      // Now reload the data to show the changes
      loadPathwayData(openStates);
    } else {
      console.error('No valid bookmarks in reordered array');
      // Reload anyway to restore original state
      loadPathwayData(openStates);
    }
  } catch (error) {
    console.error('Error during bookmark reordering:', error);
    // Reload to restore original state
    loadPathwayData(openStates);
  }
}

// Edit pathway details
function editPathway() {
  const pathwayId = getPathwayId();
  window.location.href = `edit-pathway.html?id=${pathwayId}`;
}

// Add new step
function addStep() {
  const pathwayId = getPathwayId();
  window.location.href = `edit-step.html?pathwayId=${pathwayId}`;
}

// Edit step
function editStep(stepIndex) {
  const pathwayId = getPathwayId();
  window.location.href = `edit-step.html?pathwayId=${pathwayId}&stepIndex=${stepIndex}`;
}

// Delete step
function deleteStep(stepIndex) {
  if (!confirm('Delete this step and all its bookmarks? This cannot be undone.')) {
    return;
  }
  
  // Save open state
  const openStates = saveOpenState();
  
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    // Remove the step
    pathways[pathwayIndex].steps.splice(stepIndex, 1);
    
    // Remove the corresponding open state
    openStates.splice(stepIndex, 1);
    
    // Save and reload
    save(pathways, pathwayIndex, () => loadPathwayData(openStates));
  });
}

// Add bookmark to a step
function addBookmark(stepIndex) {
  const pathwayId = getPathwayId();
  window.location.href = `edit-bookmark.html?pathwayId=${pathwayId}&stepIndex=${stepIndex}`;
}

// Edit bookmark
function editBookmark(stepIndex, bookmarkIndex) {
  const pathwayId = getPathwayId();
  window.location.href = `edit-bookmark.html?pathwayId=${pathwayId}&stepIndex=${stepIndex}&bookmarkIndex=${bookmarkIndex}`;
}

// Delete bookmark
function deleteBookmark(stepIndex, bookmarkIndex) {
  if (!confirm('Delete this bookmark? This cannot be undone.')) {
    return;
  }
  
  // Save open state
  const openStates = saveOpenState();
  
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    // Remove the bookmark
    pathways[pathwayIndex].steps[stepIndex].bookmarks.splice(bookmarkIndex, 1);
    
    // Save and reload
    save(pathways, pathwayIndex, () => loadPathwayData(openStates));
  });
}

// Export functions
function exportAsHtml() {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({ pathways: [] }, async ({ pathways }) => {
    const pathway = pathways[pathwayIndex];
    
    if (pathway) {
      await exportPathwayAsHTML(pathway);
    } else {
      alert('Pathway not found');
    }
  });
}

function exportAsCsv() {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({ pathways: [] }, ({ pathways }) => {
    const pathway = pathways[pathwayIndex];
    
    if (pathway) {
      exportPathwayAsCSV(pathway);
    } else {
      alert('Pathway not found');
    }
  });
}

function exportAsJson() {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[pathwayIndex];
    if (!pathway) return;
    
    // Create a copy of the pathway with added sort orders
    const pathwayWithSortOrder = JSON.parse(JSON.stringify(pathway));
    
    // Add sort order to each bookmark in each step
    if (pathwayWithSortOrder.steps) {
      pathwayWithSortOrder.steps.forEach(step => {
        if (step.bookmarks) {
          step.bookmarks.forEach((bookmark, index) => {
            bookmark.sortOrder = index;
          });
        }
      });
    }
    
    const json = JSON.stringify([pathwayWithSortOrder], null, 2); // Wrap in array for consistent format
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    // Sanitize filename
    const pathwayName = pathway.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    
    // Trigger download
    chrome.downloads.download({
      url: url,
      filename: `curator-pathway-${pathwayName}.json`,
      saveAs: true
    });
  });
}

// Step-level export functions
function exportStepAsHtml(stepIndex) {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({ pathways: [] }, async ({ pathways }) => {
    const pathway = pathways[pathwayIndex];
    
    if (pathway) {
      await exportStepAsHTML(pathway, stepIndex);
    } else {
      alert('Pathway not found');
    }
  });
}

function exportStepAsCsv(stepIndex) {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({ pathways: [] }, ({ pathways }) => {
    const pathway = pathways[pathwayIndex];
    
    if (pathway) {
      exportStepAsCSV(pathway, stepIndex);
    } else {
      alert('Pathway not found');
    }
  });
}

function exportStepAsJson(stepIndex) {
  const pathwayIndex = getPathwayIndex();
  chrome.storage.local.get({pathways: []}, ({pathways}) => {
    const pathway = pathways[pathwayIndex];
    if (!pathway || !pathway.steps || stepIndex >= pathway.steps.length) return;
    
    // Create a deep copy of the step
    const step = JSON.parse(JSON.stringify(pathway.steps[stepIndex]));
    
    // Add sort order to each bookmark
    if (step.bookmarks) {
      step.bookmarks.forEach((bookmark, index) => {
        bookmark.sortOrder = index;
      });
    }
    
    const json = JSON.stringify(step, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    // Sanitize filenames
    const pathwayName = pathway.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    const stepName = step.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    
    // Trigger download
    chrome.downloads.download({
      url: url,
      filename: `curator-pathway-${pathwayName}-step-${stepName}.json`,
      saveAs: true
    });
  });
}

// Audit links in a pathway
async function auditPathwayLinks() {
  // Save open state
  const openStates = saveOpenState();
  
  // Show status
  const statusDiv = document.createElement('div');
  statusDiv.className = 'position-fixed top-0 start-0 end-0 bg-warning text-dark p-3 text-center';
  statusDiv.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div> Checking all links in pathway...';
  statusDiv.style.zIndex = '9999';
  document.body.appendChild(statusDiv);
  
  const pathwayIndex = getPathwayIndex();
  try {
    // Get current pathway
    const { pathways } = await chrome.storage.local.get({ pathways: [] });
    const pathway = pathways[pathwayIndex];
    
    if (!pathway || !pathway.steps) {
      throw new Error('Pathway not found');
    }
    
    let linksChecked = 0;
    let totalLinks = 0;
    
    // Count total links
    pathway.steps.forEach(step => {
      if (step.bookmarks) {
        totalLinks += step.bookmarks.length;
      }
    });
    
    // Process links
    for (const step of pathway.steps) {
      if (!step.bookmarks) continue;
      
      for (const bookmark of step.bookmarks) {
        if (!bookmark.url) continue;
        
        // Update status
        statusDiv.innerHTML = `<div class="spinner-border spinner-border-sm me-2" role="status"></div> Checking link ${linksChecked + 1} of ${totalLinks}...`;
        
        try {
          // Check link
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
          
          linksChecked++;
        } catch (error) {
          bookmark.lastChecked = Date.now();
          bookmark.available = false;
          bookmark.checkError = error.message;
          linksChecked++;
        }
      }
    }
    
    // Count link types
    let healthyCount = 0;
    let brokenCount = 0;
    let redirectCount = 0;
    let authRequiredCount = 0;

    // Analyze status counts
    pathway.steps.forEach(step => {
      if (!step.bookmarks) return;
      
      step.bookmarks.forEach(bookmark => {
        if (!bookmark.lastChecked) return;
        
        if (bookmark.requiresAuth || bookmark.status === 401 || bookmark.status === 403) {
          authRequiredCount++;
        } else if (bookmark.available === true) {
          if (bookmark.redirectUrl) {
            redirectCount++;
          } else {
            healthyCount++;
          }
        } else {
          brokenCount++;
        }
      });
    });
    
    // Save updated pathways
    await chrome.storage.local.set({ pathways });
    
    // Determine appropriate status color based on results
    let statusColor = 'bg-success';
    if (brokenCount > 0) {
      statusColor = 'bg-danger'; // Red for broken links
    } else if (redirectCount > 0 || authRequiredCount > 0) {
      statusColor = 'bg-warning text-dark'; // Yellow for redirects/auth issues but no broken links
    }
    
    // Show detailed results in status message
    statusDiv.className = `position-fixed top-0 start-0 end-0 ${statusColor} p-3 text-center`;
    let resultMessage = `Completed! Checked ${linksChecked} links.`;
    
    // Add detailed summary of results
    resultMessage += ` Found: ${healthyCount} good link${healthyCount !== 1 ? 's' : ''}`;
    
    if (brokenCount > 0) {
      resultMessage += `, <strong>${brokenCount} broken link${brokenCount !== 1 ? 's' : ''}</strong>`;
    }
    
    if (redirectCount > 0) {
      resultMessage += `, ${redirectCount} redirect${redirectCount !== 1 ? 's' : ''}`;
    }
    
    if (authRequiredCount > 0) {
      resultMessage += `, ${authRequiredCount} requiring authentication`;
    }
    
    statusDiv.innerHTML = resultMessage;
    
    // Reload data and restore which steps were open
    loadPathwayData(openStates);
    
    // Determine how long to show the message based on results
    const displayDuration = (brokenCount > 0 || redirectCount > 0 || authRequiredCount > 0) ? 
      6000 : // Show issues for 6 seconds
      3000;  // Show success for 3 seconds
    
    // Remove status after the determined delay
    setTimeout(() => {
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }, displayDuration);
  } catch (error) {
    console.error('Error auditing links:', error);
    
    // Show error status
    statusDiv.className = 'position-fixed top-0 start-0 end-0 bg-danger text-white p-3 text-center';
    statusDiv.innerHTML = `Error checking links: ${error.message}`;
    
    // Remove status after a delay
    setTimeout(() => {
      if (document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
    }, 5000);
  }
}

// Event delegation for all actions
function handleActionClick(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.dataset.action;
  const stepIndex = button.dataset.step !== undefined ? parseInt(button.dataset.step, 10) : null;
  const bookmarkIndex = button.dataset.bookmark !== undefined ? parseInt(button.dataset.bookmark, 10) : null;
  
  switch(action) {
    case 'edit-step':
      editStep(stepIndex);
      break;
    case 'delete-step':
      deleteStep(stepIndex);
      break;
    case 'add-bookmark':
      addBookmark(stepIndex);
      break;
    case 'edit-bookmark':
      editBookmark(stepIndex, bookmarkIndex);
      break;
    case 'delete-bookmark':
      deleteBookmark(stepIndex, bookmarkIndex);
      break;
    case 'export-step':
      // For the main export button, default to JSON export
      exportStepAsJson(stepIndex);
      break;
    case 'export-step-html':
      exportStepAsHtml(stepIndex);
      break;
    case 'export-step-csv':
      exportStepAsCsv(stepIndex);
      break;
    case 'export-step-json':
      exportStepAsJson(stepIndex);
      break;
  }
}

// Publish a pathway to GitHub in all formats (HTML, CSV, JSON)
async function publishPathwayToGitHub() {
  const pathwayId = getPathwayId();
  const pathwayIndex = getPathwayIndex();
  
  // Create a status element for user feedback
  let statusEl = null;
  
  // Function to show status messages to the user
  const showStatus = (message, type = 'info') => {
    // Create status element if it doesn't exist
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.style.zIndex = '9999';
      statusEl.style.transition = 'all 0.3s ease';
      document.body.appendChild(statusEl);
    }
    
    // Set color based on status type
    let bgColor = 'bg-dark';
    if (type === 'success') bgColor = 'bg-success';
    if (type === 'error') bgColor = 'bg-danger';
    if (type === 'warning') bgColor = 'bg-warning text-dark';
    
    // Update status message
    statusEl.className = `position-fixed top-0 start-0 end-0 ${bgColor} text-white p-3 text-center`;
    statusEl.innerHTML = message;
    
    // For success or error messages, set a timeout to remove the status
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (statusEl && document.body.contains(statusEl)) {
          document.body.removeChild(statusEl);
          statusEl = null;
        }
      }, 5000); // Show for 5 seconds for better visibility
    }
  };
  
  try {
    // Import the GitHub API module
    const GitHubModule = await import('./github-api.js');
    const GitHub = GitHubModule;
    
    // Check if authenticated and configured
    const isAuthenticated = await GitHub.isAuthenticated();
    if (!isAuthenticated) {
      const connectNow = confirm('You need to connect to GitHub first. Go to GitHub Settings now?');
      if (connectNow) {
        window.location.href = 'github-settings.html';
      }
      return;
    }
    
    // Get GitHub configuration
    const config = await GitHub.getGitHubConfig();
    if (!config.repository) {
      const configureNow = confirm('You need to select a repository first. Go to GitHub Settings now?');
      if (configureNow) {
        window.location.href = 'github-settings.html';
      }
      return;
    }
    
    // Get the pathway data
    chrome.storage.local.get({pathways: []}, async ({pathways}) => {
      try {
        const pathway = pathways[pathwayIndex];
        if (!pathway) {
          alert('Pathway not found.');
          return;
        }
        
        // Sanitize pathway name for filenames
        const pathwayName = pathway.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
        
        // Ask for commit message
        const defaultMessage = `Publish pathway: ${pathway.name}`;
        const commitMessage = prompt('Enter a commit message:', defaultMessage);
        if (!commitMessage) return; // Cancelled
        
        // Show status
        showStatus(`Publishing "${pathway.name}" to GitHub...`);
        
        // Import the export utilities
        const ExportModule = await import('./export-utils.js');
        
        // Generate all three formats
        
        // 1. JSON Format
        const pathwayWithSortOrder = JSON.parse(JSON.stringify(pathway));
        if (pathwayWithSortOrder.steps) {
          pathwayWithSortOrder.steps.forEach(step => {
            if (step.bookmarks) {
              step.bookmarks.forEach((bookmark, index) => {
                bookmark.sortOrder = index;
              });
            }
          });
        }
        const jsonContent = JSON.stringify([pathwayWithSortOrder], null, 2);
        
        // 2. HTML Format - Use the export utility function
        // Add creator info if not already present
        const pathwayForHTML = JSON.parse(JSON.stringify(pathway));
        if (!pathwayForHTML.createdBy) {
          pathwayForHTML.createdBy = await ExportModule.getGitHubUsername();
        }
        const html = await ExportModule.generateHTML(pathwayForHTML);

        // 3. CSV Format - Use the export utility function
        // Make sure pathway has createdBy field
        const pathwayForCSV = JSON.parse(JSON.stringify(pathway));
        if (!pathwayForCSV.createdBy) {
          pathwayForCSV.createdBy = await ExportModule.getGitHubUsername();
        }
        const csv = await ExportModule.generateCSV(pathwayForCSV);
        
        // Create folder path based on pathway name
        const folderPath = `pathways/${pathwayName}`;
        
        // Commit all three files in a single commit
        showStatus(`Committing files to ${folderPath}...`);
        
        try {
          // JSON file
          const jsonResult = await GitHub.commitFile(
            jsonContent, 
            commitMessage,
            `${folderPath}/${pathwayName}.json`
          );
          
          // HTML file
          const htmlResult = await GitHub.commitFile(
            html,
            commitMessage,
            `${folderPath}/${pathwayName}.html`
          );
          
          // CSV file
          const csvResult = await GitHub.commitFile(
            csv,
            commitMessage,
            `${folderPath}/${pathwayName}.csv`
          );
          
          // Show success message
          const repoUrl = `https://github.com/${config.username}/${config.repository}/tree/main/${folderPath}`;
          showStatus(
            `Successfully published pathway to GitHub!<br>` +
            `<small><a href="${repoUrl}" target="_blank" class="text-white">View in GitHub Repository</a></small>`,
            'success'
          );
        } catch (error) {
          console.error('Failed to publish pathway to GitHub:', error);
          
          let errorMessage = error.message;
          
          // Check for common error types
          if (error.message.includes('401')) {
            errorMessage = 'Authentication error. Your GitHub token may have expired. Please reconnect in GitHub Settings.';
          } else if (error.message.includes('403')) {
            errorMessage = 'Permission denied. Make sure your token has the "repo" scope.';
          } else if (error.message.includes('404')) {
            errorMessage = 'Repository not found. Check your repository settings.';
          } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage = 'Network error. Check your internet connection and try again.';
          }
          
          showStatus(`Failed to publish pathway: ${errorMessage}`, 'error');
        }
      } catch (error) {
        console.error('Error preparing pathway for publishing:', error);
        showStatus(`Error preparing pathway data: ${error.message}`, 'error');
      }
    });
  } catch (error) {
    console.error('Error loading GitHub module:', error);
    alert('Failed to load GitHub integration: ' + error.message);
  }
}

// Expand all steps
function expandAllSteps() {
  const details = $$('#stepsList details');
  details.forEach(detail => {
    detail.setAttribute('open', '');
  });
  // Save the open state
  return saveOpenState();
}

// Collapse all steps
function collapseAllSteps() {
  const details = $$('#stepsList details');
  details.forEach(detail => {
    detail.removeAttribute('open');
  });
  // Save the open state
  return saveOpenState();
}

// Search pathway for matching bookmarks
function searchPathway() {
  const searchTerm = $('#searchInput').value.toLowerCase().trim();
  
  // If search is empty, reset view and collapse all
  if (!searchTerm) {
    resetSearch();
    return;
  }
  
  // Clear any previous search styling
  resetSearchStyling();
  
  // Expand all steps for the search
  expandAllSteps();
  
  // Hide all pause and reflect sections during search (if they exist)
  $$('[class*="pause-reflect"]').forEach(section => {
    section.style.display = 'none';
  });
  
  // Get all list items that contain bookmarks
  const bookmarkItems = $$('#stepsList .list-group-item');
  let matchFound = false;
  let matchCount = 0;
  
  // Track which details elements have matches
  const detailsWithMatches = new Set();
  
  // Loop through all bookmarks to find matches
  bookmarkItems.forEach(item => {
    // Get the searchable content from this bookmark
    const titleElement = item.querySelector('a');
    const title = titleElement ? titleElement.textContent.toLowerCase() : '';
    const descElement = item.querySelector('.text-body-secondary');
    const description = descElement ? descElement.textContent.toLowerCase() : '';
    const contextElement = item.querySelector('.fst-italic');
    const context = contextElement ? contextElement.textContent.toLowerCase() : '';
    
    // Check if any of the content contains the search term
    const hasMatch = title.includes(searchTerm) || 
                    description.includes(searchTerm) || 
                    context.includes(searchTerm);
    
    // Show or hide based on match
    if (hasMatch) {
      // Remember to keep this bookmark visible
      item.setAttribute('data-search-match', 'true');
      matchFound = true;
      matchCount++;
      
      // Make sure the parent details element is open
      const parentDetails = item.closest('details');
      if (parentDetails) {
        parentDetails.setAttribute('open', '');
        // Add to our set of details elements that have matches
        detailsWithMatches.add(parentDetails);
      }
      
      // Add accessibility attributes for screen readers
      item.setAttribute('data-search-result', 'true');
      item.setAttribute('aria-label', `Search result ${matchCount} for "${searchTerm}"`);
      
      // Highlight the matching text
      highlightMatches(item, searchTerm);
    }
  });
  
  // Now hide all bookmarks that don't match - use important to force override any styles
  bookmarkItems.forEach(item => {
    if (!item.hasAttribute('data-search-match')) {
      // Use !important inline style to ensure it overrides any other style
      item.style.cssText = 'display: none !important;';
      // Add a class for better debugging
      item.classList.add('search-hidden');
    } else {
      // Make sure matching items are visible
      item.style.cssText = 'display: flex !important;';
    }
  });
  
  // Hide steps that have no matches
  $$('#stepsList details').forEach(details => {
    if (!detailsWithMatches.has(details)) {
      details.style.display = 'none';
    }
  });
  
  // Check each list-group and hide empty ones
  $$('#stepsList .list-group').forEach(listGroup => {
    const matchingItems = listGroup.querySelectorAll('.list-group-item[data-search-match]');
    
    // If no matching items, hide the heading and the entire list-group
    if (matchingItems.length === 0) {
      // Find the previous heading and hide it
      const heading = listGroup.previousElementSibling;
      if (heading && heading.tagName === 'H6') {
        heading.style.display = 'none';
      }
      listGroup.style.display = 'none';
    }
  });
  
  // Show message if no results found
  const searchResultsMessage = $('#searchResultsMessage');
  if (searchResultsMessage) {
    if (!matchFound) {
      searchResultsMessage.textContent = 'No matching bookmarks found.';
    } else {
      searchResultsMessage.textContent = `Found ${matchCount} matching bookmark${matchCount !== 1 ? 's' : ''}.`;
    }
  }
  
  // Focus on the first result if found
  if (matchFound) {
    const firstResult = $('.list-group-item[data-search-match="true"]');
    if (firstResult) {
      // Add a tabindex to make it focusable
      firstResult.tabIndex = -1;
      // Scroll to the first result and focus it
      firstResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => firstResult.focus(), 300);
    }
  }
  
  // Show reset button
  $('#resetSearchButton').classList.remove('d-none');
}

// Clear any styling or attributes from previous searches
function resetSearchStyling() {
  // Clear highlights
  $$('.search-highlight').forEach(el => {
    el.classList.remove('search-highlight');
  });
  
  // Remove search-hidden class from any elements
  $$('.search-hidden').forEach(el => {
    el.classList.remove('search-hidden');
  });
  
  // Clear all search attributes
  $$('[data-search-match]').forEach(el => {
    el.removeAttribute('data-search-match');
  });
  
  $$('[data-search-result]').forEach(el => {
    el.removeAttribute('data-search-result');
    el.removeAttribute('aria-label');
    el.removeAttribute('tabindex');
  });
}

// Highlight matching text in elements
function highlightMatches(element, searchTerm) {
  // Elements to check for matches
  const titles = element.querySelectorAll('a');
  const descriptions = element.querySelectorAll('.text-body-secondary');
  const contexts = element.querySelectorAll('.fst-italic');
  
  // Add highlight class to elements containing the search term
  [titles, descriptions, contexts].forEach(nodeList => {
    if (!nodeList) return;
    
    nodeList.forEach(node => {
      if (node && node.textContent.toLowerCase().includes(searchTerm)) {
        node.classList.add('search-highlight');
      } else if (node) {
        node.classList.remove('search-highlight');
      }
    });
  });
}

// Reset search state
function resetSearch() {
  // Clear search styling and attributes
  resetSearchStyling();
  
  // Show all bookmarks and completely remove inline styles
  $$('#stepsList .list-group-item').forEach(item => {
    // Remove inline styles completely to get rid of !important flags
    item.removeAttribute('style');
    // Remove search-hidden class if present
    item.classList.remove('search-hidden');
  });
  
  // Restore visibility of steps - completely remove inline styles
  $$('#stepsList details').forEach(details => {
    details.removeAttribute('style');
  });
  
  // Restore visibility of list groups and headings
  $$('#stepsList .list-group').forEach(listGroup => {
    listGroup.removeAttribute('style');
    
    // Restore visibility of headings
    const heading = listGroup.previousElementSibling;
    if (heading && heading.tagName === 'H6') {
      heading.removeAttribute('style');
    }
  });
  
  // Restore visibility of pause and reflect sections
  $$('[class*="pause-reflect"]').forEach(section => {
    section.removeAttribute('style');
  });
  
  // Clear any result message
  const searchResultsMessage = $('#searchResultsMessage');
  if (searchResultsMessage) {
    searchResultsMessage.textContent = '';
  }
  
  // Hide reset button
  $('#resetSearchButton').classList.add('d-none');
  
  // If search was cleared, collapse steps
  if ($('#searchInput').value.trim() === '') {
    collapseAllSteps();
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme based on preference
  setTheme(getPreferredTheme());
  
  // Add theme toggle handler
  $('#theme-toggle').addEventListener('click', toggleTheme);
  
  loadPathwayData();
  
  // Set up event listeners
  $('#editPathway').addEventListener('click', editPathway);
  $('#addStep').addEventListener('click', addStep);
  $('#exportHtml').addEventListener('click', exportAsHtml);
  $('#exportCsv').addEventListener('click', exportAsCsv);
  $('#exportJson').addEventListener('click', exportAsJson);
  $('#commitToGithub').addEventListener('click', publishPathwayToGitHub);
  $('#auditLinks').addEventListener('click', auditPathwayLinks);
  
  // Add expand/collapse all steps handlers
  $('#expandAllSteps').addEventListener('click', expandAllSteps);
  $('#collapseAllSteps').addEventListener('click', collapseAllSteps);
  
  // Set up search functionality
  const searchInput = $('#searchInput');
  const resetButton = $('#resetSearchButton');
  
  // Search on enter key press
  searchInput.addEventListener('keyup', event => {
    if (event.key === 'Enter') {
      searchPathway();
    }
  });
  
  // Handle reset button visibility on input changes
  searchInput.addEventListener('input', function() {
    // Show/hide reset button based on input value
    if (this.value.trim() === '') {
      resetButton.classList.add('d-none');
      // Auto reset search if search is cleared
      resetSearch();
    } else {
      resetButton.classList.remove('d-none');
    }
  });
  
  // Add search button handler
  $('#searchButton').addEventListener('click', searchPathway);
  
  // Add reset button handler
  resetButton.addEventListener('click', function() {
    // Clear the search input
    searchInput.value = '';
    // Reset the search
    resetSearch();
    // Hide the reset button
    this.classList.add('d-none');
    // Return focus to search input
    searchInput.focus();
  });
  
  // Event delegation for step and bookmark actions
  document.addEventListener('click', handleActionClick);
});