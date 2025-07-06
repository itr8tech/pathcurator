// Sortable loaded globally via UMD script
const SortableGlobal = window.Sortable;

const $ = s=>document.querySelector(s);
// Safer escape function that handles undefined/null values
const esc = s=>{
  // If s is null, undefined, or not a string, convert to empty string
  const str = (s == null || typeof s !== 'string') ? '' : s;
  return str.replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c]));
};

// safe markdown with HTML escaping first to prevent XSS
function md(t=''){
  // Make sure t is a string
  if (t == null || typeof t !== 'string') t = '';

  // Early return for empty strings
  if(!t.trim()) return '';

  // SECURITY: Escape HTML first to prevent XSS
  let h = esc(t);
  
  // Process markdown on the escaped text
  h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
       .replace(/\*(.+?)\*/g,'<em>$1</em>');

  // Split and format paragraphs
  return h.split(/\n+/).map(l =>
    /^[*-]\s+/.test(l) ? '<li>'+l.slice(2)+'</li>' : '<p>'+l+'</p>'
  ).join('');
}

// Import version utils
import { updatePathwayVersion, formatVersion, formatTimestamp } from './version-utils.js';

// Save helper with version update (now async)
const save = async (pathways, cb) => {
  try {
    // Add/update version info for each pathway (now async)
    const updatedPathwaysPromises = pathways.map(pathway => updatePathwayVersion(pathway));
    const updatedPathways = await Promise.all(updatedPathwaysPromises);

    // Save to storage
    chrome.storage.local.set({pathways: updatedPathways}, cb);
  } catch (error) {
    console.error('Error updating pathway versions:', error);
    // Fall back to direct save if version updating fails
    chrome.storage.local.set({pathways}, cb);
  }
};

// Enhanced reorder function with error handling
const reorder = (arr, order) => {
  // Make sure arr is an array
  if (!Array.isArray(arr)) {
    console.error('Reorder error: First parameter is not an array', arr);
    return [];
  }

  // Make sure order is an array
  if (!Array.isArray(order)) {
    console.error('Reorder error: Order parameter is not an array', order);
    return [...arr]; // Return a copy of the original array
  }

  // Apply reordering with error handling
  try {
    return order.map(i => {
      // Make sure index is valid
      if (i < 0 || i >= arr.length) {
        console.warn(`Reorder warning: Index ${i} out of bounds for array of length ${arr.length}`);
        return null;
      }
      return arr[i];
    }).filter(Boolean); // Remove null items
  } catch (error) {
    console.error('Error during reordering:', error);
    return [...arr]; // Return a copy of the original array on error
  }
};

// persist helpers (now async) with better error handling
const persistPaths = ord => chrome.storage.local.get({pathways:[]}, async d => {
  try {
    // Make sure we have valid data
    if (!d || !Array.isArray(d.pathways)) {
      console.error('Invalid pathways data for reordering:', d);
      return;
    }

    const reordered = reorder(d.pathways, ord);
    await save(reordered, render);
  } catch (error) {
    console.error('Error persisting paths:', error);
    render(); // Refresh the UI anyway
  }
});

const persistSteps = (pIdx, ord) => chrome.storage.local.get({pathways:[]}, async d => {
  try {
    // Validate pathway index
    if (!d.pathways || !d.pathways[pIdx]) {
      console.error(`Invalid pathway index: ${pIdx}`);
      return;
    }

    // Validate steps array
    if (!Array.isArray(d.pathways[pIdx].steps)) {
      d.pathways[pIdx].steps = [];
    }

    // Reorder steps
    d.pathways[pIdx].steps = reorder(d.pathways[pIdx].steps, ord);
    await save(d.pathways, render);
  } catch (error) {
    console.error('Error persisting steps:', error);
    render(); // Refresh the UI anyway
  }
});

const persistBms = (pIdx, sIdx, ord) => chrome.storage.local.get({pathways:[]}, async d => {
  try {
    // Validate pathway and step indices
    if (!d.pathways || !d.pathways[pIdx] || !d.pathways[pIdx].steps || !d.pathways[pIdx].steps[sIdx]) {
      console.error(`Invalid pathway or step index: pathway=${pIdx}, step=${sIdx}`);
      return;
    }

    // Validate bookmarks array
    if (!Array.isArray(d.pathways[pIdx].steps[sIdx].bookmarks)) {
      d.pathways[pIdx].steps[sIdx].bookmarks = [];
    }

    // Reorder bookmarks
    d.pathways[pIdx].steps[sIdx].bookmarks = reorder(d.pathways[pIdx].steps[sIdx].bookmarks, ord);
    await save(d.pathways, render);
  } catch (error) {
    console.error('Error persisting bookmarks:', error);
    render(); // Refresh the UI anyway
  }
});

const dragP='<i class="bi bi-list drag-handle me-2"></i>';
const dragS='<i class="bi bi-list drag-handle-step me-1"></i>';
const dragB='<i class="bi bi-list drag-handle-bm me-2"></i>';

const bmHTML = (b, pIdx, sIdx, i) => {
  const isBonus = b.type === 'bonus' || b.type === 'Bonus';
  const badgeClass = isBonus ? 'text-bg-info' : 'text-bg-primary';
  const badgeText = isBonus ? 'BONUS' : 'REQUIRED';
  
  return `
  <li class="list-group-item d-flex align-items-start" 
      data-bm="${i}" data-idx="${pIdx}" data-step="${sIdx}" data-type="${b.type || 'Required'}">
    ${dragB}
    <div class="flex-grow-1">
      <div class="d-flex align-items-center">
        <a href="${b.url}" target="_blank" class="fw-semibold">${esc(b.title)}</a>
        <span class="badge ${badgeClass} ms-2">${badgeText}</span>
      </div>
      <p class="small text-body-secondary mb-1">${esc(b.description)}</p>
      <p class="fst-italic small mb-0">${esc(b.context)}</p>
    </div>
    <div class="btn-group ms-2">
      <button data-act="edit-bm" data-idx="${pIdx}" data-step="${sIdx}" data-bm="${i}" 
              class="btn btn-sm btn-outline-secondary">
        <i class="bi bi-pencil-square"></i>
      </button>
      <button data-act="delete-bm" data-idx="${pIdx}" data-step="${sIdx}" data-bm="${i}" 
              class="btn btn-sm btn-outline-danger">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  </li>`;
};

function stepHTML(s,pIdx,sIdx){
  const bm=s.bookmarks||[];
  const required = bm.filter(b => !b.type || b.type === 'required' || b.type === 'Required');
  const bonus = bm.filter(b => b.type === 'bonus' || b.type === 'Bonus');
  
  // Create badge counters
  const reqBadge = required.length > 0 ? 
    `<span class="badge text-bg-primary ms-1">${required.length}</span>` : '';
  const bonusBadge = bonus.length > 0 ? 
    `<span class="badge text-bg-info ms-1">${bonus.length}</span>` : '';
  
  return `<div class="ms-3 mb-2 p-2 border-start border-light">
    <div class="d-flex align-items-center">
      <span>${esc(s.name)} ${reqBadge} ${bonusBadge}</span>
    </div>
  </div>`;
}
function pathHTML(p,idx){
  const desc=p.description?`<div class="small mb-2">${md(p.description)}</div>`:'';
  const bookmarkCount = p.steps?.reduce((total, step) =>
    total + (step.bookmarks?.length || 0), 0) || 0;

  // Format version info for display - escape user-controlled content
  const versionDisplay = p.version ? esc(formatVersion(p.version)) : 'No version';
  const updatedDisplay = p.lastUpdated ? `Updated: ${esc(formatTimestamp(p.lastUpdated))}` : '';
  const creatorDisplay = p.createdBy ? `Created by: ${esc(p.createdBy)}` : '';
  const modifierDisplay = p.modifiedBy && p.modifiedBy !== p.createdBy ? `Modified by: ${esc(p.modifiedBy)}` : '';

  return `<li data-path="${idx}" class="mb-2">
    <div class="card">
      <div class="card-header d-flex align-items-center bg-body-tertiary p-2">${dragP}
        <a href="pathway-detail.html?id=${idx}" class="fw-semibold text-decoration-none pathway-link flex-grow-1">
          ${esc(p.name)}
        </a>
        <div class="text-muted me-2 small">
          <span class="badge bg-secondary">${p.steps?.length || 0} steps</span>
          <span class="badge bg-secondary">${bookmarkCount} bookmarks</span>
        </div>
        <span class="btn-group">
          <button data-act="view-detail" data-idx="${idx}" class="btn btn-sm btn-outline-primary me-1">
            <i class="bi bi-arrow-right-circle"></i> Open
          </button>
          <button data-act="edit-path" data-idx="${idx}" class="btn btn-sm btn-outline-secondary me-1">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button data-act="delete-path" data-idx="${idx}" class="btn btn-sm btn-outline-danger">
            <i class="bi bi-trash"></i>
          </button>
        </span>
      </div>
      <div class="card-body">
        ${desc}
        <div class="d-flex flex-wrap align-items-center mb-3 text-muted small">
          <div class="me-3">
            <i class="bi bi-code-slash me-1"></i> Version: <span class="fw-semibold ms-1">${versionDisplay}</span>
          </div>
          ${updatedDisplay ? `<div class="me-3">${updatedDisplay}</div>` : ''}
          ${creatorDisplay ? `<div class="me-3"><i class="bi bi-person-circle me-1"></i>${creatorDisplay}</div>` : ''}
          ${modifierDisplay ? `<div><i class="bi bi-pencil me-1"></i>${modifierDisplay}</div>` : ''}
        </div>
      </div>
    </div>
  </li>`;
}

// initialise Sortable
function initSort(){
  // Only enable sorting for pathway list as step details
  // are now managed in the pathway detail page
  new SortableGlobal($('#pathwayList'),{handle:'.drag-handle',animation:150,onEnd:()=>{
    const ord=[...$('#pathwayList').children].map(li=>+li.dataset.path);
    persistPaths(ord);
  }});
}

// render dashboard
async function render(){
  console.log('Dashboard render() called');
  chrome.storage.local.get({pathways:[]}, async d => {
    try {
      // Make sure pathways is always an array
      const pathways = Array.isArray(d.pathways) ? d.pathways : [];
      console.log('Dashboard loaded pathways:', pathways.length, 'pathways');
      
      // Debug: Log bookmark counts for each step
      pathways.forEach((pathway, pIdx) => {
        console.log(`Pathway ${pIdx} (${pathway.name}):`, pathway.steps?.length || 0, 'steps');
        pathway.steps?.forEach((step, sIdx) => {
          console.log(`  Step ${sIdx} (${step.name}):`, step.bookmarks?.length || 0, 'bookmarks');
          // Log actual bookmark titles to verify content
          if (step.bookmarks && step.bookmarks.length > 0) {
            step.bookmarks.forEach((bookmark, bIdx) => {
              console.log(`    Bookmark ${bIdx}: "${bookmark.title}" (required: ${bookmark.required}, type: ${bookmark.type})`);
            });
          }
        });
      });

      // Only process pathways for version updates if they're missing critical version info
      // This prevents stripping audit data on every render
      let needsVersionUpdate = false;
      const updatedPathways = pathways.map(pathway => {
        try {
          // Make sure the pathway is a valid object
          if (!pathway || typeof pathway !== 'object') {
            console.error('Invalid pathway object:', pathway);
            return pathway || {}; // Return original or empty object if null/undefined
          }

          // Check if pathway is missing essential version info
          if (!pathway.version || !pathway.lastUpdated) {
            needsVersionUpdate = true;
            console.log('Pathway missing version info, will update:', pathway.name);
          }
          
          return pathway; // Return unchanged to preserve audit data
        } catch (pathwayError) {
          console.error('Error checking pathway:', pathwayError);
          return pathway || {}; // Fall back to original or empty object
        }
      });

      if (needsVersionUpdate) {
        console.log('Some pathways need version updates, processing...');
        // Only update the ones that actually need it
        const versionUpdatePromises = updatedPathways.map(async pathway => {
          if (!pathway.version || !pathway.lastUpdated) {
            return await updatePathwayVersion(pathway);
          }
          return pathway; // Return unchanged
        });
        
        const finalPathways = await Promise.all(versionUpdatePromises);
        
        try {
          chrome.storage.local.set({pathways: finalPathways}, () => {
            renderPathways(finalPathways);
          });
        } catch (storageError) {
          console.error('Error saving updated pathways:', storageError);
          renderPathways(finalPathways);
        }
      } else {
        // No version updates needed, render as-is (preserves audit data)
        console.log('No version updates needed, preserving all data including audit results');
        renderPathways(updatedPathways);
      }
    } catch (error) {
      console.error('Error updating pathways in render:', error);
      // If updating fails, just render the existing pathways
      renderPathways(Array.isArray(d.pathways) ? d.pathways : []);
    }
  });
}

// Separate function to render the pathways list
function renderPathways(pathways) {
  try {
    // Make sure pathways is always an array
    const validPathways = Array.isArray(pathways) ? pathways : [];

    // Initialize bookmarklet links
    initializeBookmarklet();

    // Show/hide empty state and bookmarklet section
    if (validPathways.length === 0) {
      $('#emptyState').classList.remove('d-none');
      $('#pathwayList').classList.add('d-none');
      $('#bookmarkletSection').classList.add('d-none');
    } else {
      $('#emptyState').classList.add('d-none');
      $('#pathwayList').classList.remove('d-none');
      
      // Show bookmarklet section if user hasn't hidden it
      const bookmarkletHidden = localStorage.getItem('bookmarkletHidden') === 'true';
      if (!bookmarkletHidden) {
        $('#bookmarkletSection').classList.remove('d-none');
      }

      // Use try-catch for each pathway HTML generation
      try {
        $('#pathwayList').innerHTML = validPathways.map((pathway, idx) => {
          try {
            return pathHTML(pathway, idx);
          } catch (htmlError) {
            console.error('Error rendering pathway HTML:', htmlError, pathway);
            return ''; // Skip this pathway if it can't be rendered
          }
        }).join('');

        initSort();
      } catch (renderError) {
        console.error('Error during pathways rendering:', renderError);
        // Fallback to empty state on render failure
        $('#emptyState').classList.remove('d-none');
        $('#pathwayList').classList.add('d-none');
      }
    }
  } catch (error) {
    console.error('Error in renderPathways:', error);
    // Fallback to empty state
    $('#emptyState').classList.remove('d-none');
    $('#pathwayList').classList.add('d-none');
  }
}

// Import/Export functions
async function exportAllData() {
  try {
    // Get GitHub username for creator attribution
    const { getGitHubUsername } = await import('./export-utils.js');
    const githubUsername = await getGitHubUsername();

    chrome.storage.local.get({pathways:[]}, data => {
      // Create a deep copy of pathways
      const pathwaysWithSortOrder = JSON.parse(JSON.stringify(data.pathways));

      // Add creator info and sort order to each pathway
      pathwaysWithSortOrder.forEach(pathway => {
        // Add creator info if not already present
        if (!pathway.createdBy) {
          pathway.createdBy = githubUsername;
        }

        // Add sort order to each bookmark
        if (pathway.steps) {
          pathway.steps.forEach(step => {
            if (step.bookmarks) {
              step.bookmarks.forEach((bookmark, index) => {
                bookmark.sortOrder = index;
              });
            }
          });
        }
      });

      const json = JSON.stringify(pathwaysWithSortOrder, null, 2);
      const blob = new Blob([json], {type: 'application/json'});
      const url = URL.createObjectURL(blob);

      // Create a timestamp for the filename
      const date = new Date();
      const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      // Trigger download
      chrome.downloads.download({
        url: url,
        filename: `curator-backup-${timestamp}.json`,
        saveAs: true
      });
    });
  } catch (error) {
    console.error('Error exporting all data:', error);
    // Fall back to original export without creator info
    chrome.storage.local.get({pathways:[]}, data => {
      // Create a deep copy of pathways
      const pathwaysWithSortOrder = JSON.parse(JSON.stringify(data.pathways));

      // Add sort order to each bookmark in each pathway's steps
      pathwaysWithSortOrder.forEach(pathway => {
        if (pathway.steps) {
          pathway.steps.forEach(step => {
            if (step.bookmarks) {
              step.bookmarks.forEach((bookmark, index) => {
                bookmark.sortOrder = index;
              });
            }
          });
        }
      });

      const json = JSON.stringify(pathwaysWithSortOrder, null, 2);
      const blob = new Blob([json], {type: 'application/json'});
      const url = URL.createObjectURL(blob);

      // Create a timestamp for the filename
      const date = new Date();
      const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      // Trigger download
      chrome.downloads.download({
        url: url,
        filename: `curator-backup-${timestamp}.json`,
        saveAs: true
      });
    });
  }
}

async function exportSinglePathway(idx) {
  try {
    // Get GitHub username for creator attribution
    const { getGitHubUsername } = await import('./export-utils.js');
    const githubUsername = await getGitHubUsername();

    chrome.storage.local.get({pathways:[]}, data => {
      const pathway = data.pathways[idx];
      if (!pathway) return;

      // Create a copy of the pathway with added sort orders
      const pathwayWithSortOrder = JSON.parse(JSON.stringify(pathway));

      // Add creator info if not already present
      if (!pathwayWithSortOrder.createdBy) {
        pathwayWithSortOrder.createdBy = githubUsername;
      }

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
  } catch (error) {
    console.error('Error exporting pathway:', error);
    // Fall back to original export without creator info
    chrome.storage.local.get({pathways:[]}, data => {
      const pathway = data.pathways[idx];
      if (!pathway) return;

      // Create a copy of the pathway
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

      const json = JSON.stringify([pathwayWithSortOrder], null, 2);
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
}

function importData(file) {
  const reader = new FileReader();
  
  reader.onload = event => {
    try {
      const pathways = JSON.parse(event.target.result);
      
      // Validate that it's an array
      if (!Array.isArray(pathways)) {
        alert('Invalid backup file format. Expected an array of pathways.');
        return;
      }
      
      // First get current data to see what we're replacing
      chrome.storage.local.get({pathways: []}, currentData => {
        const currentCount = currentData.pathways.length;
        
        // Check for duplicate pathway names
        const duplicatePathways = [];
        const newPathways = [];
        
        pathways.forEach(importPathway => {
          const existingPathwayIndex = currentData.pathways.findIndex(p => p.name === importPathway.name);
          if (existingPathwayIndex >= 0) {
            duplicatePathways.push({
              existingIndex: existingPathwayIndex,
              existing: currentData.pathways[existingPathwayIndex],
              imported: importPathway
            });
          } else {
            newPathways.push(importPathway);
          }
        });
        
        if (duplicatePathways.length > 0) {
          // We have duplicates - show diff UI
          showPathwayDiff(duplicatePathways, newPathways, currentData.pathways);
        } else {
          // No duplicates - proceed with normal import
          proceedWithImport(pathways, currentData.pathways, currentCount);
        }
      });
    } catch (error) {
      alert(`Error importing data: ${error.message}`);
    }
  };
  
  reader.readAsText(file);
}

// Function to show diff UI for duplicate pathways
function showPathwayDiff(duplicatePathways, newPathways, existingPathways) {
  // Create modal for diff UI
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.id = 'diffModal';
  modal.setAttribute('tabindex', '-1');
  modal.setAttribute('aria-labelledby', 'diffModalLabel');
  modal.setAttribute('aria-hidden', 'true');
  
  const modalContent = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="diffModalLabel">Pathway Import Conflicts</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info">
            <p><strong>Found ${duplicatePathways.length} pathway(s) with conflicting names.</strong></p>
            <p>Please review the differences and choose how to proceed for each pathway.</p>
          </div>
          <div id="diffContent">
            ${duplicatePathways.map((dup, index) => createDiffView(dup, index)).join('<hr class="my-4">')}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel Import</button>
          <button type="button" class="btn btn-primary" id="completeImport">Complete Import</button>
        </div>
      </div>
    </div>
  `;
  
  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  
  // Store data for later use
  modal.dataset.duplicates = JSON.stringify(duplicatePathways);
  modal.dataset.newPathways = JSON.stringify(newPathways);
  modal.dataset.existingPathways = JSON.stringify(existingPathways);
  
  // Initialize and show the modal
  try {
    // Try to use Bootstrap modal if available
    const modalInstance = new bootstrap.Modal(modal);
    
    // Handle modal close/cancel
    modal.addEventListener('hidden.bs.modal', event => {
      // Remove modal from DOM when it's closed
      document.body.removeChild(modal);
    });
    
    // Handle completion
    document.getElementById('completeImport').addEventListener('click', () => {
      handleDiffCompletion(modal, modalInstance);
    });
    
    // Show the modal
    modalInstance.show();
  } catch (error) {
    console.error('Bootstrap Modal not available, using fallback:', error);
    
    // Fallback if Bootstrap is not loaded: simple custom modal
    modal.classList.add('d-block'); // Make it visible
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    document.body.classList.add('modal-open');
    
    // Custom close function
    const closeModal = () => {
      modal.classList.remove('d-block');
      document.body.classList.remove('modal-open');
      document.body.removeChild(modal);
    };
    
    // Add close handlers for custom modal implementation
    modal.querySelectorAll('[data-bs-dismiss="modal"]').forEach(el => {
      el.addEventListener('click', closeModal);
    });
    
    // Handle completion for custom modal
    document.getElementById('completeImport').addEventListener('click', () => {
      // Get all checked radio buttons to determine actions
      handleDiffCompletion(modal, { hide: closeModal });
    });
  }
  
  // Import only non-duplicate pathways if any, when canceling
  const cancelButton = modal.querySelector('button[data-bs-dismiss="modal"]');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      if (newPathways.length > 0) {
        setTimeout(() => {
          // Add a slight delay to ensure modal closing animation completes
          if (confirm(`Would you like to still import the ${newPathways.length} non-conflicting pathway(s)?`)) {
            // Import only new pathways
            chrome.storage.local.get({pathways: []}, data => {
              const updatedPathways = [...data.pathways, ...newPathways];
              chrome.storage.local.set({pathways: updatedPathways}, () => {
                alert(`Imported ${newPathways.length} non-conflicting pathway(s).`);
                render();
              });
            });
          }
        }, 300);
      }
    });
  }
}

// Create a diff view for a single pathway comparison
function createDiffView(dupInfo, index) {
  const { existing, imported } = dupInfo;
  
  // Format comparison date
  const formattedDate = new Date().toLocaleString();
  
  // Analyze differences
  const descriptionDiffers = existing.description !== imported.description;
  const stepsCountDiffers = (existing.steps?.length || 0) !== (imported.steps?.length || 0);
  
  // Find unique and common steps
  const existingSteps = existing.steps || [];
  const importedSteps = imported.steps || [];
  
  const existingStepNames = existingSteps.map(s => s.name);
  const importedStepNames = importedSteps.map(s => s.name);
  
  const uniqueToExisting = existingSteps.filter(s => !importedStepNames.includes(s.name));
  const uniqueToImported = importedSteps.filter(s => !existingStepNames.includes(s.name));
  const commonStepNames = existingStepNames.filter(name => importedStepNames.includes(name));
  
  // For common steps, check bookmark differences
  const commonStepDiffs = commonStepNames.map(stepName => {
    const existingStep = existingSteps.find(s => s.name === stepName);
    const importedStep = importedSteps.find(s => s.name === stepName);
    
    const existingBookmarks = existingStep.bookmarks || [];
    const importedBookmarks = importedStep.bookmarks || [];
    
    // Use URLs for comparison
    const existingUrls = existingBookmarks.map(b => b.url);
    const importedUrls = importedBookmarks.map(b => b.url);
    
    const uniqueToExistingBookmarks = existingBookmarks.filter(b => !importedUrls.includes(b.url));
    const uniqueToImportedBookmarks = importedBookmarks.filter(b => !existingUrls.includes(b.url));
    
    return {
      stepName,
      bookmarksDiffer: uniqueToExistingBookmarks.length > 0 || uniqueToImportedBookmarks.length > 0,
      uniqueToExisting: uniqueToExistingBookmarks,
      uniqueToImported: uniqueToImportedBookmarks
    };
  });
  
  // Calculate diff stats for display
  const hasStepDiffs = uniqueToExisting.length > 0 || uniqueToImported.length > 0;
  const hasBookmarkDiffs = commonStepDiffs.some(diff => diff.bookmarksDiffer);
  const hasDescriptionDiff = descriptionDiffers;
  
  return `
    <div class="diff-container" data-diff-index="${index}">
      <h4 class="mb-3">Pathway: ${esc(existing.name)}</h4>
      
      <div class="alert alert-warning mb-4">
        <p class="mb-1"><strong>Differences found:</strong></p>
        <ul class="mb-0">
          ${hasDescriptionDiff ? '<li>Descriptions are different</li>' : ''}
          ${stepsCountDiffers ? `<li>Step count differs (Existing: ${existingSteps.length}, Imported: ${importedSteps.length})</li>` : ''}
          ${hasStepDiffs ? `<li>${uniqueToExisting.length} steps only in existing, ${uniqueToImported.length} steps only in imported</li>` : ''}
          ${hasBookmarkDiffs ? '<li>Bookmarks differ in common steps</li>' : ''}
        </ul>
      </div>
      
      <div class="form-check mb-3">
        <input class="form-check-input pathway-action" type="radio" name="pathway-action-${index}" id="keep-existing-${index}" value="keep-existing" checked>
        <label class="form-check-label" for="keep-existing-${index}">
          <strong>Keep existing pathway</strong> (ignore imported version)
        </label>
      </div>
      
      <div class="form-check mb-3">
        <input class="form-check-input pathway-action" type="radio" name="pathway-action-${index}" id="use-imported-${index}" value="use-imported">
        <label class="form-check-label" for="use-imported-${index}">
          <strong>Replace with imported version</strong> (overwrite existing)
        </label>
      </div>
      
      <div class="form-check mb-3">
        <input class="form-check-input pathway-action" type="radio" name="pathway-action-${index}" id="merge-${index}" value="merge">
        <label class="form-check-label" for="merge-${index}">
          <strong>Smart merge</strong> (combine content from both versions)
        </label>
      </div>
      
      <div class="form-check mb-3">
        <input class="form-check-input pathway-action" type="radio" name="pathway-action-${index}" id="import-as-new-${index}" value="import-as-new">
        <label class="form-check-label" for="import-as-new-${index}">
          <strong>Import as new copy</strong> (will be named "${esc(existing.name)} - Imported ${formattedDate}")
        </label>
      </div>
      
      <div class="diff-details mt-4">
        <h5>Pathway Comparison</h5>
        
        <div class="row mb-4">
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header bg-body-tertiary d-flex align-items-center">
                <strong>Existing Pathway</strong>
                <span class="badge bg-secondary ms-2">${existing.steps?.length || 0} steps</span>
              </div>
              <div class="card-body">
                <dl class="row mb-0">
                  <dt class="col-sm-3">Description</dt>
                  <dd class="col-sm-9 ${descriptionDiffers ? 'diff-highlight' : ''}">${existing.description || '<em>None</em>'}</dd>
                  
                  <dt class="col-sm-3">Created</dt>
                  <dd class="col-sm-9">${existing.created ? new Date(existing.created).toLocaleString() : 'Unknown'}</dd>
                </dl>
              </div>
            </div>
          </div>
          
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header bg-body-tertiary d-flex align-items-center">
                <strong>Imported Pathway</strong>
                <span class="badge bg-secondary ms-2">${imported.steps?.length || 0} steps</span>
              </div>
              <div class="card-body">
                <dl class="row mb-0">
                  <dt class="col-sm-3">Description</dt>
                  <dd class="col-sm-9 ${descriptionDiffers ? 'diff-highlight' : ''}">${imported.description || '<em>None</em>'}</dd>
                  
                  <dt class="col-sm-3">Created</dt>
                  <dd class="col-sm-9">${imported.created ? new Date(imported.created).toLocaleString() : 'Unknown'}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Steps Comparison -->
        <h5 class="mt-4 mb-3">Steps Comparison</h5>
        
        ${uniqueToExisting.length > 0 ? `
          <div class="card mb-3">
            <div class="card-header bg-warning-subtle text-warning-emphasis">Steps Only in Existing Pathway</div>
            <ul class="list-group list-group-flush">
              ${uniqueToExisting.map(step => 
                `<li class="list-group-item">
                  <strong>${esc(step.name)}</strong>
                  <span class="badge bg-secondary ms-2">${step.bookmarks?.length || 0} bookmarks</span>
                </li>`
              ).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${uniqueToImported.length > 0 ? `
          <div class="card mb-3">
            <div class="card-header bg-success-subtle text-success-emphasis">Steps Only in Imported Pathway</div>
            <ul class="list-group list-group-flush">
              ${uniqueToImported.map(step => 
                `<li class="list-group-item">
                  <strong>${esc(step.name)}</strong>
                  <span class="badge bg-secondary ms-2">${step.bookmarks?.length || 0} bookmarks</span>
                </li>`
              ).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${commonStepNames.length > 0 ? `
          <div class="card mb-3">
            <div class="card-header bg-body-tertiary text-body">Common Steps</div>
            <ul class="list-group list-group-flush">
              ${commonStepNames.map(stepName => {
                const diff = commonStepDiffs.find(d => d.stepName === stepName);
                const existingStep = existingSteps.find(s => s.name === stepName);
                const importedStep = importedSteps.find(s => s.name === stepName);
                
                return `<li class="list-group-item ${diff.bookmarksDiffer ? 'diff-highlight' : ''}">
                  <strong>${esc(stepName)}</strong>
                  <div class="d-flex gap-3 mt-1">
                    <div>
                      <span class="badge bg-secondary">Existing: ${existingStep.bookmarks?.length || 0} bookmarks</span>
                    </div>
                    <div>
                      <span class="badge bg-secondary">Imported: ${importedStep.bookmarks?.length || 0} bookmarks</span>
                    </div>
                  </div>
                  
                  ${diff.bookmarksDiffer ? `
                    <div class="mt-2 small">
                      ${diff.uniqueToExisting.length > 0 ? `
                        <div class="text-primary mb-1 bookmark-diff-existing">
                          <strong>${diff.uniqueToExisting.length} bookmark(s) only in existing:</strong> 
                          ${diff.uniqueToExisting.map(b => esc(b.title)).join(', ')}
                        </div>
                      ` : ''}
                      
                      ${diff.uniqueToImported.length > 0 ? `
                        <div class="text-success mb-1 bookmark-diff-imported">
                          <strong>${diff.uniqueToImported.length} bookmark(s) only in imported:</strong> 
                          ${diff.uniqueToImported.map(b => esc(b.title)).join(', ')}
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </li>`;
              }).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Handle the completion of the diff modal
function handleDiffCompletion(modal, modalInstance) {
  const duplicatePathways = JSON.parse(modal.dataset.duplicates);
  const newPathways = JSON.parse(modal.dataset.newPathways);
  const existingPathways = JSON.parse(modal.dataset.existingPathways);
  
  // Clone existing pathways to modify
  const resultPathways = [...existingPathways];
  
  // Process each duplicate pathway based on user selection
  duplicatePathways.forEach((dup, index) => {
    const selectedAction = document.querySelector(`input[name="pathway-action-${index}"]:checked`).value;
    const existingIndex = dup.existingIndex;
    
    switch (selectedAction) {
      case 'keep-existing':
        // Do nothing, keep existing
        break;
        
      case 'use-imported':
        // Replace existing with imported
        resultPathways[existingIndex] = dup.imported;
        break;
        
      case 'merge':
        // Merge pathways
        const mergedPathway = mergePathways(dup.existing, dup.imported);
        resultPathways[existingIndex] = mergedPathway;
        break;
        
      case 'import-as-new':
        // Add as new with modified name
        const importedCopy = { ...dup.imported };
        const formattedDate = new Date().toLocaleString();
        importedCopy.name = `${importedCopy.name} - Imported ${formattedDate}`;
        resultPathways.push(importedCopy);
        break;
    }
  });
  
  // Add all non-duplicate pathways
  resultPathways.push(...newPathways);
  
  // Update storage with final pathways
  chrome.storage.local.set({ pathways: resultPathways }, () => {
    // Check if we're using Bootstrap modal or custom implementation
    if (typeof modalInstance.hide === 'function') {
      // Bootstrap modal
      modalInstance.hide();
      modal.addEventListener('hidden.bs.modal', () => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
        alert('Import complete!');
        render();
      });
    } else {
      // Custom modal implementation
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
      document.body.classList.remove('modal-open');
      alert('Import complete!');
      render();
    }
  });
}

// Merge two pathways with smart logic
function mergePathways(existing, imported) {
  // Start with a copy of the existing pathway
  const merged = { ...existing };
  
  // Merge descriptions - if both have content, use the longer one
  // as it likely has more information
  if (imported.description && (!existing.description || imported.description.length > existing.description.length)) {
    merged.description = imported.description;
  }
  
  // Keep creation timestamp from the older one
  if (existing.created && imported.created) {
    merged.created = Math.min(existing.created, imported.created);
  } else if (imported.created) {
    merged.created = imported.created;
  }
  
  // Smart step merging
  const mergedSteps = [...(existing.steps || [])];
  
  (imported.steps || []).forEach(importedStep => {
    // Check if a step with the same name exists
    const existingStepIndex = mergedSteps.findIndex(s => s.name === importedStep.name);
    
    if (existingStepIndex >= 0) {
      // Merge step contents
      const existingStep = mergedSteps[existingStepIndex];
      
      // Merge step objectives - prefer the non-empty or longer one
      if (importedStep.objective && (!existingStep.objective || importedStep.objective.length > existingStep.objective.length)) {
        existingStep.objective = importedStep.objective;
      }
      
      // Merge bookmarks with deduplication
      const existingBookmarks = existingStep.bookmarks || [];
      const importedBookmarks = importedStep.bookmarks || [];
      
      // Combine bookmarks, avoiding duplicates based on URL
      const mergedBookmarks = [...existingBookmarks];
      
      importedBookmarks.forEach(importedBookmark => {
        // Check if bookmark with same URL exists
        const existingBookmarkIndex = mergedBookmarks.findIndex(b => b.url === importedBookmark.url);
        
        if (existingBookmarkIndex === -1) {
          // Add new bookmark
          mergedBookmarks.push(importedBookmark);
        } else {
          // Bookmark exists - merge content if needed
          const existingBookmark = mergedBookmarks[existingBookmarkIndex];
          
          // Use imported title if it's longer (likely more descriptive)
          if (importedBookmark.title && importedBookmark.title.length > existingBookmark.title.length) {
            existingBookmark.title = importedBookmark.title;
          }
          
          // Prefer non-empty or longer descriptions and contexts
          if (importedBookmark.description && (!existingBookmark.description || 
              importedBookmark.description.length > existingBookmark.description.length)) {
            existingBookmark.description = importedBookmark.description;
          }
          
          if (importedBookmark.context && (!existingBookmark.context || 
              importedBookmark.context.length > existingBookmark.context.length)) {
            existingBookmark.context = importedBookmark.context;
          }
          
          // Keep the oldest timestamp if available
          if (existingBookmark.added && importedBookmark.added) {
            existingBookmark.added = Math.min(existingBookmark.added, importedBookmark.added);
          } else if (importedBookmark.added) {
            existingBookmark.added = importedBookmark.added;
          }
          
          // If bookmark is marked as required in either version, keep it as required
          if (!existingBookmark.type || existingBookmark.type.toLowerCase() === 'required' || 
              !importedBookmark.type || importedBookmark.type.toLowerCase() === 'required') {
            existingBookmark.type = 'Required';
          }
        }
      });
      
      // Sort bookmarks - required first, then by title
      mergedBookmarks.sort((a, b) => {
        // First sort by required/bonus status
        const aRequired = !a.type || a.type.toLowerCase() === 'required';
        const bRequired = !b.type || b.type.toLowerCase() === 'required';
        
        if (aRequired !== bRequired) {
          return aRequired ? -1 : 1;
        }
        
        // Then by title alphabetically
        return a.title.localeCompare(b.title);
      });
      
      // Update step with merged bookmarks
      mergedSteps[existingStepIndex] = {
        ...existingStep,
        bookmarks: mergedBookmarks
      };
    } else {
      // Add new step
      mergedSteps.push(importedStep);
    }
  });
  
  // Sort steps to maintain consistent order
  mergedSteps.sort((a, b) => {
    // Try to maintain existing order by comparing indices
    const existingSteps = existing.steps || [];
    const aIndex = existingSteps.findIndex(s => s.name === a.name);
    const bIndex = existingSteps.findIndex(s => s.name === b.name);
    
    // If both steps exist in the original pathway, maintain relative order
    if (aIndex >= 0 && bIndex >= 0) {
      return aIndex - bIndex;
    }
    
    // If only one step exists in original, put it first
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    
    // If neither exists in original, sort by name
    return a.name.localeCompare(b.name);
  });
  
  merged.steps = mergedSteps;
  return merged;
}

// Function to proceed with normal import
function proceedWithImport(pathways, currentPathways, currentCount) {
  // Confirm before replacing all data with a detailed warning
  const confirmMessage = 
    `IMPORT WARNING:\n\n` +
    `You currently have ${currentCount} pathway(s).\n` +
    `You are about to import ${pathways.length} pathway(s).\n\n` +
    `This will REPLACE all your current data. This action cannot be undone!\n` +
    `\nContinue with import?`;
  
  if (confirm(confirmMessage)) {
    // Offer merge option if they have existing data
    if (currentCount > 0 && confirm('Would you like to MERGE with existing data instead of replacing everything?')) {
      // Merge by combining arrays and keeping existing data
      const mergedPathways = [...currentPathways, ...pathways];
      chrome.storage.local.set({pathways: mergedPathways}, () => {
        alert(`Import successful! Added ${pathways.length} pathway(s) to your existing ${currentCount} pathway(s).`);
        render();
      });
    } else {
      // Replace all data
      chrome.storage.local.set({pathways}, () => {
        alert('Import successful! All previous data has been replaced.');
        render();
      });
    }
  }
}

// Create a new pathway
function createNewPathway() {
  window.location.href = 'edit-pathway.html';
}


// Commit to GitHub (all pathways)
async function commitToGitHub() {
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
    statusEl.textContent = message; // SECURITY: Use textContent to prevent XSS

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

    // Get all pathways data first to validate we have data to commit
    chrome.storage.local.get({pathways: []}, async ({pathways}) => {
      try {
        // Verify we have pathways data to commit
        if (!pathways || pathways.length === 0) {
          alert('No pathways data to commit. Create at least one pathway first.');
          return;
        }

        // First, check if we should sync from GitHub first to avoid conflicts
        const syncFirst = confirm(
          'Would you like to sync with GitHub before committing? This is recommended if the file has been modified remotely.\n\n' +
          'Click OK to sync first, or Cancel to commit directly.'
        );

        if (syncFirst) {
          showStatus('Checking for remote changes from GitHub...');

          try {
            // Get the remote file content
            const fileContent = await GitHub.getFileContent();

            if (fileContent.exists) {
              try {
                // Parse the JSON content
                const remotePathways = JSON.parse(fileContent.content);

                // Only offer to merge if the remote content is valid
                if (Array.isArray(remotePathways) && remotePathways.length > 0) {
                  const mergeStrategy = confirm(
                    `Found ${remotePathways.length} pathways on GitHub.\n\n` +
                    `How would you like to proceed?\n\n` +
                    `OK: Merge with your local changes (local sort order will be preserved)\n` +
                    `Cancel: Use your local changes only`
                  );

                  if (mergeStrategy) {
                    // Merge strategy: Keep local sort order but update with remote data where possible
                    // This focuses on preserving the user's local organization

                    // Create a map of local pathway names to their indices for quick lookup
                    const localPathwayMap = new Map();
                    pathways.forEach((pathway, index) => {
                      localPathwayMap.set(pathway.name, index);
                    });

                    // Create a new array to store the merged pathways
                    const mergedPathways = [...pathways]; // Start with the local pathways

                    // For any pathways in the remote that aren't in local, add them to the end
                    remotePathways.forEach(remotePath => {
                      const localIndex = localPathwayMap.get(remotePath.name);

                      if (localIndex === undefined) {
                        // Remote pathway doesn't exist locally, add it to the end
                        mergedPathways.push(remotePath);
                      }
                      // We don't update content for pathways that exist locally
                      // This preserves local changes while maintaining sort order
                    });

                    // Use the merged pathways for our commit
                    pathways = mergedPathways;
                    showStatus('Successfully merged with remote changes', 'success');
                  }
                }
              } catch (parseError) {
                console.error('Error parsing GitHub file:', parseError);
                const continueAnyway = confirm(
                  `Error parsing the GitHub file: ${parseError.message}\n\n` +
                  `Do you want to continue with the commit anyway? This will overwrite the remote file.`
                );

                if (!continueAnyway) {
                  showStatus('Commit cancelled by user', 'warning');
                  return;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching from GitHub before commit:', error);
            const continueAnyway = confirm(
              `Error fetching from GitHub: ${error.message}\n\n` +
              `Do you want to continue with the commit anyway?`
            );

            if (!continueAnyway) {
              showStatus('Commit cancelled by user', 'warning');
              return;
            }
          }
        }

        // Ask for commit message
        const defaultMessage = `Update curator pathways (${pathways.length} pathways)`;
        const commitMessage = prompt('Enter a commit message:', defaultMessage);
        if (!commitMessage) return; // Cancelled

        // Create a deep copy of pathways with sort order information
        const pathwaysWithSortOrder = JSON.parse(JSON.stringify(pathways, (key, value) => {
          // Preserve all audit-related fields during JSON serialization
          if (key === 'available' || key === 'status' || key === 'lastChecked' || 
              key === 'error' || key === 'redirectUrl' || key === 'requiresAuth' || 
              key === 'isExemptDomain' || key === 'checkDuration') {
            return value;
          }
          return value;
        }));

        // Add sort order to each bookmark in each pathway's steps
        pathwaysWithSortOrder.forEach(pathway => {
          if (pathway.steps) {
            pathway.steps.forEach(step => {
              if (step.bookmarks) {
                step.bookmarks.forEach((bookmark, index) => {
                  bookmark.sortOrder = index;
                });
              }
            });
          }
        });

        // Convert to JSON
        const json = JSON.stringify(pathwaysWithSortOrder, null, 2);

        // Display committing status
        showStatus(`Committing to GitHub repository: ${config.repository} (${config.branch})...`);

        try {
          // Commit to GitHub
          const result = await GitHub.commitFile(json, commitMessage);

          // Check if the commit was successful
          if (result && result.commit) {
            // Show success message with commit details
            showStatus(
              `Successfully committed to GitHub!<br>` +
              `<small>File: ${config.filepath}<br>` +
              `Commit: <a href="${result.commit.html_url}" target="_blank" class="text-white">${result.commit.sha.substring(0, 7)}</a></small>`,
              'success'
            );
            
            // Notify background script to reset auto-commit timer
            if (chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage({ type: 'manualCommit' });
            }
          } else {
            showStatus('Commit completed, but could not verify details.', 'success');
            
            // Notify background script to reset auto-commit timer
            if (chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage({ type: 'manualCommit' });
            }
          }
        } catch (error) {
          // Handle specific GitHub API errors
          console.error('Failed to commit to GitHub:', error);

          let errorMessage = error.message;

          // Check for common error types and provide more helpful messages
          if (error.message.includes('401')) {
            errorMessage = 'Authentication error. Your GitHub token may have expired. Please reconnect in GitHub Settings.';
          } else if (error.message.includes('403')) {
            errorMessage = 'Permission denied. Make sure your token has the "repo" scope.';
          } else if (error.message.includes('404')) {
            errorMessage = 'Repository not found. Check your repository settings.';
          } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage = 'Network error. Check your internet connection and try again.';
          } else if (error.message.includes('409')) {
            errorMessage = 'Conflict error: The file has been modified on GitHub since your last sync. ' +
                           'Please use "Import from GitHub" first to sync changes before committing.';
          }

          showStatus(`Failed to commit to GitHub: ${errorMessage}`, 'error');
        }
      } catch (error) {
        console.error('Error preparing data for GitHub commit:', error);
        showStatus(`Error preparing data: ${error.message}`, 'error');
      }
    });
  } catch (error) {
    console.error('Error loading GitHub module:', error);
    alert('Failed to load GitHub integration: ' + error.message);
  }
}

// Theme handling functions
function getPreferredTheme() {
  // Respect OS preference only
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
}

// Import from GitHub repository function
async function importFromGitHub() {
  // Status element variable for this function
  let statusEl = null;
  
  // Create a status message helper
  const showStatus = (message, type = 'info') => {
    // Remove existing status if any
    if (statusEl && document.body.contains(statusEl)) {
      document.body.removeChild(statusEl);
    }
    
    // Create status element
    statusEl = document.createElement('div');
    document.body.appendChild(statusEl);
    
    // Set appropriate background color based on type
    let bgColor = 'bg-info';
    if (type === 'success') bgColor = 'bg-success';
    if (type === 'error') bgColor = 'bg-danger';
    if (type === 'warning') bgColor = 'bg-warning text-dark';
    
    // Update status message
    statusEl.className = `position-fixed top-0 start-0 end-0 ${bgColor} text-white p-3 text-center`;
    statusEl.textContent = message; // SECURITY: Use textContent to prevent XSS
    
    // For success or error messages, set a timeout to remove the status
    if (type === 'success' || type === 'error' || type === 'warning') {
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
    
    // Display fetching status
    showStatus(`Fetching data from GitHub repository: ${config.repository} (${config.branch})...`);
    
    try {
      // Get file content from GitHub
      const fileResult = await GitHub.getFileContent();
      
      if (!fileResult.exists) {
        showStatus(`File "${config.filepath}" not found in the repository. Nothing to import.`, 'warning');
        return;
      }
      
      try {
        // Parse the JSON content
        const importedData = JSON.parse(fileResult.content);
        
        // Validate that this is a valid pathways array
        if (!Array.isArray(importedData)) {
          throw new Error('The file does not contain a valid pathways array');
        }
        
        // Get existing pathways
        chrome.storage.local.get({pathways: []}, async ({pathways: existingPathways}) => {
          try {
            // If there are no existing pathways, just import directly
            if (!existingPathways || existingPathways.length === 0) {
              // Save the imported pathways
              await chrome.storage.local.set({pathways: importedData});
              showStatus(`Successfully imported ${importedData.length} pathways from GitHub`, 'success');
              render(); // Refresh the UI
              return;
            }
            
            // If there are existing pathways, ask for confirmation
            const importConfirmed = confirm(
              `You already have ${existingPathways.length} pathways in your extension.\n\n` +
              `Would you like to:\n` +
              `1. Replace all existing pathways with the imported ones\n` +
              `2. Cancel and keep your current pathways\n\n` +
              `Choose "OK" to replace, or "Cancel" to keep your current pathways.`
            );
            
            if (importConfirmed) {
              // Save the imported pathways
              await chrome.storage.local.set({pathways: importedData});
              showStatus(`Successfully imported ${importedData.length} pathways from GitHub (replaced ${existingPathways.length} existing pathways)`, 'success');
              render(); // Refresh the UI
            } else {
              showStatus('Import cancelled. Your existing pathways were not changed.', 'warning');
            }
          } catch (error) {
            console.error('Error processing import:', error);
            showStatus(`Error processing import: ${error.message}`, 'error');
          }
        });
      } catch (parseError) {
        console.error('Error parsing GitHub file:', parseError);
        showStatus(`The file does not contain valid JSON data: ${parseError.message}`, 'error');
      }
    } catch (error) {
      console.error('GitHub file fetch error:', error);
      
      let errorMessage = error.message;
      
      // Check for common error types and provide more helpful messages
      if (error.message.includes('401')) {
        errorMessage = 'Authentication error. Your GitHub token may have expired. Please reconnect in GitHub Settings.';
      } else if (error.message.includes('403')) {
        errorMessage = 'Permission denied. Make sure your token has the "repo" scope.';
      } else if (error.message.includes('404')) {
        errorMessage = 'Repository or file not found. Check your repository settings.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = 'Network error. Check your internet connection and try again.';
      }
      
      showStatus(`Failed to fetch data from GitHub: ${errorMessage}`, 'error');
    }
  } catch (error) {
    console.error('Error loading GitHub module:', error);
    alert('Failed to load GitHub integration: ' + error.message);
  }
}


// Check and display auto-commit status
async function checkAutoCommitStatus() {
  try {
    // Get auto-commit config from PWA storage
    const STORAGE_PREFIX = 'pathcurator_';
    const autoCommitConfigStr = localStorage.getItem(STORAGE_PREFIX + 'auto_commit_config');
    const config = autoCommitConfigStr ? JSON.parse(autoCommitConfigStr) : { enabled: false, interval: 15 };
    
    const statusDiv = document.getElementById('auto-commit-status');
    const messageSpan = document.getElementById('auto-commit-message');
    
    if (config.enabled) {
      // Check if GitHub is configured
      const githubConfigStr = localStorage.getItem('github_config');
      const githubConfig = githubConfigStr ? JSON.parse(githubConfigStr) : {};
      
      if (githubConfig.repository) {
        statusDiv.classList.remove('d-none', 'alert-warning-subtle');
        statusDiv.classList.add('alert-info-subtle');
        messageSpan.textContent = `Auto-commit enabled: Every ${config.interval} minutes to ${githubConfig.repository}`;
      } else {
        statusDiv.classList.remove('d-none', 'alert-info-subtle');
        statusDiv.classList.add('alert-warning-subtle');
        messageSpan.textContent = 'Auto-commit enabled but GitHub repository not configured';
      }
    } else {
      statusDiv.classList.add('d-none');
    }
  } catch (error) {
    console.error('Error checking auto-commit status:', error);
  }
}

// events
document.addEventListener('DOMContentLoaded',()=>{
  // Initialize theme based on preference
  setTheme(getPreferredTheme());
  
  render();
  
  // Check auto-commit status
  checkAutoCommitStatus();
  
  // Add Pathway button
  $('#addPathway').addEventListener('click', createNewPathway);
  
  // Empty state button
  $('#emptyStateBtn')?.addEventListener('click', createNewPathway);
  
  // Commit to GitHub button
  $('#commitToGithub').addEventListener('click', commitToGitHub);
  
  // Import from GitHub button
  $('#importFromGithub').addEventListener('click', importFromGitHub);
  
  // Export JSON button
  $('#exportJson').addEventListener('click', exportAllData);
  
  // Import JSON button - trigger file input
  $('#importJson').addEventListener('click', () => {
    $('#fileInput').click();
  });
  
  
  // Handle file selection
  const fileInput = $('#fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', event => {
      const file = event.target.files[0];
      if (file) {
        importData(file);
        // Reset file input so the same file can be selected again
        event.target.value = '';
      }
    });
  }
  $('#pathwayList').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    e.stopPropagation();
    const act=btn.dataset.act; const idx=+btn.dataset.idx;
    if(act==='view-detail'){
      window.location.href = `pathway-detail.html?id=${idx}`;
    } else if(act==='edit-path'){
      window.location.href = `edit-pathway.html?id=${idx}`;
    } else if (act === 'delete-path') {
      if (!confirm('Delete this entire pathway and all its steps?')) return;
      chrome.storage.local.get({pathways: []}, d => {
        d.pathways.splice(idx, 1);
        save(d.pathways, render);
      });

    } else if(act==='edit-step'){
      const sIdx=+btn.dataset.step;
      chrome.storage.local.get({pathways:[]},d=>{
        const st=d.pathways[idx].steps[sIdx];
        st.name=prompt('Step name',st.name)||st.name;
        st.objective=prompt('Objective',st.objective||'')??st.objective;
        save(d.pathways,render);
      });
    } else if (act === 'delete-step') {
      const sIdx = +btn.dataset.step;
      if (!confirm('Delete this step and all bookmarks in it?')) return;
      chrome.storage.local.get({pathways: []}, d => {
        d.pathways[idx].steps.splice(sIdx, 1);
        save(d.pathways, render);
      });

    } else if (act === 'edit-bm') {
      const sIdx = +btn.dataset.step;
      const bmIdx = +btn.dataset.bm;
      chrome.storage.local.get({pathways:[]}, d => {
        const bm = d.pathways[idx]?.steps[sIdx]?.bookmarks[bmIdx];
        if (!bm) return;
        bm.title       = prompt('Bookmark title:', bm.title) || bm.title;
        bm.description = prompt('Description:', bm.description || '') ?? bm.description;
        bm.context     = prompt('Context:', bm.context || '') ?? bm.context;
        
        // Link type selection
        const currentType = bm.type || 'required';
        const typePrompt = prompt('Link type (required/bonus):', currentType);
        if (typePrompt && ['required', 'bonus'].includes(typePrompt.toLowerCase())) {
          bm.type = typePrompt.toLowerCase();
        }

        // allow moving bookmark to another step within same pathway
        const dest = parseInt(prompt(`Move to step index (0‑${d.pathways[idx].steps.length-1}):`, sIdx), 10);
        if (!isNaN(dest) && dest !== sIdx && d.pathways[idx].steps[dest]) {
          // remove from old position and push to new step
          d.pathways[idx].steps[sIdx].bookmarks.splice(bmIdx,1);
          d.pathways[idx].steps[dest].bookmarks.push(bm);
        }

        save(d.pathways, render);
      });
    } else if (act === 'delete-bm') {
      const sIdx = +btn.dataset.step;
      const bmIdx = +btn.dataset.bm;
      if (!confirm('Delete this bookmark?')) return;
      chrome.storage.local.get({pathways: []}, d => {
        const bookmarks = d.pathways[idx]?.steps[sIdx]?.bookmarks;
        if (!bookmarks) return;
        bookmarks.splice(bmIdx, 1);
        save(d.pathways, render);
      });
    }
  });
});

// Initialize bookmarklet functionality
function initializeBookmarklet() {
  const baseUrl = window.location.origin + window.location.pathname.replace(/[^\/]*$/, '');
  
  // Generate bookmarklet code
  const bookmarkletCode = `(function(){
    const url=encodeURIComponent(window.location.href);
    const title=encodeURIComponent(document.title);
    const description=encodeURIComponent(document.querySelector('meta[name="description"]')?.content||document.querySelector('meta[property="og:description"]')?.content||'');
    window.open('${baseUrl}bookmarklet.html?url='+url+'&title='+title+'&description='+description,'_blank');
  })()`;
  
  const bookmarkletUrl = 'javascript:' + encodeURIComponent(bookmarkletCode);
  
  // Set bookmarklet links
  const bookmarkletLink = document.getElementById('bookmarkletLink');
  const emptyStateBookmarklet = document.getElementById('emptyStateBookmarklet');
  
  if (bookmarkletLink) {
    bookmarkletLink.href = bookmarkletUrl;
  }
  if (emptyStateBookmarklet) {
    emptyStateBookmarklet.href = bookmarkletUrl;
  }
  
  // Handle bookmarklet toggle
  const toggleBtn = document.getElementById('toggleBookmarklet');
  if (toggleBtn && !toggleBtn.hasEventListener) {
    toggleBtn.hasEventListener = true;
    toggleBtn.addEventListener('click', () => {
      const section = document.getElementById('bookmarkletSection');
      if (section) {
        section.classList.add('d-none');
        localStorage.setItem('bookmarkletHidden', 'true');
      }
    });
  }
}

// Add storage change listener for debugging
if (chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('Storage changed:', namespace, changes);
    if (changes.pathways) {
      console.log('Pathways changed in storage, auto-refreshing dashboard...');
      render();
    }
  });
} else {
  console.log('No storage change listener available');
}

// Listen for refresh requests from bookmarklet
window.addEventListener('storage', (e) => {
  if (e.key === 'pathcurator_refresh_needed') {
    console.log('Bookmarklet requested dashboard refresh');
    render();
  }
});

// Also check for refresh request on page focus
window.addEventListener('focus', () => {
  if (localStorage.getItem('pathcurator_refresh_needed')) {
    console.log('Dashboard focused, checking for refresh request');
    render();
    localStorage.removeItem('pathcurator_refresh_needed');
  }
});

// Web Share Target API Service Worker Registration
async function registerShareServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/share-service-worker.js', {
        scope: '/'
      });
      
      console.log('Share service worker registered successfully:', registration);
      
      // Listen for messages from the service worker
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.type === 'SHARE_RECEIVED') {
          console.log('Received shared content:', event.data);
          // Could trigger a UI update or notification here
        }
      });
      
    } catch (error) {
      console.log('Share service worker registration failed:', error);
    }
  }
}

// Register Web Share Target support on page load
document.addEventListener('DOMContentLoaded', () => {
  registerShareServiceWorker();
});

// Add Web Share API functionality for sharing PathCurator itself
function setupWebShareAPI() {
  // Web Share API support disabled for cleaner navigation
  console.log('Web Share API functionality disabled');
}

// Initialize Web Share API on page load
document.addEventListener('DOMContentLoaded', () => {
  setupWebShareAPI();
});
