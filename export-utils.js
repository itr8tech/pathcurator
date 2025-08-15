// -----------------------------------------------------------------------------
// CSV Export helpers (used by background.js and GitHub upload)
// -----------------------------------------------------------------------------

// Helper function to get GitHub username from storage
export async function getGitHubUsername() {
  try {
    // Ensure chrome and storage API are available
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) {
      console.error('Chrome storage API is not available');
      return 'Unknown';
    }

    // Using a Promise wrapper to ensure we always get a response
    const data = await new Promise(resolve => {
      try {
        chrome.storage.local.get('github_config', result => {
          resolve(result || {});
        });
      } catch (chromeError) {
        console.error('Error in chrome.storage.local.get:', chromeError);
        resolve({});
      }
    });

    // Add explicit null/undefined checking
    if (!data) {
      console.error('No data returned from storage');
      return 'Unknown';
    }

    // Debug logging to help troubleshoot
    console.log('GitHub config data from storage:', data);

    // Safely access nested properties
    const username = data.github_config && typeof data.github_config === 'object'
      ? data.github_config.username || 'Unknown'
      : 'Unknown';

    console.log('Extracted GitHub username:', username);

    // Ensure username is a string to prevent replace() errors
    return typeof username === 'string' ? username : 'Unknown';
  } catch (error) {
    console.error('Error getting GitHub username:', error);
    return 'Unknown';
  }
}

// Generate CSV (now async to properly handle the GitHub username)
export async function generateCSV(p) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  // Get the GitHub username if not already in the pathway
  const createdBy = p.createdBy || await getGitHubUsername();

  // Header rows with pathway metadata including version info
  const rows = [
    ['Pathway Name', p.name],
    ['Pathway Description', p.description || ''],
    ['Content Warning', p.contentWarning || ''],
    ['Acknowledgments', p.acknowledgments || ''],
    ['Created By', createdBy],
    ['Created Date', new Date(p.created || Date.now()).toISOString()],
    ['Modified By', p.modifiedBy || createdBy],
    ['Version', p.version || ''],
    ['Last Updated', p.lastUpdated ? new Date(p.lastUpdated).toISOString() : ''],
    ['Total Steps', p.steps ? p.steps.length : 0],
    ['Total Bookmarks', p.steps ? p.steps.reduce((count, step) => count + (step.bookmarks?.length || 0), 0) : 0],
    [''], // blank line
    ['Step', 'Title', 'URL', 'Description', 'Context', 'Type', 'Content Type', 'Sort Order']
  ];

  (p.steps || []).forEach(function (st) {
    (st.bookmarks || []).forEach(function (b, i) {
      rows.push([
        st.name,
        b.title,
        b.url,
        b.description,
        b.context,
        (b.required === false || (b.type && b.type.toLowerCase() === 'bonus')) ? 'Bonus' : 'Required',
        b.contentType || 'Read',
        i
      ]);
    });
  });

  return rows.map(row => row.map(esc).join(',')).join('\r\n');
}

export async function generateStepCSV(step, pathway = null) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  // If pathway info is provided, add creator info
  let rows = [];
  if (pathway) {
    const createdBy = pathway.createdBy || await getGitHubUsername();

    rows = [
      ['Step Name', step.name],
      ['Pathway Name', pathway.name],
      ['Created By', createdBy],
      [''], // blank line
    ];
  }

  // Add the header row
  rows.push(['Title', 'URL', 'Description', 'Context', 'Type', 'Content Type', 'Sort Order']);

  (step.bookmarks || []).forEach(function (b, i) {
    rows.push([
      b.title,
      b.url,
      b.description,
      b.context,
      b.type || 'Required',
      b.contentType || 'Read',
      i
    ]);
  });

  return rows.map(row => row.map(esc).join(',')).join('\r\n');
}
// -----------------------------------------------------------------------------
// End CSV helpers
// -----------------------------------------------------------------------------
// -------------------------------------------------------------------------
// Use the sophisticated HTML generator from web-exports.js for web compatibility
// -------------------------------------------------------------------------
import { generateSophisticatedHTML } from './web-exports.js';
export const generateHTML = generateSophisticatedHTML;

// For JSON export, include creator info
export async function preparePathwayForExport(pathway) {
  // Make sure pathway has createdBy field
  if (!pathway.createdBy) {
    pathway.createdBy = await getGitHubUsername();
  }
  return pathway;
}
// -------------------------------------------------------------------------