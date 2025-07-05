// background.js as ES module
// Curator background – handles storage init + HTML/CSV export

import { secureGet } from './secure-storage.js';

// Enhanced Markdown-to-HTML converter for service worker environment
// Supports full Markdown syntax including tables, images, lists, code blocks, etc.
function markdownToHTML(mdText) {
  if (!mdText) return '';

  try {
    // 1. First, convert all blockquotes to a special marker (before HTML escaping)
    // Match both '> text' and '>text' formats for better compatibility
    let html = mdText.replace(/^>\s*(.*?)$/gm, '@@BLOCKQUOTE@@$1@@/BLOCKQUOTE@@');

    // 2. Now do the standard HTML escaping (won't affect our markers)
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 3. Convert the blockquote markers back to HTML tags
    html = html.replace(/@@BLOCKQUOTE@@(.*?)@@\/BLOCKQUOTE@@/g, '<blockquote>$1</blockquote>');
    
    // Headings
    html = html
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold and italic
    html = html
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
    
    // Code blocks
    html = html.replace(/```([^`]*?)```/gs, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]*?)`/g, '<code>$1</code>');
    
    // Horizontal rule
    html = html.replace(/^(?:[-*_]\s*){3,}$/gm, '<hr>');
    
    // Unordered lists - simplified
    html = html.replace(/^[\*\-\+] (.*)$/gim, '<ul><li>$1</li></ul>')
      .replace(/<\/ul>\s*<ul>/g, '');
    
    // Ordered lists - simplified
    html = html.replace(/^\d+\. (.*)$/gim, '<ol><li>$1</li></ol>')
      .replace(/<\/ol>\s*<ol>/g, '');
    
    // Tables (simplified)
    html = html.replace(/^\|(.*)\|$/gm, function(match, content) {
      // Check if this is a header row with separator below
      const isHeader = /^\|[\-:| ]+\|$/m.test(match);
      
      // Split the content by pipes and clean up
      const cells = content.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      
      // Create a row with cells
      const cellTag = isHeader ? 'th' : 'td';
      const row = cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('');
      
      return `<tr>${row}</tr>`;
    });
    
    // Wrap table rows
    html = html.replace(/(<tr>.*?<\/tr>)(?:\s*<tr>)/gs, '<table class="table table-bordered">$1');
    html = html.replace(/(<\/tr>)(?!\s*<tr>)/g, '$1</table>');
    
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="img-fluid" loading="lazy">');
    
    // Line breaks (after all other processing)
    html = html.replace(/\n/g, '<br>');
    
    return html;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Fallback to basic escaping
    return mdText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}

// Make sure service worker is properly activated
self.addEventListener('install', (event) => {
  console.log('Service worker installed');
  self.skipWaiting(); // Force activation
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  // Ensure that the service worker stays active for link checking
  event.waitUntil(self.clients.claim());
});

// Keep the service worker alive for link checking
try {
  // For manifest v3, we can use the service worker events
  // or optionally use chrome.alarms for background tasks
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
      console.log('Background service worker kept alive');
      // This just keeps the worker active; no need to do anything
    }
  });
} catch (e) {
  console.log('Error setting up background persistence:', e);
}

// Export message handler - only handles export-related messages
async function handleExportMessages(msg, sender, sendResponse) {
  console.log('Handling export message:', msg.type);

  // Create a response wrapper to handle promises properly with chrome message passing
  const asyncResponse = async () => {
    try {
      const { pathways = [] } = await chrome.storage.local.get({ pathways: [] });
      const pathway = pathways[msg.index];

      if (!pathway) {
        return { success: false, error: 'Pathway not found' };
      }

      // For service workers, use the local functions instead of dynamic imports
      // since service workers don't support dynamic imports

      if (msg.type === 'exportPathway') {
        const html = await generateHTML(pathway);
        const b64 = btoa(unescape(encodeURIComponent(html)));

        return new Promise((resolve) => {
          chrome.downloads.download({
            url: `data:text/html;base64,${b64}`,
            filename: `${sanitize(pathway.name)}.html`,
            saveAs: true
          }, downloadId => {
            if (chrome.runtime.lastError) {
              console.error('Download error:', chrome.runtime.lastError);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve({ success: true, downloadId });
            }
          });
        });
      }
      else if (msg.type === 'exportPathwayCSV') {
        // For service workers, use the local CSV generation function
        const csv = generateCSV(pathway);
        const b64 = btoa(unescape(encodeURIComponent(csv)));

        return new Promise((resolve) => {
          chrome.downloads.download({
            url: `data:text/csv;base64,${b64}`,
            filename: `${sanitize(pathway.name)}.csv`,
            saveAs: true
          }, downloadId => {
            resolve({ success: true, downloadId });
          });
        });
      }
      else if (msg.type === 'exportStepHTML') {
        const stepIndex = msg.stepIndex;
        if (stepIndex === undefined || !pathway.steps || stepIndex >= pathway.steps.length) {
          return { success: false, error: 'Step not found' };
        }

        const step = pathway.steps[stepIndex];
        // For service workers, use the existing HTML function without dynamic imports
        // We'll pass the step data to the generateHTML function directly
        const html = await generateHTML(step);
        const b64 = btoa(unescape(encodeURIComponent(html)));

        return new Promise((resolve) => {
          chrome.downloads.download({
            url: `data:text/html;base64,${b64}`,
            filename: `${sanitize(pathway.name)}_step_${sanitize(step.name)}.html`,
            saveAs: true
          }, downloadId => {
            resolve({ success: true, downloadId });
          });
        });
      }
      else if (msg.type === 'exportStepCSV') {
        const stepIndex = msg.stepIndex;
        if (stepIndex === undefined || !pathway.steps || stepIndex >= pathway.steps.length) {
          return { success: false, error: 'Step not found' };
        }

        const step = pathway.steps[stepIndex];
        // For service workers, use the local CSV function
        const csv = generateStepCSV(step);
        const b64 = btoa(unescape(encodeURIComponent(csv)));

        return new Promise((resolve) => {
          chrome.downloads.download({
            url: `data:text/csv;base64,${b64}`,
            filename: `${sanitize(pathway.name)}_step_${sanitize(step.name)}.csv`,
            saveAs: true
          }, downloadId => {
            resolve({ success: true, downloadId });
          });
        });
      }

      return { success: false, error: 'Unknown export type' };
    } catch (error) {
      console.error('Error in export handler:', error);
      return { success: false, error: error.message };
    }
  };

  // Execute the async function and send the response
  asyncResponse().then(response => {
    if (sendResponse) sendResponse(response);
  });

  // Return true to indicate we'll send a response asynchronously
  return true;
}

// ------------- helpers -------------
function generateCSV(p) {
  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;

  // Add pathway metadata at the top
  const rows = [
    ['Pathway Name', p.name],
    ['Pathway Description', p.description || ''],
    ['Content Warning', p.contentWarning || ''],
    ['Acknowledgments', p.acknowledgments || ''],
    ['Created By', p.createdBy || 'Unknown'],
    ['Created Date', new Date(p.created || Date.now()).toISOString()],
    ['Modified By', p.modifiedBy || p.createdBy || 'Unknown'],
    ['Last Updated', p.lastUpdated ? new Date(p.lastUpdated).toISOString() : ''],
    ['Version', p.version || ''],
    ['Has Custom Header', p.headerImage ? 'Yes' : 'No'],
    ['Total Steps', p.steps?.length || 0],
    [''],
    ['Step', 'Title', 'URL', 'Description', 'Context', 'Type', 'Content Type', 'Sort Order']
  ];
  
  p.steps.forEach((st, stepIndex) => {
    (st.bookmarks || []).forEach((b, bookmarkIndex) => {
      rows.push([st.name, b.title, b.url, b.description, b.context, b.type || 'Required', b.contentType || 'Read', bookmarkIndex]);
    });
  });
  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}

function generateStepCSV(step) {
  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const rows = [['Title', 'URL', 'Description', 'Context', 'Type', 'Content Type', 'Sort Order']];
  (step.bookmarks || []).forEach((b, index) => {
    rows.push([b.title, b.url, b.description, b.context, b.type || 'Required', b.contentType || 'Read', index]);
  });
  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}

// [The rest of the background.js file content should be included here]

export async function generateHTML(p) {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const bs = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
  const fa = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';

  // For service workers, we need to handle GitHub username lookup differently
  // Let's use a fallback value since we can't import dynamically in service workers
  const createdBy = p.createdBy || 'Unknown';
  // Note: modifiedBy will be handled similarly
  
  // Define content type icons and classes
  const contentTypeIcons = {
    'Read': {icon: 'fa-book', bgClass: 'bg-sagedark'},
    'Watch': {icon: 'fa-play', bgClass: 'bg-bluegreen'},
    'Listen': {icon: 'fa-headphones', bgClass: 'bg-blue'},
    'Participate': {icon: 'fa-user-group', bgClass: 'bg-blue'}
  };
  
  // Get the curator.css file content
  const curatorCss = `/* Custom styles for Curator pathways in Moodle */
/* Nori Sinclair, Corporate Learning branch, February 2025 */
/* Based on existing Moodle styles with Bootstrap 4.7 and Font Awesome 6 */

/* Everything must be wrapped in .moodlecurator class for Moodle specificity */

.moodlecurator {
    font-size: 1rem;
}

/* Palette */

.moodlecurator {
    --gov-primary-blue: #234075;
    /* primary-blue and darkblue are the same colour */
    --gov-primary-yellow: #e3a82b;
    --sagegreen: #bfd5cf;
    --sagedark: #29735E;
    --bluegreen: #2F6173;
}

.moodlecurator .bg-blue {
    background-color: var(--gov-primary-blue);
}

.moodlecurator .bg-sagegreen {
    background-color: var(--sagegreen);
}

.moodlecurator .bg-sagedark {
    background-color: var(--sagedark);
}

.moodlecurator .bg-bluegreen {
    background-color: var(--bluegreen);
}

.moodlecurator .border-blue {
    border-width: 2px;
    border-color: var(--gov-primary-blue);
    border-style: solid;
}

.moodlecurator .border-bluegreen {
    border-width: .125rem;
    border-color: var(--bluegreen);
    border-style: solid;
}

.moodlecurator .border-sagedark {
    border-width: .125rem;
    border-color: var(--sagedark);
    border-style: solid;
}

.moodlecurator .border-sagegreen {
    border-width: .125rem;
    border-color: var(--sagegreen);
    border-style: solid;
}

.moodlecurator .text-sagedark {
    color: var(--sagedark) !important;
}

.moodlecurator .text-bluegreen {
    color: var(--bluegreen) !important;
}

.moodlecurator .btn-primary {
    background-color: var(--gov-primary-blue);
    border-color: var(--gov-primary-blue);
}

.moodlecurator .btn-primary:hover {
    background-color: #4f6691;
    border-color: #4f6691;
    /*  hover is 20% tint */
}

.moodlecurator blockquote {
    border-left: 3px solid #333;
    margin: 1em;
    padding-left: 1em;
}

.moodlecurator p+ul,
.moodlecurator p+ol {
    margin-top: -0.75rem;
    /* stem for paragraph followed by list */
}

/* Revert all.css theme file changing bg-color */
.moodlecurator .bg-white {
    background-color: #fff !important;
}

/* Revert all.css theme file changing mr-1 to include padding */
.moodlecurator .mr-1,
.moodlecurator .mx-1 {
    margin-right: 0.25rem !important;
    padding-right: 0 !important;
}

/* add bootstrap 5 utility class */
.moodlecurator .object-fit-contain {
    object-fit: contain;
}


/* headers */

.moodlecurator .header {
    background-image: linear-gradient(135deg, #4a6fc0 0%, #2F6173 50%, #357385 100%);
    background-position: center;
    background-size: cover;
    width: 100%;
    height: 10rem;
    background-color: var(--gov-secondary-blue);
}

/* Custom header image override */
.moodlecurator .header.custom-header {
    background-image: var(--custom-header-image);
}



/* Add icon to external link, code from https://christianoliff.com/blog/styling-external-links-with-an-icon-in-css/
CSS generated content should be ignored by screen readers - see https://developer.mozilla.org/en-US/docs/Web/CSS/content#accessibility */


/* Custom additions for Curator extension exports */
.activity-container {
    border: 1px solid #dee2e6;
    overflow: hidden;
}

.activity-icon-container {
    width: 50px;
    padding: 10px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 25px;
}

.activity-badge {
    background-color: var(--gov-primary-blue);
    color: white;
}

.curatorcontext {
    padding: 0.5rem 0;
}

.fw-semibold {
    font-weight: 600;
}

.font-italic {
    font-style: italic;
}

/* Step container styling using details/summary */
details.step-container {
    margin-bottom: 1.5rem;
    border: 1px solid #dee2e6;
    border-radius: 0.375rem;
    overflow: hidden;
}

/* Summary styling with explicit visible caret */
details.step-container summary {
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    list-style: none; /* Hide the default marker since we're using our own */
}

/* Hide the default marker since we're using our own */
details.step-container summary::-webkit-details-marker,
details.step-container summary::marker {
    display: none;
}

/* Style for the custom caret icon */
details.step-container .caret-icon {
    transition: transform 0.2s;
}

/* Rotate the caret when details is open */
details.step-container[open] .caret-icon {
    transform: rotate(90deg);
}

/* Main content container in summary */
details.step-container .summary-content {
    flex: 1;
}

details.step-container .step-content {
    padding: 1rem;
}

.step-objective {
    background-color: #f8f9fa;
    padding: 0.75rem;
    border-radius: 0.25rem;
    font-style: italic;
    margin-bottom: 1rem;
}

.step-summary {
    font-size: 0.9rem;
    max-width: 95%;
    margin-top: 0.4rem;
    color: #555;
    line-height: 1.4;
}

/* Pause and Reflect section styling */
.pause-reflect-section {
    background-color: #f8f9fa;
    border-radius: 0.375rem;
    padding: 1rem;
    margin-top: 2rem;
    margin-bottom: 1rem;
}

.pause-reflect-section h4 {
    margin-bottom: 1rem;
    font-weight: 600;
}

.pause-reflect-content {
    font-size: 1.05rem;
    line-height: 1.6;
}

/* Control bar styling for fixed position approach */
.control-bar {
    padding: 15px 0;
    border-bottom: 1px solid #dee2e6;
    box-shadow: 0 2px 5px rgba(0,0,0,0.08);
    background-color: white;
}

.control-bar.fixed-top {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1030;
    animation: slideDown 0.3s;
}

@keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
}

/* Spacer for when controls become fixed */
.controls-spacer {
    display: none;
    height: 120px; /* Adjusted to match control bar height with the progress bar */
}

/* Progress bar styles */
.progress-container {
    background-color: transparent;
}

/* When in the control bar */
.control-bar .progress-container {
    padding: 0;
    margin-bottom: 0;
    border: none;
    box-shadow: none;
}

.progress {
    height: 24px;
    border-radius: 12px;
    background-color: #e9ecef;
    overflow: hidden;
}

/* Compact progress bar in control bar */
.control-bar .progress {
    height: 10px;
    border-radius: 5px;
    margin-bottom: 0;
}

.progress-bar {
    background-color: var(--sagedark);
    transition: width 0.5s ease-in-out;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2) inset;
}

.progress-text {
    margin-bottom: 0.5rem;
    color: #555;
    font-size: 0.9rem;
}

.progress-container h5 {
    color: var(--sagedark);
    font-weight: 600;
}

.progress-container .badge {
    font-size: 1rem;
    padding: 0.5rem 0.75rem;
    border-radius: 20px;
}`;
  
  return `<!doctype html>
<html lang="en" data-bs-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="author" content="${esc(createdBy)}">
  <meta name="modified-by" content="${esc(p.modifiedBy || createdBy)}">
  <meta name="description" content="${esc(p.description || '')}">
  <meta name="generator" content="Curator Extension">
  <meta name="created" content="${new Date(p.created || Date.now()).toISOString()}">
  ${p.lastUpdated ? `<meta name="last-updated" content="${new Date(p.lastUpdated).toISOString()}">` : ''}
  ${p.version ? `<meta name="version" content="${esc(p.version)}">` : ''}
  <title>${esc(p.name)}</title>
  <link href="${bs}" rel="stylesheet">
  <link href="${fa}" rel="stylesheet">
  <style>
    ${curatorCss}

    /* Custom search highlight styles */
    .search-highlight {
      background-color: rgba(255, 193, 7, 0.45); /* Increased opacity for better contrast */
      border-radius: 0.25rem;
      padding: 0.125rem 0;
      outline: 1px solid #d39e00; /* Add border for better visibility */
    }

    /* Improved contrast for text-muted */
    .text-muted, .text-muted small {
      color: #5a6268 !important; /* Darker than Bootstrap default for better contrast */
    }

    /* Launched badge styles */
    .badge.launched-badge {
      color: white;
      margin-left: 0.25rem;
    }

    /* Hide the badge initially */
    .launched-badge.d-none {
      display: none !important;
    }

    /* Scroll to top button styles */
    #scrollTopBtn {
      margin-left: 0.5rem;
      transition: opacity 0.3s ease-in-out;
    }

    #scrollTopBtn.d-none {
      display: none !important;
    }

    /* Enhanced Markdown Styles */

    /* Code blocks */
    pre {
      background-color: #f8f9fa;
      padding: 1rem;
      border-radius: 0.375rem;
      border: 1px solid #dee2e6;
      overflow-x: auto;
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      max-width: 100%;
    }

    /* Inline code */
    code {
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.875em;
      color: #d63384;
      background-color: #f8f9fa;
      padding: 0.2em 0.4em;
      border-radius: 0.25rem;
      word-wrap: break-word;
    }

    pre code {
      color: inherit;
      padding: 0;
      background-color: transparent;
      border-radius: 0;
    }

    /* Tables */
    .moodlecurator table {
      width: 100%;
      margin-bottom: 1rem;
      border-collapse: collapse;
      overflow-x: auto;
      display: block;
      max-width: 100%;
    }

    @media screen and (min-width: 768px) {
      .moodlecurator table {
        display: table;
      }
    }

    .moodlecurator table th,
    .moodlecurator table td {
      padding: 0.5rem;
      vertical-align: top;
      border: 1px solid #dee2e6;
    }

    .moodlecurator table th {
      font-weight: 600;
      background-color: #f8f9fa;
      text-align: left;
      border-bottom-width: 2px;
    }

    .moodlecurator table tr:nth-of-type(odd) {
      background-color: rgba(0, 0, 0, 0.02);
    }

    /* Lists */
    .moodlecurator ul,
    .moodlecurator ol {
      padding-left: 2rem;
      margin-bottom: 1rem;
    }

    .moodlecurator ul {
      list-style-type: disc;
    }

    .moodlecurator ol {
      list-style-type: decimal;
    }

    .moodlecurator li {
      margin-bottom: 0.25rem;
    }

    .moodlecurator li > ul,
    .moodlecurator li > ol {
      margin-top: 0.25rem;
      margin-bottom: 0.5rem;
    }

    /* Horizontal rule */
    .moodlecurator hr {
      margin: 1.5rem 0;
      border: 0;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }

    /* Images */
    .moodlecurator img {
      max-width: 100%;
      height: auto;
      border-radius: 0.375rem;
      margin: 1rem 0;
    }

    /* Make images responsive in dark mode */
    body.dark-mode .moodlecurator img:not([src*=".svg"]) {
      filter: brightness(0.9) contrast(1.1);
    }

    /* Dark mode toggle button */
    #darkModeToggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1040;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: #343a40; /* Darker color that works in both modes */
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      border: 2px solid #dee2e6; /* Light border for visibility in both modes */
      transition: all 0.3s ease;
    }

    #darkModeToggle:hover {
      transform: scale(1.05);
      background-color: #495057; /* Lighter color on hover */
      border-color: #ced4da;
    }

    body.dark-mode #darkModeToggle {
      border-color: #495057; /* Darker border in dark mode */
    }

    body.dark-mode #darkModeToggle:hover {
      background-color: #212529; /* Darker color on hover in dark mode */
      border-color: #adb5bd;
    }

    /* Dark mode styles */
    body.dark-mode {
      background-color: #121212;
      color: #e0e0e0;
    }

    /* Dark mode container styles */
    body.dark-mode .moodlecurator {
      background-color: #121212;
      color: #e0e0e0;
    }

    /* Dark mode card styles */
    body.dark-mode .card {
      background-color: #1e1e1e;
      border-color: #2d2d2d;
      color: #e0e0e0; /* Ensure text is white in all cards */
    }

    body.dark-mode .card-header {
      background-color: #2d2d2d;
      border-bottom-color: #3d3d3d;
    }

    body.dark-mode .card-body {
      color: #e0e0e0; /* Explicitly set card body text to light color */
    }

    /* Dark mode details/summary styles */
    body.dark-mode .step-container {
      border-color: #2d2d2d;
    }

    body.dark-mode .step-container summary {
      background-color: #1e1e1e;
      border-bottom-color: #2d2d2d;
    }

    body.dark-mode .step-objective {
      background-color: #2a2a2a;
    }

    /* Dark mode activity container styles */
    body.dark-mode .activity-container {
      border-color: #2d2d2d;
      background-color: #1e1e1e;
    }

    body.dark-mode .step-summary {
      color: #aaa;
    }

    /* Dark mode control bar styles */
    body.dark-mode .control-bar {
      background-color: #1e1e1e;
      border-color: #2d2d2d;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    /* Dark mode for pause and reflect section */
    body.dark-mode .pause-reflect-section {
      background-color: #1e1e1e !important;
    }

    body.dark-mode .progress {
      background-color: #2d2d2d;
    }

    /* Dark mode form controls */
    body.dark-mode .form-control {
      background-color: #2d2d2d;
      border-color: #3d3d3d;
      color: #e0e0e0;
    }

    body.dark-mode .form-control::placeholder {
      color: #aaa;
    }

    body.dark-mode .btn-outline-secondary {
      color: #ccc;
      border-color: #3d3d3d;
    }

    body.dark-mode .btn-outline-secondary:hover {
      background-color: #2d2d2d;
      color: #fff;
    }

    /* Dark mode text contrast improvements */
    body.dark-mode .text-muted,
    body.dark-mode .text-muted small {
      color: #adb5bd !important; /* Lighter than default for better contrast in dark mode */
    }

    /* Dark mode link styles */
    body.dark-mode a {
      color: #8ab4f8; /* More visible blue for dark backgrounds */
    }

    body.dark-mode a:hover {
      color: #aecbfa;
    }

    /* Dark mode badge and button styles */
    body.dark-mode .badge.bg-blue {
      background-color: #3d5a99 !important; /* Darker blue for better visibility */
    }

    body.dark-mode .badge.bg-sagedark {
      background-color: #2c8c6c !important; /* Adjusted for dark mode */
    }

    body.dark-mode .badge.bg-bluegreen {
      background-color: #357385 !important; /* Adjusted for dark mode */
    }

    /* Dark mode for blockquotes (curator context) */
    body.dark-mode blockquote {
      border-left-color: #4d4d4d;
      background-color: #252525;
      padding: 0.5rem;
      border-radius: 0.25rem;
    }

    /* Dark mode for content warning */
    body.dark-mode .bg-warning-subtle {
      background-color: #332701 !important; /* Darker amber color for warning in dark mode */
      color: #e0e0e0;
    }

    /* Keep the summary visible in dark mode */
    body.dark-mode details summary {
      color: #e0e0e0;
    }

    body.dark-mode details summary.text-black {
      color: #ffc107 !important; /* Amber color for warning text in dark mode */
    }

    /* Search highlight in dark mode */
    body.dark-mode .search-highlight {
      background-color: rgba(255, 193, 7, 0.25); /* Adjusted for dark mode */
      outline-color: #b38600;
    }

    /* Additional accessibility features for dark mode */
    body.dark-mode :focus-visible {
      outline-color: #8ab4f8 !important;
      box-shadow: 0 0 0 0.2rem rgba(138, 180, 248, 0.5) !important;
    }

    /* Prose width classes for better readability */
    .prose {
      max-width: 65ch;
      line-height: 1.6;
    }

    .prose-sm {
      max-width: 45ch;
      line-height: 1.5;
      font-size: 0.9rem;
    }

    .prose-lg {
      max-width: 75ch;
      line-height: 1.7;
    }

    /* Broken link warning styles */
    .broken-link-warning {
      color: #856404;
      background-color: #fff3cd;
      border: 1px solid #ffeeba;
      border-radius: 0.25rem;
      padding: 0.5rem 0.75rem;
      margin-left: 1rem;
      margin-top: 0.5rem;
      display: inline-block;
      font-size: 0.875rem;
      vertical-align: middle;
    }

    /* Adjust prose in dark mode */
    body.dark-mode .prose,
    body.dark-mode .prose-sm,
    body.dark-mode .prose-lg {
      color: #e0e0e0;
    }

    /* Dark mode styles for broken link warning */
    body.dark-mode .broken-link-warning {
      color: #ffda6a;
      background-color: #332701;
      border-color: #664d03;
    }

    /* Dark mode styles for markdown elements */
    body.dark-mode .moodlecurator pre {
      background-color: #2a2a2a;
      border-color: #444;
      color: #e0e0e0;
    }

    body.dark-mode .moodlecurator code {
      background-color: #2a2a2a;
      color: #ff77aa;
    }

    body.dark-mode .moodlecurator table th {
      background-color: #2a2a2a;
      border-color: #444;
      color: #e0e0e0;
    }

    body.dark-mode .moodlecurator table td {
      border-color: #444;
    }

    body.dark-mode .moodlecurator table tr:nth-of-type(odd) {
      background-color: rgba(255, 255, 255, 0.05);
    }

    body.dark-mode .moodlecurator hr {
      border-color: rgba(255, 255, 255, 0.1);
    }
  </style>
  <script>
    // Track launched links in localStorage
    const LAUNCHED_LINKS_KEY = 'curator_launched_links_${sanitize(p.name)}';

    // For step-level progress tracking
    let stepProgressData = {};

    // Load previously launched links from localStorage
    function loadLaunchedLinks() {
      try {
        const stored = localStorage.getItem(LAUNCHED_LINKS_KEY);
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        console.error('Error loading launched links:', e);
        return {};
      }
    }

    // Save launched links to localStorage
    function saveLaunchedLinks(links) {
      try {
        localStorage.setItem(LAUNCHED_LINKS_KEY, JSON.stringify(links));
      } catch (e) {
        console.error('Error saving launched links:', e);
      }
    }

    // Count total required bookmarks and launched required bookmarks
    function updateProgressBar() {
      const links = loadLaunchedLinks();
      let totalRequired = 0;
      let completedRequired = 0;

      // Count all required bookmarks
      document.querySelectorAll('.activity-container').forEach(container => {
        // Check if this is a required bookmark (not bonus)
        const badge = container.querySelector('.activity-badge');
        if (badge && badge.textContent.trim() === 'Required') {
          totalRequired++;

          // Check if this bookmark has been launched
          const launchBtn = container.querySelector('.launch-btn');
          if (launchBtn && links[launchBtn.getAttribute('href')]) {
            completedRequired++;
          }
        }
      });

      // Update the progress bar
      const progressBar = document.getElementById('progress-bar');
      const progressCounter = document.getElementById('progress-counter');
      const progressPercentage = document.getElementById('progress-percentage');
      const progressContainer = document.querySelector('.progress-container');

      if (progressBar && progressCounter && progressPercentage && progressContainer) {
        const percentage = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

        // Update the visual elements
        progressBar.style.width = percentage + '%';
        progressBar.setAttribute('aria-valuenow', percentage);
        progressCounter.textContent = completedRequired + ' of ' + totalRequired + ' required';
        progressPercentage.textContent = percentage + '%';

        // Add color classes based on progress
        progressBar.className = 'progress-bar';
        if (percentage === 100) {
          progressBar.classList.add('bg-success');
          progressPercentage.className = 'badge bg-success';
        } else if (percentage >= 66) {
          progressBar.classList.add('bg-sagedark');
          progressPercentage.className = 'badge bg-sagedark';
        } else if (percentage >= 33) {
          progressBar.classList.add('bg-primary');
          progressPercentage.className = 'badge bg-primary';
        } else {
          progressBar.classList.add('bg-bluegreen');
          progressPercentage.className = 'badge bg-bluegreen';
        }

        // Even in the control bar, we may want to hide the progress section
        // if there are no required items to track
        if (totalRequired === 0) {
          progressContainer.style.display = 'none';
        } else {
          progressContainer.style.display = 'block';
        }
      }
    }

    // Mark a link as launched
    function markAsLaunched(url) {
      const links = loadLaunchedLinks();
      links[url] = Date.now();
      saveLaunchedLinks(links);

      // Update UI to show this link as launched
      updateLaunchedBadges(url);

      // Update progress bar and step badges
      updateProgressBar();
    }

    // Update the UI to show which links have been launched
    function updateLaunchedBadges(justLaunchedUrl) {
      const links = loadLaunchedLinks();

      // Get all launch buttons
      document.querySelectorAll('.launch-btn').forEach(function(btn) {
        const url = btn.getAttribute('href');
        const container = btn.closest('.activity-container');
        const badge = container.querySelector('.launched-badge');

        // Check if this link has been launched
        if (links[url]) {
          badge.classList.remove('d-none');

          // If this is the link that was just launched, scroll to it
          if (justLaunchedUrl && url === justLaunchedUrl) {
            // Keep the button in view after launching
            setTimeout(function() { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
          }
        }
      });

      // Step progress badges are updated in the webpage itself
    }


    function expandAll() {
      // Only target steps (details elements with class step-container)
      var stepDetails = document.querySelectorAll('details.step-container');
      for (var i = 0; i < stepDetails.length; i++) {
        stepDetails[i].setAttribute('open', 'open');
      }
    }

    function collapseAll() {
      // Only target steps (details elements with class step-container)
      var stepDetails = document.querySelectorAll('details.step-container');
      for (var i = 0; i < stepDetails.length; i++) {
        stepDetails[i].removeAttribute('open');
      }
    }

    function searchPathway() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

      // If search is empty, reset view and collapse all
      if (!searchTerm) {
        resetSearch();
        return;
      }

      // Expand all steps for the search (already scoped to step details only)
      expandAll();
      
      // Hide all pause and reflect sections during search
      document.querySelectorAll('.pause-reflect-section').forEach(function(section) {
        section.style.display = 'none';
      });

      // Get all activity containers (bookmarks)
      const activities = document.querySelectorAll('.activity');
      let matchFound = false;
      let matchCount = 0;

      // Loop through all activities to find matches
      activities.forEach(function(activity) {
        // Get the searchable content from this activity
        const titleElement = activity.querySelector('h4') || activity.querySelector('h3'); // Support both h4 (new) and h3 (legacy)
        const title = titleElement && titleElement.textContent ? titleElement.textContent.toLowerCase() : '';
        const descElement = activity.querySelector('h4 + div') || activity.querySelector('h3 + div');
        const description = descElement && descElement.textContent ? descElement.textContent.toLowerCase() : '';
        const contextElement = activity.querySelector('.curatorcontext blockquote');
        const context = contextElement ? contextElement.textContent.toLowerCase() : '';

        // Check if any of the content contains the search term
        const hasMatch = title.indexOf(searchTerm) !== -1 ||
                        description.indexOf(searchTerm) !== -1 ||
                        (context && context.indexOf(searchTerm) !== -1);

        // Show or hide based on match
        if (hasMatch) {
          activity.style.display = 'block';
          matchFound = true;
          matchCount++;

          // Make sure the parent step container is open
          const parentStep = activity.closest('details.step-container');
          if (parentStep) {
            parentStep.setAttribute('open', 'open');
          }

          // Add an accessible label for screen readers to identify this as a search result
          activity.setAttribute('data-search-result', 'true');
          activity.setAttribute('aria-label', 'Search result ' + matchCount + ' for "' + searchTerm + '"');

          // Highlight the matching text
          highlightMatches(activity, searchTerm);
        } else {
          activity.style.display = 'none';
          // Remove the search result attributes if previously set
          activity.removeAttribute('data-search-result');
          activity.removeAttribute('aria-label');
        }
      });

      // Show message if no results found
      const searchResultsMessage = document.getElementById('searchResultsMessage');
      if (searchResultsMessage) {
        if (!matchFound) {
          searchResultsMessage.textContent = 'No matching bookmarks found.';
        } else {
          searchResultsMessage.textContent = 'Found ' + matchCount + ' matching bookmark' + (matchCount !== 1 ? 's' : '') + '.';
        }
      }

      // Focus on the first result if found, otherwise back to the search field
      if (matchFound) {
        const firstResult = document.querySelector('.activity[data-search-result="true"]');
        if (firstResult) {
          // Add a tabindex to make it focusable
          firstResult.tabIndex = -1;
          // Scroll to the first result and focus it
          firstResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function() { firstResult.focus(); }, 300);
        }
      }
    }

    function highlightMatches(element, searchTerm) {
      // Helper function to highlight matches by adding a span with bg-warning class
      // This is not a full text node replacement for simplicity and to preserve styling
      // We only add a visual indicator

      // Get all text nodes in the activity to highlight
      const titles = element.querySelectorAll('h4, h3'); // Support both new and legacy heading elements
      const descriptions = element.querySelectorAll('h4 + div, h3 + div');
      const contexts = element.querySelectorAll('.curatorcontext blockquote');

      // Add highlight classes to parent elements containing the search term
      [titles, descriptions, contexts].forEach(function(nodeList) {
        if (!nodeList) return;

        nodeList.forEach(function(node) {
          if (node && node.textContent.toLowerCase().indexOf(searchTerm) !== -1) {
            node.classList.add('search-highlight');
          } else if (node) {
            node.classList.remove('search-highlight');
          }
        });
      });
    }

    function resetSearch() {
      // Clear highlights
      document.querySelectorAll('.search-highlight').forEach(function(el) {
        el.classList.remove('search-highlight');
      });

      // Show all activities and remove accessibility attributes
      document.querySelectorAll('.activity').forEach(function(activity) {
        activity.style.display = 'block';
        // Remove accessible search result attributes
        activity.removeAttribute('data-search-result');
        activity.removeAttribute('aria-label');
        activity.removeAttribute('tabindex');
      });
      
      // Restore visibility of all pause and reflect sections
      document.querySelectorAll('.pause-reflect-section').forEach(function(section) {
        section.style.display = 'block';
      });

      // Clear any "no results" message
      const searchResultsMessage = document.getElementById('searchResultsMessage');
      if (searchResultsMessage) {
        searchResultsMessage.textContent = '';
        // Announce to screen readers that search has been reset
        searchResultsMessage.setAttribute('aria-live', 'polite');
        setTimeout(function() {
          searchResultsMessage.textContent = 'Search reset. All items are now visible.';
          // Clear the message after announcing
          setTimeout(function() { searchResultsMessage.textContent = ''; }, 2000);
        }, 100);
      }

      // Collapse steps if search was reset deliberately (not just by viewing results)
      if (document.getElementById('searchInput').value.trim() === '') {
        collapseAll();
        // Return focus to search input
        document.getElementById('searchInput').focus();
      }
    }

    // Dark mode functionality
    function toggleDarkMode() {
      document.body.classList.toggle('dark-mode');
      const isDarkMode = document.body.classList.contains('dark-mode');
      localStorage.setItem('curator_dark_mode', isDarkMode ? 'true' : 'false');
      updateDarkModeToggleIcon(isDarkMode);
    }

    function updateDarkModeToggleIcon(isDarkMode) {
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle) {
        darkModeToggle.innerHTML = isDarkMode ?
          '<i class="fa fa-sun" aria-hidden="true"></i>' :
          '<i class="fa fa-moon" aria-hidden="true"></i>';
        darkModeToggle.setAttribute('aria-label', isDarkMode ? 'Switch to light mode' : 'Switch to dark mode');
        darkModeToggle.title = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
      }
    }

    function initDarkMode() {
      // Check for saved preference
      const savedDarkMode = localStorage.getItem('curator_dark_mode');

      // Check for system preference if no saved preference
      const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      // Apply dark mode if saved preference exists or system prefers dark mode
      const shouldBeDark = savedDarkMode === 'true' || (savedDarkMode === null && prefersDarkMode);

      if (shouldBeDark) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }

      updateDarkModeToggleIcon(shouldBeDark);

      // Add dark mode toggle button
      const darkModeToggle = document.createElement('button');
      darkModeToggle.id = 'darkModeToggle';
      darkModeToggle.className = 'btn';
      darkModeToggle.innerHTML = shouldBeDark ?
        '<i class="fa fa-sun" aria-hidden="true"></i>' :
        '<i class="fa fa-moon" aria-hidden="true"></i>';
      darkModeToggle.setAttribute('aria-label', shouldBeDark ? 'Switch to light mode' : 'Switch to dark mode');
      darkModeToggle.title = shouldBeDark ? 'Switch to light mode' : 'Switch to dark mode';
      darkModeToggle.addEventListener('click', toggleDarkMode);

      document.body.appendChild(darkModeToggle);

      // Listen for system preference changes
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
          // Only apply system preference if user hasn't set a preference
          if (localStorage.getItem('curator_dark_mode') === null) {
            const shouldBeDark = e.matches;
            if (shouldBeDark) {
              document.body.classList.add('dark-mode');
            } else {
              document.body.classList.remove('dark-mode');
            }
            updateDarkModeToggleIcon(shouldBeDark);
          }
        });
      }
    }

    // Add event listeners when the document is loaded
    document.addEventListener('DOMContentLoaded', function() {
      const searchInput = document.getElementById('searchInput');
      const resetButton = document.getElementById('resetSearchButton');
      const controlBar = document.getElementById('control-bar');
      const controlBarContainer = document.getElementById('control-bar-container');
      const controlsSpacer = document.getElementById('controls-spacer');

      // Initialize dark mode
      initDarkMode();

      // Store the original position of the control bar
      let controlBarPosition;

      // Get the initial control bar position once the DOM is fully loaded
      setTimeout(() => {
        if (controlBar) {
          controlBarPosition = controlBar.offsetTop;
        }
      }, 100);

      // Function to handle sticky control bar on scroll
      function handleScroll() {
        if (!controlBar || !controlsSpacer || controlBarPosition === undefined) return;

        const scrollTopBtn = document.getElementById('scrollTopBtn');

        if (window.pageYOffset > controlBarPosition) {
          // If we've scrolled past the original position, make it fixed
          controlBar.classList.add('fixed-top');
          controlsSpacer.style.display = 'block';

          // Show the scroll-to-top button when toolbar is stickied
          if (scrollTopBtn) {
            scrollTopBtn.classList.remove('d-none');
          }
        } else {
          // Reset to normal positioning
          controlBar.classList.remove('fixed-top');
          controlsSpacer.style.display = 'none';

          // Hide the scroll-to-top button when toolbar is in normal position
          if (scrollTopBtn) {
            scrollTopBtn.classList.add('d-none');
          }
        }
      }

      // Function to toggle reset button visibility
      function toggleResetButton() {
        if (searchInput.value.trim() === '') {
          resetButton.style.display = 'none';
        } else {
          resetButton.style.display = 'block';
        }
      }

      // Add scroll event listener
      window.addEventListener('scroll', handleScroll, { passive: true });

      // Search input - search on enter key and update reset button visibility
      searchInput.addEventListener('input', function() {
        toggleResetButton();
        if (this.value.trim() === '') {
          resetSearch();
        }
      });

      searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
          searchPathway();
        }
      });

      // Search button
      document.getElementById('searchButton').addEventListener('click', searchPathway);

      // Reset button
      resetButton.addEventListener('click', function() {
        // Clear the search input
        searchInput.value = '';
        // Reset the search
        resetSearch();
        // Hide the reset button
        toggleResetButton();
      });

      // Set up launched link tracking
      setupLaunchTracking();

      // Show badges for already launched links
      updateLaunchedBadges();

      // Initialize the progress bar and step badges
      setTimeout(function() {
        // Slight delay to ensure all DOM elements are ready
        updateProgressBar();

        // Update badges for already launched links
        updateLaunchedBadges();
      }, 200);

      // Initialize the scroll handler
      handleScroll();
    });

    // Function to scroll back to the top of the page
    function scrollToTop() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    // Set up event listeners for launch buttons
    function setupLaunchTracking() {
      document.querySelectorAll('.launch-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          // Don't interrupt the normal link opening
          // but record that this link was launched
          const url = this.getAttribute('href');
          markAsLaunched(url);
        });
      });
    }
    // Step-level progress tracking
    function updateStepProgress() {
      const links = loadLaunchedLinks();
      stepProgressData = {}; // Reset tracking

      // First pass: count all required links and track launched status for each step
      document.querySelectorAll('.step-container').forEach(function(stepContainer) {
        const stepId = stepContainer.id.replace('step-', '');
        const requiredItems = stepContainer.querySelectorAll('.activity-container .activity-badge');
        const totalRequired = requiredItems.length;
        let launchedCount = 0;

        // Count ALL launched links in this step, both required and bonus
        stepContainer.querySelectorAll('.activity-container .launch-btn').forEach(function(launchBtn) {
          const url = launchBtn.getAttribute('href');
          if (links[url]) {
            launchedCount++;
          }
        });

        // Store data for this step
        stepProgressData[stepId] = {
          total: totalRequired,
          launched: launchedCount
        };

        // Find and update the badge for this step
        const badgeSpan = stepContainer.querySelector("summary .badge:first-child");
        if (badgeSpan) {
          badgeSpan.textContent = launchedCount + " Launched";

          // Update color based on progress
          badgeSpan.className = 'badge me-1';

          if (totalRequired > 0) {
            const progress = launchedCount / totalRequired;

            if (progress >= 1) {
              badgeSpan.classList.add('bg-success'); // Completed or exceeded
            } else if (progress > 0) {
              badgeSpan.classList.add('bg-blue'); // In progress
            } else {
              badgeSpan.classList.add('bg-secondary'); // Not started
            }
          } else {
            badgeSpan.classList.add('bg-secondary');
          }
        }
      });
    }

    // Add hooks to update step progress after main progress updates
    document.addEventListener('DOMContentLoaded', function() {
      // Initial update
      updateStepProgress();

      // Hook into markAsLaunched
      const originalMarkAsLaunched = markAsLaunched;
      markAsLaunched = function(url) {
        originalMarkAsLaunched.apply(this, arguments);
        updateStepProgress();
      };
    });
  </script>
</head>
<body>
<div class="moodlecurator container py-4">
  <header class="mb-4">
    <!-- Skip link for keyboard navigation -->
    <a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>

    <div class="header ${p.headerImage ? 'custom-header' : ''} mb-3 rounded-3 d-flex align-items-end" ${p.headerImage ? `style="--custom-header-image: url('${p.headerImage}');"` : ''}>
      <div class="px-3 py-2 bg-dark bg-opacity-75 text-white rounded-bottom w-100">
        <small>Curated pathway</small>
        <h1 class="h2 mb-1 mt-0">${esc(p.name)}</h1>
      </div>
    </div>
    <div>
      ${p.description ? `<div class="lead mb-4 fs-4 prose prose-lg">${esc(p.description)}</div>` : ''}
    </div>
    <div class="text-muted small mb-3">
      ${p.lastUpdated ? `Last updated: ${new Date(p.lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''} | 
      ${p.version ? `Version: ${p.version}` : ''}
    </div>
    ${p.contentWarning ? `
    <details class="mb-4 p-3 bg-warning-subtle rounded-3">
      <summary role="button" aria-expanded="false" tabindex="0" class="text-black">
        <i class="fa fa-exclamation-triangle me-2" aria-hidden="true"></i> Before you proceed...
      </summary>
      <div class="p-3 prose-lg" id="content-warning-text">
        <h3 id="content-warning-heading" class="h6 mb-2">Content Warning</h3>
        <div class="prose">${markdownToHTML(p.contentWarning)}</div>
      </div>
    </details>` : ''}

  </header>

  <!-- Control bar container -->
  <div id="control-bar-container" class="mb-4">
    <!-- This spacer only becomes visible when the control bar is fixed -->
    <div id="controls-spacer" class="controls-spacer"></div>

    <!-- Control bar that will become fixed when scrolling down -->
    <div id="control-bar" class="control-bar w-100">
      <div class="container">
        <!-- Progress Bar (compact version) -->
        <div class="progress-container py-2 mb-2">
          <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center">
              <h6 id="progress-heading" class="mb-0 me-2">Progress:</h6>
              <div class="progress" style="width: 200px; height: 10px;">
                <div id="progress-bar" class="progress-bar" role="progressbar" style="width: 0%"
                     aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="Pathway completion progress"></div>
              </div>
            </div>
            <div class="d-flex align-items-center">
              <span id="progress-counter" class="text-muted small me-2">0 of 0 required</span>
              <span id="progress-percentage" class="badge bg-sagedark" aria-live="polite">0%</span>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="input-group" style="max-width: 400px;" role="search">
              <label for="searchInput" class="visually-hidden">Search pathway content</label>
              <input type="text" id="searchInput" class="form-control" placeholder="Keyword search..."
                aria-label="Search pathway content" aria-describedby="searchResultsMessage">
              <button id="resetSearchButton" class="btn btn-outline-secondary" type="button" style="display: none;"
                aria-label="Clear search">
                <i class="fa fa-times" aria-hidden="true"></i> Reset
              </button>
              <button id="searchButton" class="btn btn-outline-secondary" type="button"
                aria-label="Search pathway">
                <i class="fa fa-search" aria-hidden="true"></i> Search
              </button>
            </div>
            <div id="searchResultsMessage" class="text-muted small mt-1" aria-live="polite"></div>
          </div>
          <div class="btn-group" role="group" aria-label="Pathway navigation controls">
            <button onclick="expandAll()" class="btn btn-outline-secondary" aria-label="Expand all steps">
              Expand All
            </button>
            <button onclick="collapseAll()" class="btn btn-outline-secondary" aria-label="Collapse all steps">
              Collapse All
            </button>
            <button id="scrollTopBtn" onclick="scrollToTop()" class="btn btn-outline-secondary d-none" aria-label="Scroll to top">
              <i class="fa fa-arrow-up" aria-hidden="true"></i> Top
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <main id="main-content">
    ${p.steps.map((st, stepIndex) => {
      // Sort bookmarks into required and bonus
      const required = (st.bookmarks || []).filter(b => !b.type || b.type === 'required' || b.type === 'Required');
      const bonus = (st.bookmarks || []).filter(b => b.type === 'bonus' || b.type === 'Bonus');
      
      return `
      <details class="step-container rounded mb-4" id="step-${stepIndex}">
        <summary role="button" aria-expanded="false" tabindex="0">
          <!-- Add an explicit caret icon for browsers that might hide the native marker -->
          <i class="fa fa-caret-right caret-icon me-2" aria-hidden="true"></i>
          <div class="summary-content">
            <div class="d-flex justify-content-between align-items-center w-100">
              <h3 class="h5 mb-0">${esc(st.name)}</h3>
              <div>
                ${required.length > 0 ? `
                <span class="badge bg-secondary me-1">0 Launched</span>
                <span class="badge bg-sagedark me-1">${required.length} Required</span>` : ''}
                ${bonus.length > 0 ? `<span class="badge bg-sagegreen text-black me-1">${bonus.length} Bonus</span>` : ''}
              </div>
            </div>
            ${st.objective ? `<div class="step-summary text-muted mt-1 prose-lg"><strong>Objective:</strong> ${esc(st.objective)}</div>` : ''}
          </div>
        </summary>
        <div class="step-content">
          <!-- We display the objective in the summary, so no need to repeat it here -->
          
          ${required.map((b, index) => {
            const contentType = b.contentType || 'Read';
            const iconInfo = contentTypeIcons[contentType] || contentTypeIcons['Read'];
            
            return `
            <div class="activity mb-4">
              <div class="activity-container d-flex rounded">
                <div class="activity-icon-container bg-sagedark" aria-hidden="true" role="presentation">
                  <i class="fa ${iconInfo.icon} text-white fa-lg" aria-hidden="true"></i>
                </div>
                <div class="flex-grow-1 px-3 pt-2">
                  <div class="d-flex align-items-center">
                    <div class="badge activity-badge bg-sagedark">Required</div>
                    <div class="badge launched-badge bg-blue d-none" aria-live="polite">
                      <i class="fa fa-check-circle me-1" aria-hidden="true"></i> Launched
                    </div>
                  </div>
                  <h4 class="mt-3 fw-semibold h5">${esc(b.title)}</h4>
                  <div class="prose-lg">${esc(b.description)}</div>
                  ${b.context ? `
                  <div class="curatorcontext">
                    <div class="mt-2 font-italic">Curator says:</div>
                    <blockquote class="prose-lg">${esc(b.context)}</blockquote>
                  </div>` : ''}
                  <div class="d-flex align-items-center flex-wrap">
                    <a class="btn btn-primary text-white my-3 launch-btn" title="Launch this activity"
                      href="${b.url}" rel="noopener noreferrer" target="_blank" aria-label="Launch ${esc(b.title)} (opens in new tab)">
                      Launch <i class="fa fa-external-link-alt ms-1" aria-hidden="true"></i>
                    </a>
                    ${!b.available && b.lastChecked ? `
                    <div class="broken-link-warning" role="alert">
                      <i class="fa fa-exclamation-triangle me-1" aria-hidden="true"></i>
                      This link has been reported and may not launch or otherwise work properly.
                    </div>` : ''}
                  </div>
                </div>
              </div>
            </div>`;
          }).join('')}
          
          ${bonus.length > 0 ? `
          <div class="bonus-section mt-4">
            <h4 class="h5 border-bottom pb-2">Bonus Resources</h4>
            <p>Bonus resources don't count towards your launch progress for this step.</p>
            
            ${bonus.map((b, index) => {
              const contentType = b.contentType || 'Read';
              const iconInfo = contentTypeIcons[contentType] || contentTypeIcons['Read'];
              
              return `
              <div class="activity mb-4">
                <div class="activity-container d-flex rounded border-sagegreen">
                  <div class="activity-icon-container bg-sagegreen" aria-hidden="true" role="presentation">
                    <i class="fa ${iconInfo.icon} text-black fa-lg" aria-hidden="true"></i>
                  </div>
                  <div class="flex-grow-1 px-3 pt-2">
                    <div class="d-flex align-items-center">
                      <div class="badge bg-sagegreen text-black">Bonus</div>
                      <div class="badge launched-badge d-none" aria-live="polite">
                        <i class="fa fa-check-circle me-1" aria-hidden="true"></i> Launched
                      </div>
                    </div>
                    <h4 class="mt-3 fw-semibold h5">${esc(b.title)}</h4>
                    <div class="prose-lg">${esc(b.description)}</div>
                    ${b.context ? `
                    <div class="curatorcontext">
                      <div class="mt-2 font-italic">Curator says:</div>
                      <blockquote class="prose-lg">${esc(b.context)}</blockquote>
                    </div>` : ''}
                    <div class="d-flex align-items-center flex-wrap">
                      <a class="btn btn-primary text-white my-3 launch-btn" title="Launch this activity"
                        href="${b.url}" rel="noopener noreferrer" target="_blank" aria-label="Launch ${esc(b.title)} (opens in new tab)">
                        Launch <i class="fa fa-external-link-alt ms-1" aria-hidden="true"></i>
                      </a>
                      ${!b.available && b.lastChecked ? `
                      <div class="broken-link-warning" role="alert">
                        <i class="fa fa-exclamation-triangle me-1" aria-hidden="true"></i>
                        This link has been reported and may not launch or otherwise work properly.
                      </div>` : ''}
                    </div>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>` : ''}

          ${st.pauseAndReflect ? `
          <div class="pause-reflect-section mt-5 mb-3 p-4 bg-body-tertiary rounded shadow-sm">
            <h4 class="h5 mb-3">
              <i class="fa fa-pause-circle me-2" aria-hidden="true"></i>
              Pause and Reflect
            </h4>
            <div class="pause-reflect-content prose-lg">
              ${markdownToHTML(st.pauseAndReflect)}
            </div>
          </div>` : ''}
        </div>
      </details>`;
    }).join('')}
  </main>

  ${p.acknowledgments ? `
  <footer class="mt-5" role="contentinfo">
    <div class="card mb-4 border-blue">
      <div class="card-header bg-blue text-white">
        <h3 class="h5 mb-0" id="acknowledgments-heading"><i class="fa fa-award me-2" aria-hidden="true"></i>Acknowledgments</h3>
      </div>
      <div class="card-body prose-lg" aria-labelledby="acknowledgments-heading">
        <div class="prose-lg">${markdownToHTML(p.acknowledgments)}</div>
      </div>
    </div>
  </footer>` : ''}
</div>

</body>
</html>`;
}


function sanitize(str='') {
  return str.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
}

// Helper function to open the dashboard
function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

// Helper function to add current page as a bookmark
function addCurrentPageAsBookmark() {
  // get the active tab in the current window
  chrome.tabs.query({ active: true, currentWindow: true }, ([cur]) => {
    if (!cur) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      return;
    }

    // fetch meta‑description from the page
    chrome.scripting.executeScript(
      {
        target: { tabId: cur.id },
        func: () =>
          document.querySelector('meta[name="description"]')?.content || ''
      },
      ([{ result: desc }]) => {
        const params = new URLSearchParams({
          title: cur.title || '',
          url:   cur.url   || '',
          desc:  desc      || ''
        }).toString();

        chrome.tabs.create({
          url: `${chrome.runtime.getURL('popup.html')}?${params}`
        });
      }
    );
  });
}

// Initialize the context menu
function initContextMenu() {
  chrome.contextMenus.create({
    id: "curator-dashboard",
    title: "Open Curator Dashboard",
    contexts: ["all"]
  });
  
  chrome.contextMenus.create({
    id: "curator-add-bookmark",
    title: "Add page to Curator",
    contexts: ["page", "link"]
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "curator-dashboard") {
    openDashboard();
  } else if (info.menuItemId === "curator-add-bookmark") {
    addCurrentPageAsBookmark();
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  addCurrentPageAsBookmark();
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-dashboard") {
    openDashboard();
  } else if (command === "add-bookmark") {
    addCurrentPageAsBookmark();
  }
});

// Check link with authentication
function checkLinkWithAuth(url, auth) {
  return new Promise((resolve) => {
    // Simple URL validation
    if (!url || !url.match(/^https?:\/\//i)) {
      resolve({
        status: null,
        available: false,
        checkError: "Invalid URL format"
      });
      return;
    }
    
    console.log(`Checking link with auth: ${url}`);
    
    // Create the Authorization header
    const base64Credentials = btoa(`${auth.username}:${auth.password}`);
    const authHeader = `Basic ${base64Credentials}`;
    
    try {
      // Use fetch with a timeout via AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Longer timeout for auth
      
      // Try with authentication
      fetch(url, { 
        method: 'GET',  // Use GET for authenticated requests
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'Authorization': authHeader,
          // Add additional headers that might help with some servers
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        },
        // Change from 'include' to 'same-origin' - 'include' can cause issues with some servers
        // For basic auth, the credentials should be in the Authorization header
        credentials: 'same-origin'
      })
      .then(response => {
        clearTimeout(timeoutId);
        
        // Process the response
        console.log(`Auth check response: ${url} - ${response.status}`);
        
        // If we got a good response, mark as available
        if (response.status >= 200 && response.status < 400) {
          resolve({
            status: response.status,
            available: true,
            redirectUrl: response.url !== url ? response.url : null,
            requiresAuth: true,
            authSuccess: true,
            checkMethod: "auth-success"
          });
        } else {
          // We got an error even with auth
          resolve({
            status: response.status,
            available: false,
            requiresAuth: true,
            authSuccess: false,
            checkError: `Authentication failed: ${response.status}`,
            checkMethod: "auth-failed"
          });
        }
      })
      .catch(error => {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          resolve({
            status: null,
            available: false,
            requiresAuth: true,
            checkError: "Authentication request timed out",
            checkMethod: "auth-timeout"
          });
        } else {
          // If the error might be related to auth approach, try alternative method
          if (error.message.includes('failed') || error.message.includes('network') || error.message.includes('abort')) {
            // Try alternative approach for servers like IIS that might handle auth differently
            tryAlternativeAuth(url, auth, resolve);
          } else {
            resolve({
              status: null,
              available: false,
              requiresAuth: true,
              checkError: `Authentication error: ${error.message}`,
              checkMethod: "auth-error"
            });
          }
        }
      });
    } catch (error) {
      resolve({
        status: null,
        available: false,
        requiresAuth: true,
        checkError: `Authentication setup error: ${error.message}`,
        checkMethod: "auth-setup-error"
      });
    }
  });
}

// Alternative auth approach for IIS and other servers that might handle basic auth differently
function tryAlternativeAuth(url, auth, resolve) {
  console.log(`Trying alternative auth method for: ${url}`);
  
  try {
    // Use XMLHttpRequest which sometimes works better with basic auth on certain servers
    const xhr = new XMLHttpRequest();
    
    // Set timeout
    xhr.timeout = 15000;
    
    xhr.onload = function() {
      console.log(`Alternative auth XHR response: ${url} - ${xhr.status}`);
      
      // If we got a good response, mark as available
      if (xhr.status >= 200 && xhr.status < 400) {
        resolve({
          status: xhr.status,
          available: true,
          redirectUrl: xhr.responseURL !== url ? xhr.responseURL : null,
          requiresAuth: true,
          authSuccess: true,
          checkMethod: "auth-success-alternative"
        });
      } else {
        // We got an error even with auth
        resolve({
          status: xhr.status,
          available: false,
          requiresAuth: true,
          authSuccess: false,
          checkError: `Authentication failed: ${xhr.status}`,
          checkMethod: "auth-failed-alternative"
        });
      }
    };
    
    xhr.onerror = function() {
      resolve({
        status: null,
        available: false,
        requiresAuth: true,
        authSuccess: false,
        checkError: "Network error with authentication",
        checkMethod: "auth-error-alternative"
      });
    };
    
    xhr.ontimeout = function() {
      resolve({
        status: null,
        available: false,
        requiresAuth: true,
        checkError: "Authentication request timed out",
        checkMethod: "auth-timeout-alternative"
      });
    };
    
    // Open connection with credentials
    xhr.open('GET', url, true);
    
    // Set auth header
    const base64Credentials = btoa(`${auth.username}:${auth.password}`);
    xhr.setRequestHeader('Authorization', `Basic ${base64Credentials}`);
    
    // Additional headers for compatibility
    xhr.setRequestHeader('Accept', '*/*');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    
    // Send the request
    xhr.send();
  } catch (error) {
    resolve({
      status: null,
      available: false,
      requiresAuth: true,
      checkError: `Alternative auth setup error: ${error.message}`,
      checkMethod: "auth-setup-error-alternative"
    });
  }
}

// Helper to check if a URL matches an exempt domain
function isExemptDomain(url, exemptDomains = []) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check for exact or subdomain matches
    for (const exemptDomain of exemptDomains) {
      const domain = exemptDomain.domain.toLowerCase();
      // Direct match or www. subdomain variation
      if (hostname === domain || 
          hostname === 'www.' + domain || 
          domain === 'www.' + hostname || 
          hostname.endsWith('.' + domain)) {
        return exemptDomain;
      }
    }
  } catch (e) {}
  
  return null;
}

// Link checking service for audit feature
function checkLinkStatus(url) {
  return new Promise((resolve) => {
    // If we're in a context where CSP might prevent fetch, provide clear error
    const handleCspIssue = (error) => {
      if (error.message && (error.message.includes('Content Security Policy') || error.message.includes('CSP'))) {
        console.warn(`CSP blocked request to ${url} - marking as potentially available`);
        resolve({
          status: null,
          available: true, // Assume available since we can't check
          checkError: 'Content Security Policy prevented checking this URL',
          checkMethod: 'csp-blocked'
        });
        return true;
      }
      return false;
    };

    // Simple URL validation
    if (!url || !url.match(/^https?:\/\//i)) {
      resolve({
        status: null,
        available: false,
        checkError: "Invalid URL format"
      });
      return;
    }
    
    console.log(`Checking link: ${url}`);
    
    // First check if this domain is in our exempt list
    chrome.storage.local.get({ exemptDomains: [] }, ({ exemptDomains }) => {
      const exemptDomain = isExemptDomain(url, exemptDomains);
      
      // Last resort - just check if the URL is well-formed
      function urlValidationCheck() {
        // If the domain is exempt, consider it available regardless
        if (exemptDomain) {
          console.log(`URL validation for exempt domain ${url} - treating as available`);
          resolve({
            status: null,
            available: true,
            checkError: `Known site with restricted access: ${exemptDomain.reason}`,
            isExemptDomain: true,
            checkMethod: "exempt-domain-validation"
          });
          return;
        }
        
        // Check if the URL has a valid structure
        const isWellFormedUrl = /^https?:\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_\+.~#?&//=]*$/.test(url);
        
        if (isWellFormedUrl) {
          console.log(`URL validation: ${url} appears to be well-formed, assuming valid`);
          resolve({
            status: null,
            available: true,
            checkError: "Could not verify directly but URL appears valid",
            checkMethod: "url-validation"
          });
        } else {
          console.log(`URL validation: ${url} has an unusual structure, marking as suspicious`);
          resolve({
            status: null,
            available: false,
            checkError: "URL has an unusual structure",
            checkMethod: "url-validation-failed"
          });
        }
      }
      
      // Fall back to no-cors mode to handle CORS restrictions
      function fallbackToNoCors() {
        try {
          // Create a new AbortController for the fallback request
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          fetch(url, { 
            method: 'GET',  // Must use GET with no-cors
            mode: 'no-cors', // This works around CORS but provides limited information
            signal: controller.signal,
            cache: 'no-store'
          })
          .then(response => {
            clearTimeout(timeoutId);
            
            // In no-cors mode, we can't access response details but getting a response is a good sign
            console.log(`Link OK via no-cors: ${url}`);
            resolve({
              status: 200, // We don't get the real status in no-cors mode
              available: true,
              redirectUrl: null, // Can't detect redirects in no-cors mode
              checkMethod: "fetch-no-cors"
            });
          })
          .catch(error => {
            clearTimeout(timeoutId);

            // Check for CSP issues
            if (handleCspIssue(error)) {
              return;
            }

            // If the domain is exempt, consider it available even if we got an error
            if (exemptDomain) {
              console.log(`No-cors error for exempt domain ${url} - treating as available: ${error.message}`);
              resolve({
                status: null,
                available: true,
                checkError: `Known site with restricted access: ${exemptDomain.reason}`,
                isExemptDomain: true,
                checkMethod: "exempt-domain-no-cors-error"
              });
              return;
            }

            if (error.name === 'AbortError') {
              console.log(`Link TIMEOUT via no-cors: ${url}`);
              resolve({
                status: null,
                available: false,
                checkError: "Request timed out",
                checkMethod: "fetch-no-cors-timeout"
              });
            } else {
              // Last resort - check if the URL is well-formed
              console.log(`No-cors fetch failed for ${url}: ${error.message}, checking URL structure`);
              urlValidationCheck();
            }
          });
        } catch (error) {
          // Check for CSP issues
          if (handleCspIssue(error)) {
            return;
          }

          // If the domain is exempt, consider it available even if we got an error
          if (exemptDomain) {
            console.log(`No-cors setup error for exempt domain ${url} - treating as available: ${error.message}`);
            resolve({
              status: null,
              available: true,
              checkError: `Known site with restricted access: ${exemptDomain.reason}`,
              isExemptDomain: true,
              checkMethod: "exempt-domain-no-cors-setup-error"
            });
            return;
          }

          console.log(`Error setting up no-cors fetch for ${url}: ${error.message}`);
          urlValidationCheck();
        }
      }
      
      // For direct checks using fetch API
      function directCheck() {
        try {
          // Use fetch with a timeout via AbortController
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          // First try with normal CORS mode - works for many sites
          fetch(url, { 
            method: 'HEAD',  // Start with HEAD to be faster
            redirect: 'follow',
            signal: controller.signal,
            credentials: 'omit' // Don't send credentials for regular checks
          })
          .then(response => {
            clearTimeout(timeoutId);
            
            // Handle 401/403 responses specially - they mean the link exists but requires authentication
            const isAuthRequired = response.status === 401 || response.status === 403;
            
            // Check if this is an exempt domain that should be considered valid despite error codes
            const isExempt = exemptDomain !== null;
            
            console.log(`Link check via direct fetch: ${url} (${response.status}, auth required: ${isAuthRequired}, exempt: ${isExempt})`);
            
            // Determine if the link should be considered available
            // Links are available if:
            // 1. Response is ok (status 200-299)
            // 2. Requires auth (status 401-403)
            // 3. Is in our exempt domains list (even if it has an error code)
            const isAvailable = response.ok || isAuthRequired || isExempt;
            
            // For exempt domains, don't mark as requiring auth even if status is 401/403
            const requiresAuth = isAuthRequired && !isExempt;
            
            resolve({
              status: response.status,
              available: isAvailable,
              redirectUrl: response.url !== url ? response.url : null,
              checkError: response.ok ? null : 
                        isExempt ? `Known site with restricted access (${response.status}): ${exemptDomain.reason}` :
                        isAuthRequired ? `Requires authentication (${response.status})` : 
                        `HTTP error: ${response.status}`,
              requiresAuth: requiresAuth,
              isExemptDomain: isExempt,
              checkMethod: "fetch-direct"
            });
          })
          .catch(error => {
            clearTimeout(timeoutId);

            // Check for CSP issues
            if (handleCspIssue(error)) {
              return;
            }

            // If the domain is exempt, consider it available even if we got an error
            if (exemptDomain) {
              console.log(`Error for exempt domain ${url} - treating as available: ${error.message}`);
              resolve({
                status: null,
                available: true,
                checkError: `Known site with restricted access: ${exemptDomain.reason}`,
                isExemptDomain: true,
                checkMethod: "exempt-domain-error"
              });
              return;
            }

            if (error.name === 'AbortError') {
              console.log(`Link TIMEOUT via direct fetch: ${url}`);
              resolve({
                status: null,
                available: false,
                checkError: "Request timed out",
                checkMethod: "fetch-timeout"
              });
            } else {
              // Try no-cors as a fallback
              console.log(`Direct fetch error: ${error.message}, trying no-cors mode for ${url}`);
              fallbackToNoCors();
            }
          });
        } catch (error) {
          // Check for CSP issues
          if (handleCspIssue(error)) {
            return;
          }

          // If the domain is exempt, consider it available even if we got an error
          if (exemptDomain) {
            console.log(`Setup error for exempt domain ${url} - treating as available: ${error.message}`);
            resolve({
              status: null,
              available: true,
              checkError: `Known site with restricted access: ${exemptDomain.reason}`,
              isExemptDomain: true,
              checkMethod: "exempt-domain-setup-error"
            });
            return;
          }

          console.log(`Error in direct fetch: ${error.message}, trying no-cors mode for ${url}`);
          fallbackToNoCors();
        }
      }
      
      // Start with a direct fetch check
      directCheck();
    });
  });
}

// No longer needed as we moved the import to the top

// Process all bookmarks to check their status
async function auditLinks(fullAudit = false) {
  // First check if we have permission to access all hosts
  let hasPermission = false;
  try {
    hasPermission = await chrome.permissions.contains({
      origins: ["http://*/*", "https://*/*"]
    });
  } catch (e) {
    console.warn('Unable to check permissions:', e);
  }

  if (!hasPermission) {
    console.warn('Cannot audit links: Missing host permissions. Please grant permissions in extension settings.');
    try {
      // Try to request permissions
      const granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"]
      });
      if (!granted) {
        console.warn('Link audit aborted: User denied host permissions');
        return;
      }
      // If we get here, permissions were granted
      console.log('Host permissions granted, proceeding with audit');
    } catch (e) {
      console.error('Error requesting permissions:', e);
      return;
    }
  }
  
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  
  // Helper to add a delay between link checks
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    // Get basic data from regular storage
    const { pathways, exemptDomains = [] } = await chrome.storage.local.get({ 
      pathways: [],
      exemptDomains: []
    });
    
    // Get auth domains - use unencrypted storage in service worker context
    // This avoids WebCrypto API issues in service workers
    let authDomains = [];
    const authResult = await chrome.storage.local.get({ authDomains: [] });
    authDomains = authResult.authDomains;
    
    let updated = false;
    let linksToCheck = [];
    
    // Helper function to find matching auth domain
    function findMatchingAuthDomain(url) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        
        // Find exact domain match
        let match = authDomains.find(d => d.domain.toLowerCase() === domain);
        if (match) return match;
        
        // Check for subdomain matches (e.g. sub.example.com should match example.com)
        for (const authDomain of authDomains) {
          if (domain.endsWith(`.${authDomain.domain}`) || domain === authDomain.domain) {
            return authDomain;
          }
        }
      } catch (e) {}
      
      return null;
    }
    
    // First, collect all links that need checking
    for (let i = 0; i < pathways.length; i++) {
      const pathway = pathways[i];
      if (!pathway || !pathway.steps) continue;
      
      for (let j = 0; j < pathway.steps.length; j++) {
        const step = pathway.steps[j];
        if (!step || !step.bookmarks) continue;
        
        for (let k = 0; k < step.bookmarks.length; k++) {
          const bookmark = step.bookmarks[k];
          
          // Skip if recently checked (within 7 days) unless doing a full audit
          if (!fullAudit && 
              bookmark.lastChecked && 
              Date.now() - bookmark.lastChecked < 7 * DAY_IN_MS) {
            continue;
          }
          
          // Add to check list
          if (bookmark.url) {
            // Check if there's a matching auth domain
            const authDomain = findMatchingAuthDomain(bookmark.url);
            
            linksToCheck.push({
              pathwayIndex: i,
              stepIndex: j, 
              bookmarkIndex: k,
              url: bookmark.url,
              authDomain // Will be null if no matching domain
            });
          }
        }
      }
    }
    
    console.log(`Total links to check: ${linksToCheck.length}`);
    
    // Now check them with a delay in between
    for (let i = 0; i < linksToCheck.length; i++) {
      const { pathwayIndex, stepIndex, bookmarkIndex, url, authDomain } = linksToCheck[i];
      const bookmark = pathways[pathwayIndex]?.steps[stepIndex]?.bookmarks[bookmarkIndex];
      
      if (!bookmark) continue;
      
      console.log(`Checking link ${i+1}/${linksToCheck.length}: ${url}`);
      
      // Check the link - use auth if available
      let result;
      if (authDomain) {
        console.log(`Using authentication for ${url} with username: ${authDomain.username}`);
        result = await checkLinkWithAuth(url, {
          username: authDomain.username,
          password: authDomain.password
        });
      } else {
        result = await checkLinkStatus(url);
      }
      
      // Check if this bookmark is for an exempt domain (directly check here too)
      const isForExemptDomain = isExemptDomain(url, exemptDomains);
      
      // Update bookmark with results
      bookmark.lastChecked = Date.now();
      bookmark.status = result.status;
      bookmark.available = result.available;
      bookmark.redirectUrl = result.redirectUrl;
      bookmark.checkError = result.checkError;
      bookmark.checkMethod = result.checkMethod; // For debugging
      bookmark.isExemptDomain = !!isForExemptDomain; // Explicitly set exempt status
      bookmark.requiresAuth = isForExemptDomain ? false : (result.requiresAuth || bookmark.requiresAuth);
      bookmark.authSuccess = result.authSuccess;
      
      updated = true;
      
      // Save after every 5 links to preserve progress
      if (i % 5 === 0 || i === linksToCheck.length - 1) {
        try {
          await chrome.storage.local.set({ pathways });
          console.log(`Progress saved: ${i+1}/${linksToCheck.length} links checked`);
        } catch (saveError) {
          console.error('Error saving progress:', saveError);
        }
      }
      
      // Add a delay between checks to prevent overwhelming the browser
      // Skip the delay on the last item
      if (i < linksToCheck.length - 1) {
        await delay(1000); // 1 second delay between link checks
      }
    }
    
    // Final save to ensure everything is persisted
    if (updated) {
      await chrome.storage.local.set({ pathways });
      console.log('Link audit completed and saved');
    } else {
      console.log('No links needed checking');
    }
  } catch (error) {
    console.error('Error auditing links:', error);
  }
}

// Schedule regular link audits
function scheduleAudits() {
  // Check for dead links once a day
  const AUDIT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  // Initial audit a minute after browser starts
  setTimeout(() => auditLinks(), 60 * 1000);
  
  // Regular audits
  setInterval(() => auditLinks(), AUDIT_INTERVAL);
}

// Initialize context menu on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ 
    pathways: [],
    authDomains: [],
    exemptDomains: []
  }, d => {
    if (!Array.isArray(d.pathways)) chrome.storage.local.set({ pathways: [] });
    
    // Initialize the auth domains list if it doesn't exist
    if (!Array.isArray(d.authDomains)) {
      chrome.storage.local.set({ 
        authDomains: []
      });
    }
    
    // Initialize the exempt domains list if it doesn't exist
    // These are domains that return error codes but should be treated as valid
    if (!Array.isArray(d.exemptDomains)) {
      chrome.storage.local.set({ 
        exemptDomains: [
          // Default list of known sites that block automated requests but work in browsers
          { domain: 'quora.com', reason: 'Anti-bot measures, works in browser' },
          { domain: 'medium.com', reason: 'Soft paywall, works in browser' }
        ]
      });
    }
  });
  
  // Create context menu items
  initContextMenu();
  
  // Schedule link audits
  scheduleAudits();
});

// The primary message listener for the extension
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Received message:', msg.type);
  
  // Handle export-related messages
  if (['exportPathway', 'exportPathwayCSV', 'exportStepHTML', 'exportStepCSV'].includes(msg.type)) {
    handleExportMessages(msg, sender, sendResponse);
    return true; // Indicates async response
  }
  
  // Handle link checking and audit messages
  if (msg.type === 'auditAllLinks') {
    auditLinks(true).then(() => sendResponse({success: true}))
      .catch(error => {
        console.error('Error in auditAllLinks:', error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Indicates async response
  } else if (msg.type === 'checkSingleLink' && msg.url) {
    checkLinkStatus(msg.url).then(result => sendResponse(result))
      .catch(error => {
        console.error('Error in checkSingleLink:', error);
        sendResponse({
          available: false, 
          checkError: `Error checking link: ${error.message}`
        });
      });
    return true; // Indicates async response
  } else if (msg.type === 'checkLinkWithAuth' && msg.url && msg.auth) {
    checkLinkWithAuth(msg.url, msg.auth).then(result => sendResponse(result))
      .catch(error => {
        console.error('Error in checkLinkWithAuth:', error);
        sendResponse({
          available: false, 
          requiresAuth: true,
          checkError: `Error checking link with auth: ${error.message}`
        });
      });
    return true; // Indicates async response
  }
  
  // For any other message types, we'll handle synchronously
  return false;
});