// Web-compatible export functions
// Replaces chrome.runtime.sendMessage exports with direct client-side exports

// Generate RSS feed for a pathway
export function generateRSS(pathway) {
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
    
    const pubDate = new Date(pathway.lastUpdated || pathway.created || Date.now()).toUTCString();
    const buildDate = new Date().toUTCString();
    
    let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>${esc(pathway.name)}</title>
    <description>${esc(pathway.description || `Learning pathway: ${pathway.name}`)}</description>
    <link>pathcurator://pathway/${esc(pathway.id || pathway.name)}</link>
    <atom:link href="pathcurator://pathway/${esc(pathway.id || pathway.name)}/rss" rel="self" type="application/rss+xml" />
    <lastBuildDate>${buildDate}</lastBuildDate>
    <pubDate>${pubDate}</pubDate>
    <generator>Path Curator Extension</generator>
    <language>en-US</language>
    <managingEditor>${esc(pathway.createdBy || 'Unknown')}</managingEditor>
    <webMaster>${esc(pathway.modifiedBy || pathway.createdBy || 'Unknown')}</webMaster>`;
    
    // Add metadata as custom elements
    if (pathway.contentWarning) {
        rss += `
    <contentWarning>${esc(pathway.contentWarning)}</contentWarning>`;
    }
    
    if (pathway.acknowledgments) {
        rss += `
    <acknowledgments>${esc(pathway.acknowledgments)}</acknowledgments>`;
    }
    
    // Collect all bookmarks with creation order and metadata
    const allBookmarks = [];
    // Use pathway creation date as base, or current time if pathway has no date
    const baseTimestamp = pathway.created || Date.now();
    let fallbackTimestamp = baseTimestamp;
    
    if (pathway.steps && pathway.steps.length > 0) {
        pathway.steps.forEach((step, stepIndex) => {
            if (step.bookmarks && step.bookmarks.length > 0) {
                step.bookmarks.forEach((bookmark, bookmarkIndex) => {
                    // Try to get the most specific timestamp available
                    let createdTimestamp = bookmark.created;
                    
                    // If bookmark has no timestamp, create one based on position
                    // Newer bookmarks (later in the list) should get more recent timestamps
                    if (!createdTimestamp) {
                        // Calculate offset: later bookmarks get timestamps closer to now
                        const totalBookmarksEstimate = 100; // Estimate max bookmarks
                        const globalBookmarkIndex = stepIndex * 20 + bookmarkIndex; // Rough global position
                        const hoursAgo = totalBookmarksEstimate - globalBookmarkIndex;
                        
                        // Create timestamp that's X hours before now
                        createdTimestamp = Date.now() - (hoursAgo * 60 * 60 * 1000);
                        
                        console.log(`No timestamp for "${bookmark.title}", assigning ${new Date(createdTimestamp).toLocaleString()} (${hoursAgo} hours ago)`);
                    }
                    
                    allBookmarks.push({
                        ...bookmark,
                        stepName: step.name,
                        stepIndex: stepIndex,
                        bookmarkIndex: bookmarkIndex,
                        stepObjective: step.objective,
                        createdTimestamp: createdTimestamp
                    });
                });
            }
        });
    }
    
    // Sort bookmarks by creation time (newest first)
    allBookmarks.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    
    // Add each bookmark as an RSS item
    allBookmarks.forEach((bookmark, index) => {
        const bookmarkPubDate = new Date(bookmark.createdTimestamp).toUTCString();
        const bookmarkGuid = `${pathway.id || pathway.name}-bookmark-${bookmark.stepIndex}-${bookmark.bookmarkIndex}`;
        const pathwayUrl = `pathcurator://pathway/${esc(pathway.id || pathway.name)}`;
        const stepUrl = `${pathwayUrl}/step/${bookmark.stepIndex}`;
        
        // Create description with context and step info
        let description = '';
        if (bookmark.description) {
            description += `<p>${esc(bookmark.description)}</p>`;
        }
        if (bookmark.context) {
            description += `<p><strong>Context:</strong> ${esc(bookmark.context)}</p>`;
        }
        if (bookmark.stepObjective) {
            description += `<p><strong>Step Objective:</strong> ${esc(bookmark.stepObjective)}</p>`;
        }
        
        const required = bookmark.required !== false ? 'Required' : 'Bonus';
        const contentType = bookmark.contentType || 'Read';
        
        rss += `
    <item>
        <title>${esc(bookmark.title)}</title>
        <description><![CDATA[${description}]]></description>
        <link>${esc(bookmark.url)}</link>
        <guid isPermaLink="false">${esc(bookmarkGuid)}</guid>
        <pubDate>${bookmarkPubDate}</pubDate>
        <category>${contentType}</category>
        <pathwayUrl>${esc(pathwayUrl)}</pathwayUrl>
        <stepName>${esc(bookmark.stepName)}</stepName>
        <stepUrl>${esc(stepUrl)}</stepUrl>
        <required>${required}</required>
        <contentType>${contentType}</contentType>
    </item>`;
    });
    
    rss += `
</channel>
</rss>`;
    
    return rss;
}

// Standalone CSV generation to avoid background.js import chain
function generateCSV(pathway) {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    
    const createdBy = pathway.createdBy || 'Unknown';
    const modifiedBy = pathway.modifiedBy || createdBy;
    
    let csv = 'Step,Name,Objective,Bookmark Title,URL,Description,Context,Type,Content Type,Required\n';
    
    if (pathway.steps && pathway.steps.length > 0) {
        pathway.steps.forEach((step, stepIndex) => {
            const stepNum = stepIndex + 1;
            const stepName = esc(step.name || '');
            const stepObjective = esc(step.objective || '');
            
            if (step.bookmarks && step.bookmarks.length > 0) {
                step.bookmarks.forEach(bookmark => {
                    csv += [
                        stepNum,
                        stepName,
                        stepObjective,
                        esc(bookmark.title || ''),
                        esc(bookmark.url || ''),
                        esc(bookmark.description || ''),
                        esc(bookmark.context || ''),
                        esc(bookmark.type || ''),
                        esc(bookmark.contentType || 'read'),
                        bookmark.required !== false ? 'Yes' : 'No'
                    ].join(',') + '\n';
                });
            } else {
                // Step with no bookmarks
                csv += [
                    stepNum,
                    stepName,
                    stepObjective,
                    '', '', '', '', '', '', ''
                ].join(',') + '\n';
            }
        });
    } else {
        // Pathway with no steps
        csv += '1,"No steps","","","","","","","",""\n';
    }
    
    return csv;
}

// Sophisticated HTML generation for web environment (based on background.js generateHTML)
export function generateSophisticatedHTML(pathway) {
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
    
    const sanitize = s => String(s || '').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    
    // Simple markdown processor
    const markdownToHTML = (text) => {
        if (!text) return '';
        let html = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.+?)\*/g, '<em>$1</em>')
                      .replace(/`(.+?)`/g, '<code>$1</code>')
                      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Handle paragraphs and lists
        return html.split(/\n\s*\n/).map(paragraph => {
            if (paragraph.trim().startsWith('- ')) {
                return '<ul>' + paragraph.split('\n').map(line => {
                    if (line.trim().startsWith('- ')) {
                        return '<li>' + line.trim().substring(2) + '</li>';
                    }
                    return '';
                }).join('') + '</ul>';
            }
            return '<p>' + paragraph + '</p>';
        }).join('');
    };
    
    const createdBy = pathway.createdBy || 'Unknown';
    const modifiedBy = pathway.modifiedBy || createdBy;
    
    const bs = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
    const fa = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
    
    // Define content type icons and classes
    const contentTypeIcons = {
        'Read': {icon: 'fa-book', bgClass: 'bg-sagedark'},
        'Watch': {icon: 'fa-play', bgClass: 'bg-bluegreen'},
        'Listen': {icon: 'fa-headphones', bgClass: 'bg-blue'},
        'Participate': {icon: 'fa-user-group', bgClass: 'bg-blue'}
    };
    
    // Get the curator.css content
    const curatorCss = `/* Custom styles for Curator pathways */
/* Based on existing styles with Bootstrap 5.3 and Font Awesome 6 */

.moodlecurator {
    font-size: 1rem;
    --gov-primary-blue: #234075;
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
}

.moodlecurator blockquote {
    border-left: 3px solid #333;
    margin: 1em;
    padding-left: 1em;
}

.moodlecurator p+ul,
.moodlecurator p+ol {
    margin-top: -0.75rem;
}

.moodlecurator .bg-white {
    background-color: #fff !important;
}

.moodlecurator .mr-1,
.moodlecurator .mx-1 {
    margin-right: 0.25rem !important;
    padding-right: 0 !important;
}

.moodlecurator .object-fit-contain {
    object-fit: contain;
}

.moodlecurator .header {
    background-image: linear-gradient(135deg, #4a6fc0 0%, #2F6173 50%, #357385 100%);
    background-position: center;
    background-size: cover;
    width: 100%;
    height: 10rem;
    background-color: var(--gov-secondary-blue);
}

.moodlecurator .header.custom-header {
    background-image: var(--custom-header-image);
}

.activity-container {
    overflow: hidden;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
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

details.step-container {
    margin-bottom: 1.5rem;
    border-radius: 0.375rem;
    overflow: hidden;
}

details.step-container summary {
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    list-style: none;
}

details.step-container summary::-webkit-details-marker,
details.step-container summary::marker {
    display: none;
}

details.step-container .caret-icon {
    transition: transform 0.2s;
}

details.step-container[open] .caret-icon {
    transform: rotate(90deg);
}

details.step-container .summary-content {
    flex: 1;
}

details.step-container .step-content {
    padding: 1rem;
}

.step-objective {
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

.pause-reflect-section {
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

.control-bar {
    padding: 15px 0;
    box-shadow: 0 2px 5px rgba(0,0,0,0.08);
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

.controls-spacer {
    display: none;
    height: 120px;
}

.progress-container {
    background-color: transparent;
}

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
}

.search-highlight {
    background-color: rgba(255, 193, 7, 0.45);
    border-radius: 0.25rem;
    padding: 0.125rem 0;
    outline: 1px solid #d39e00;
}


.badge.launched-badge {
    color: white;
    margin-left: 0.25rem;
}

.launched-badge.d-none {
    display: none !important;
}

#scrollTopBtn {
    margin-left: 0.5rem;
    transition: opacity 0.3s ease-in-out;
}

#scrollTopBtn.d-none {
    display: none !important;
}

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

.moodlecurator hr {
    margin: 1.5rem 0;
    border: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.moodlecurator img {
    max-width: 100%;
    height: auto;
    border-radius: 0.375rem;
    margin: 1rem 0;
}

#darkModeToggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1040;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: #343a40;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    border: 2px solid #dee2e6;
    transition: all 0.3s ease;
}

#darkModeToggle:hover {
    transform: scale(1.05);
    background-color: #495057;
    border-color: #ced4da;
}

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
}`;

    // Generate the HTML structure
    let html = `<!doctype html>
<html lang="en" data-bs-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="author" content="${esc(createdBy)}">
  <meta name="modified-by" content="${esc(modifiedBy)}">
  <meta name="description" content="${esc(pathway.description || '')}">
  <meta name="generator" content="Curator Extension">
  <meta name="created" content="${new Date(pathway.created || Date.now()).toISOString()}">
  ${pathway.lastUpdated ? `<meta name="last-updated" content="${new Date(pathway.lastUpdated).toISOString()}">` : ''}
  ${pathway.version ? `<meta name="version" content="${esc(pathway.version)}">` : ''}
  <title>${esc(pathway.name)}</title>
  <link href="${bs}" rel="stylesheet">
  <link href="${fa}" rel="stylesheet">
  <link rel="alternate" type="application/rss+xml" title="${esc(pathway.name)} RSS Feed" href="${sanitize(pathway.name)}.rss">
  <style>
    ${curatorCss}
  </style>
  <script>
    // Track launched links in localStorage
    const LAUNCHED_LINKS_KEY = 'curator_launched_links_${sanitize(pathway.name)}';
    
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
      
      document.querySelectorAll('.activity-container').forEach(container => {
        const badgeArea = container.querySelector('.bookmark-badges');
        const requiredBadge = badgeArea.querySelector('.badge.text-bg-primary');
        if (requiredBadge && requiredBadge.textContent.trim() === 'Required') {
          totalRequired++;
          const launchBtn = container.querySelector('.launch-btn');
          if (launchBtn && links[launchBtn.getAttribute('href')]) {
            completedRequired++;
          }
        }
      });
      
      const progressBar = document.getElementById('progress-bar');
      const progressCounter = document.getElementById('progress-counter');
      const progressPercentage = document.getElementById('progress-percentage');
      const progressContainer = document.querySelector('.progress-container');
      
      if (progressBar && progressCounter && progressPercentage && progressContainer) {
        const percentage = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;
        
        progressBar.style.width = percentage + '%';
        progressBar.setAttribute('aria-valuenow', percentage);
        progressCounter.textContent = completedRequired + ' of ' + totalRequired + ' required';
        progressPercentage.textContent = percentage + '%';
        
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
      updateLaunchedBadges(url);
      updateProgressBar();
    }
    
    // Update the UI to show which links have been launched
    function updateLaunchedBadges(justLaunchedUrl) {
      const links = loadLaunchedLinks();
      
      document.querySelectorAll('.launch-btn').forEach(function(btn) {
        const url = btn.getAttribute('href');
        const container = btn.closest('.activity-container');
        const badge = container.querySelector('.launched-badge');
        
        if (links[url] && badge) {
          badge.classList.remove('d-none');
          
          if (justLaunchedUrl && url === justLaunchedUrl) {
            setTimeout(function() { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
          }
        }
      });
    }
    
    function expandAll() {
      var stepDetails = document.querySelectorAll('.step-container details');
      for (var i = 0; i < stepDetails.length; i++) {
        stepDetails[i].setAttribute('open', 'open');
      }
    }
    
    function collapseAll() {
      var stepDetails = document.querySelectorAll('.step-container details');
      for (var i = 0; i < stepDetails.length; i++) {
        stepDetails[i].removeAttribute('open');
      }
    }
    
    function searchPathway() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
      
      if (!searchTerm) {
        resetSearch();
        return;
      }
      
      expandAll();
      
      document.querySelectorAll('.pause-reflect-section').forEach(function(section) {
        section.style.display = 'none';
      });
      
      const activities = document.querySelectorAll('article');
      let matchFound = false;
      let matchCount = 0;
      
      activities.forEach(function(articleElement) {
        const activity = articleElement.querySelector('.activity');
        if (!activity) return;
        
        const titleElement = activity.querySelector('h3');
        const title = titleElement && titleElement.textContent ? titleElement.textContent.toLowerCase() : '';
        
        // Get all text content from description and context areas
        const allText = activity.textContent ? activity.textContent.toLowerCase() : '';
        
        const hasMatch = title.indexOf(searchTerm) !== -1 || allText.indexOf(searchTerm) !== -1;
        
        if (hasMatch) {
          articleElement.style.display = '';
          matchFound = true;
          matchCount++;
          
          const parentStep = articleElement.closest('.step-container');
          if (parentStep) {
            const details = parentStep.querySelector('details');
            if (details) {
              details.setAttribute('open', 'open');
            }
          }
          
          articleElement.setAttribute('data-search-result', 'true');
          articleElement.setAttribute('aria-label', 'Search result ' + matchCount + ' for "' + searchTerm + '"');
          
          highlightMatches(activity, searchTerm);
        } else {
          articleElement.style.display = 'none';
          articleElement.removeAttribute('data-search-result');
          articleElement.removeAttribute('aria-label');
        }
      });
      
      // Hide steps that have no visible bookmarks
      document.querySelectorAll('.step-container').forEach(function(stepContainer) {
        const visibleArticles = stepContainer.querySelectorAll('article:not([style*="display: none"])');
        const stepSection = stepContainer;
        
        if (visibleArticles.length === 0) {
          stepSection.style.display = 'none';
        } else {
          stepSection.style.display = '';
          // Ensure the step is open if it has matches
          const details = stepSection.querySelector('details');
          if (details) {
            details.setAttribute('open', 'open');
          }
        }
      });
      
      const searchResultsMessage = document.getElementById('searchResultsMessage');
      if (searchResultsMessage) {
        if (!matchFound) {
          searchResultsMessage.textContent = 'No matching bookmarks found.';
        } else {
          searchResultsMessage.textContent = 'Found ' + matchCount + ' matching bookmark' + (matchCount !== 1 ? 's' : '') + '.';
        }
      }
      
      if (matchFound) {
        const firstResult = document.querySelector('article[data-search-result="true"]');
        if (firstResult) {
          firstResult.tabIndex = -1;
          firstResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function() { firstResult.focus(); }, 300);
        }
      }
    }
    
    function highlightMatches(element, searchTerm) {
      const titles = element.querySelectorAll('h4, h3');
      const descriptions = element.querySelectorAll('h4 + div, h3 + div');
      const contexts = element.querySelectorAll('.curatorcontext blockquote');
      
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
      document.querySelectorAll('.search-highlight').forEach(function(el) {
        el.classList.remove('search-highlight');
      });
      
      document.querySelectorAll('article').forEach(function(articleElement) {
        articleElement.style.display = '';
        articleElement.removeAttribute('data-search-result');
        articleElement.removeAttribute('aria-label');
        articleElement.removeAttribute('tabindex');
      });
      
      // Show all steps again
      document.querySelectorAll('.step-container').forEach(function(stepContainer) {
        stepContainer.style.display = '';
      });
      
      document.querySelectorAll('.pause-reflect-section').forEach(function(section) {
        section.style.display = 'block';
      });
      
      const searchResultsMessage = document.getElementById('searchResultsMessage');
      if (searchResultsMessage) {
        searchResultsMessage.textContent = '';
        searchResultsMessage.setAttribute('aria-live', 'polite');
        setTimeout(function() {
          searchResultsMessage.textContent = 'Search reset. All items are now visible.';
          setTimeout(function() { searchResultsMessage.textContent = ''; }, 2000);
        }, 100);
      }
      
      if (document.getElementById('searchInput').value.trim() === '') {
        collapseAll();
        document.getElementById('searchInput').focus();
      }
    }
    
    // Dark mode functionality
    function toggleDarkMode() {
      const currentTheme = document.documentElement.getAttribute('data-bs-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', newTheme);
      localStorage.setItem('curator_dark_mode', newTheme === 'dark' ? 'true' : 'false');
      updateDarkModeToggleIcon(newTheme === 'dark');
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
      const savedDarkMode = localStorage.getItem('curator_dark_mode');
      const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = savedDarkMode === 'true' || (savedDarkMode === null && prefersDarkMode);
      
      document.documentElement.setAttribute('data-bs-theme', shouldBeDark ? 'dark' : 'light');
      
      updateDarkModeToggleIcon(shouldBeDark);
      
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
      
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
          if (localStorage.getItem('curator_dark_mode') === null) {
            const shouldBeDark = e.matches;
            document.documentElement.setAttribute('data-bs-theme', shouldBeDark ? 'dark' : 'light');
            updateDarkModeToggleIcon(shouldBeDark);
          }
        });
      }
    }
    
    // Track launch function for onclick handlers
    function trackLaunch(element) {
      const url = element.getAttribute('href');
      const stepIndex = element.getAttribute('data-step');
      const bookmarkIndex = element.getAttribute('data-bookmark');
      
      markAsLaunched(url);
      updateStepBadges();
    }
    
    // Update step badges with launched counts
    function updateStepBadges() {
      const links = loadLaunchedLinks();
      
      document.querySelectorAll('.step-container').forEach(function(stepContainer, stepIndex) {
        const launchedBadge = stepContainer.querySelector('.badge.text-bg-success');
        const stepContent = stepContainer.querySelector('.step-content');
        const launchButtons = stepContent.querySelectorAll('.launch-btn');
        
        let launchedCount = 0;
        launchButtons.forEach(function(btn) {
          const url = btn.getAttribute('href');
          if (links[url]) {
            launchedCount++;
            
            // Update individual bookmark badge
            const bookmarkContainer = btn.closest('.activity');
            const badgeArea = bookmarkContainer.querySelector('.bookmark-badges');
            const existingLaunchedBadge = badgeArea.querySelector('.badge.text-bg-success');
            
            if (!existingLaunchedBadge) {
              badgeArea.innerHTML += '<span class="badge text-bg-success ms-1">✓ Launched</span>';
            }
          }
        });
        
        // Update or add launched badge in step header
        const badgeContainer = stepContainer.querySelector('.summary-content .ms-3');
        const existingLaunchedBadge = badgeContainer.querySelector('.text-bg-success');
        
        if (launchedCount > 0) {
          if (existingLaunchedBadge) {
            existingLaunchedBadge.textContent = launchedCount + ' Launched';
          } else {
            badgeContainer.innerHTML += '<span class="badge text-bg-success">' + launchedCount + ' Launched</span>';
          }
        } else if (existingLaunchedBadge) {
          existingLaunchedBadge.remove();
        }
      });
    }
    
    // Set up event listeners for launch buttons
    function setupLaunchTracking() {
      document.querySelectorAll('.launch-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          const url = this.getAttribute('href');
          markAsLaunched(url);
          updateStepBadges();
        });
      });
    }
    
    function scrollToTop() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
    
    // Add event listeners when the document is loaded
    document.addEventListener('DOMContentLoaded', function() {
      const searchInput = document.getElementById('searchInput');
      const resetButton = document.getElementById('resetSearchButton');
      const controlBar = document.getElementById('control-bar');
      const controlsSpacer = document.getElementById('controls-spacer');
      
      initDarkMode();
      
      let controlBarPosition;
      
      setTimeout(() => {
        if (controlBar) {
          controlBarPosition = controlBar.offsetTop;
        }
      }, 100);
      
      function handleScroll() {
        if (!controlBar || !controlsSpacer || controlBarPosition === undefined) return;
        
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        
        if (window.pageYOffset > controlBarPosition) {
          controlBar.classList.add('fixed-top');
          controlsSpacer.style.display = 'block';
          
          if (scrollTopBtn) {
            scrollTopBtn.classList.remove('d-none');
          }
        } else {
          controlBar.classList.remove('fixed-top');
          controlsSpacer.style.display = 'none';
          
          if (scrollTopBtn) {
            scrollTopBtn.classList.add('d-none');
          }
        }
      }
      
      function toggleResetButton() {
        if (searchInput.value.trim() === '') {
          resetButton.style.display = 'none';
        } else {
          resetButton.style.display = 'block';
        }
      }
      
      window.addEventListener('scroll', handleScroll, { passive: true });
      
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
      
      document.getElementById('searchButton').addEventListener('click', searchPathway);
      
      resetButton.addEventListener('click', function() {
        searchInput.value = '';
        resetSearch();
        toggleResetButton();
      });
      
      setupLaunchTracking();
      updateLaunchedBadges();
      updateStepBadges();
      
      setTimeout(function() {
        updateProgressBar();
        updateLaunchedBadges();
        updateStepBadges();
      }, 200);
      
      handleScroll();
    });
  </script>
</head>
<body>
<div class="moodlecurator container py-4">
  <header class="mb-4">
    <a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>
    
    <div class="header ${pathway.headerImage ? 'custom-header' : ''} mb-3 rounded-3 d-flex align-items-end" ${pathway.headerImage ? `style="--custom-header-image: url('${pathway.headerImage}');"` : ''}>
      <div class="px-3 py-2 bg-dark bg-opacity-75 text-white rounded-bottom w-100">
        <small>Curated pathway</small>
        <h1 class="h2 mb-1 mt-0">${esc(pathway.name)}</h1>
      </div>
    </div>
    <div>
      ${pathway.description ? `<div class="lead mb-4 fs-4 prose prose-lg">${markdownToHTML(pathway.description)}</div>` : ''}
    </div>
    <div class="text-body-secondary small mb-3">
      ${pathway.lastUpdated ? `Last updated: ${new Date(pathway.lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''} | 
      ${pathway.version ? `Version: ${pathway.version}` : ''}
    </div>
    ${pathway.contentWarning ? `
    <section class="mb-4 p-3 bg-body-tertiary rounded-3" role="region" aria-labelledby="content-warning-heading">
      <details>
        <summary role="button" aria-expanded="false" class="text-body-emphasis" aria-describedby="content-warning-description">
          <i class="fa fa-exclamation-triangle me-2" aria-hidden="true"></i> Before you proceed...
        </summary>
        <div id="content-warning-description" class="visually-hidden">Click to read important content warnings for this pathway</div>
        <div class="p-3 prose-lg" id="content-warning-text">
          <h2 id="content-warning-heading" class="h6 mb-2">Content Warning</h2>
          <div class="prose">${markdownToHTML(pathway.contentWarning)}</div>
        </div>
      </details>
    </section>` : ''}
  </header>
  
  <!-- Control bar container -->
  <div id="control-bar-container" class="mb-4">
    <div id="controls-spacer" class="controls-spacer"></div>
    
    <div id="control-bar" class="control-bar w-100 bg-body border-bottom">
      <div class="container">
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
              <span id="progress-counter" class="text-body-secondary small me-2">0 of 0 required</span>
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
            <div id="searchResultsMessage" class="text-body-secondary small mt-1" aria-live="polite"></div>
          </div>
          <div class="btn-group" role="group" aria-label="Pathway navigation controls">
            <button onclick="expandAll()" class="btn btn-outline-secondary" aria-label="Expand all steps">
              Expand All
            </button>
            <button onclick="collapseAll()" class="btn btn-outline-secondary" aria-label="Collapse all steps">
              Collapse All
            </button>
            <button id="scrollTopBtn" onclick="scrollToTop()" class="btn btn-outline-secondary d-none"
              aria-label="Scroll to top">
              <i class="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <main id="main-content">`;
  
  // Add steps
  if (pathway.steps && pathway.steps.length > 0) {
    pathway.steps.forEach((step, stepIndex) => {
      const stepId = `step-${stepIndex + 1}`;
      const requiredCount = step.bookmarks ? step.bookmarks.filter(b => b.required !== false).length : 0;
      const bonusCount = step.bookmarks ? step.bookmarks.filter(b => b.required === false).length : 0;
      const launchedCount = step.bookmarks ? step.bookmarks.filter(b => b.visited).length : 0;
      
      html += `
    <section class="step-container border rounded shadow-sm mb-3" id="${stepId}">
      <details>
        <summary class="fw-semibold p-3 bg-body-tertiary border-bottom" role="button" aria-expanded="false" aria-controls="${stepId}-content">
        <div class="summary-content">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <h2 class="h5 mb-1" id="${stepId}-heading">Step ${stepIndex + 1}: ${esc(step.name)}</h2>
              ${step.objective ? `<div class="step-summary text-body-secondary small">${esc(step.objective)}</div>` : ''}
            </div>
            <div class="ms-3 d-flex align-items-center gap-2">
              ${requiredCount > 0 ? `<span class="badge text-bg-primary">${requiredCount} Required</span>` : ''}
              ${bonusCount > 0 ? `<span class="badge text-bg-secondary">${bonusCount} Bonus</span>` : ''}
              ${launchedCount > 0 ? `<span class="badge text-bg-success">${launchedCount} Launched</span>` : ''}
            </div>
          </div>
        </div>
      </summary>
      <div class="step-content p-4" id="${stepId}-content" aria-labelledby="${stepId}-heading">
        ${step.objective ? `<div class="step-objective bg-body-tertiary p-3 rounded mb-4 border-start border-4 border-primary">
          <h6 class="fw-semibold mb-2"><i class="fa fa-target me-2"></i>Objective</h6>
          <div class="fst-italic">${markdownToHTML(step.objective)}</div>
        </div>` : ''}
        
        <div class="row">`;
      
      if (step.bookmarks && step.bookmarks.length > 0) {
        step.bookmarks.forEach((bookmark, bookmarkIndex) => {
          const contentType = bookmark.contentType || 'Read';
          const isRequired = bookmark.required !== false;
          const icon = contentTypeIcons[contentType] ? contentTypeIcons[contentType].icon : 'fa-book';
          const bgClass = contentTypeIcons[contentType] ? contentTypeIcons[contentType].bgClass : 'bg-sagedark';
          
          html += `
          <article class="col-md-12 mb-3">
            <div class="activity-container d-flex border rounded bg-body-tertiary">
              <div class="activity-icon-container bg-primary d-flex align-items-center justify-content-center p-3" aria-hidden="true" style="width: 60px;">
                <i class="fa ${icon} text-white" aria-hidden="true"></i>
              </div>
              <div class="flex-grow-1 p-3">
                <div class="activity">
                  <h3 class="mb-2">${esc(bookmark.title)}</h3>
                  ${bookmark.description ? `<div class="mb-2">${markdownToHTML(bookmark.description)}</div>` : ''}
                  ${bookmark.context ? `<div class="curatorcontext"><blockquote class="mb-2">${markdownToHTML(bookmark.context)}</blockquote></div>` : ''}
                  
                  <div class="bookmark-badges mb-2">
                    <span class="badge ${isRequired ? 'text-bg-primary' : 'text-bg-secondary'}">${isRequired ? 'Required' : 'Bonus'}</span>
                    ${bookmark.visited ? '<span class="badge text-bg-success ms-1">✓ Launched</span>' : ''}
                  </div>
                  <a href="${esc(bookmark.url)}" target="_blank" rel="noopener noreferrer"
                     class="btn btn-success btn-lg launch-btn"
                     onclick="trackLaunch(this)"
                     data-step="${stepIndex}" 
                     data-bookmark="${bookmarkIndex}"
                     aria-label="Launch ${esc(bookmark.title)} (opens in new tab)">
                    Launch <i class="fa fa-external-link-alt ms-1" aria-hidden="true"></i>
                  </a>
                </div>
              </div>
            </div>
          </article>`;
        });
      } else {
        html += `
          <div class="col-12">
            <p class="text-body-secondary">No bookmarks in this step.</p>
          </div>`;
      }
      
      html += `
        </div>
        
        ${step.pauseAndReflect ? `
        <section class="pause-reflect-section bg-body-tertiary p-3 rounded mt-4 border-start border-4 border-warning" role="region" aria-labelledby="pause-reflect-${stepIndex}">
          <h6 id="pause-reflect-${stepIndex}" class="fw-semibold mb-3"><i class="fa fa-journal-text me-2" aria-hidden="true"></i>Pause and Reflect</h6>
          <div class="pause-reflect-content">${markdownToHTML(step.pauseAndReflect)}</div>
        </section>
        ` : ''}
      </div>
    </details>
    </section>`;
    });
  } else {
    html += '<p class="text-body-secondary">No steps in this pathway.</p>';
  }
  
  html += `
  </main>
  
  <footer class="mt-5 pt-4 border-top text-body-secondary small" role="contentinfo">
    ${pathway.acknowledgments ? `
    <section aria-labelledby="acknowledgments-heading">
      <h2 id="acknowledgments-heading" class="h6 mb-3">Acknowledgments</h2>
      <div class="prose mb-3">${markdownToHTML(pathway.acknowledgments)}</div>
    </section>` : ''}
    <div class="pathway-metadata">
      <p>Created by: ${esc(createdBy)}</p>
      ${modifiedBy !== createdBy ? `<p>Modified by: ${esc(modifiedBy)}</p>` : ''}
      <p>Generated on: <time datetime="${new Date().toISOString()}">${new Date().toLocaleDateString()}</time></p>
    </div>
  </footer>
</div>
</body>
</html>`;
  
  return html;
}

function getContentIcon(contentType) {
    const icons = {
        'read': 'fa-book',
        'watch': 'fa-play',
        'listen': 'fa-headphones',
        'participate': 'fa-user-group'
    };
    return icons[contentType.toLowerCase()] || 'fa-book';
}

// Helper function to trigger file download
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Sanitize filename
function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
}

// Export pathway as HTML
export async function exportPathwayAsHTML(pathway) {
    try {
        console.log('Exporting pathway as HTML:', pathway.name);
        const html = generateSophisticatedHTML(pathway);
        const filename = `${sanitizeFilename(pathway.name)}.html`;
        downloadFile(html, filename, 'text/html');
        return { success: true };
    } catch (error) {
        console.error('HTML export error:', error);
        return { success: false, error: error.message };
    }
}

// Export pathway as HTML with RSS feed
export async function exportPathwayAsHTMLWithRSS(pathway) {
    try {
        console.log('Exporting pathway as HTML with RSS:', pathway.name);
        
        // Generate both HTML and RSS
        const html = generateSophisticatedHTML(pathway);
        const rss = generateRSS(pathway);
        
        // Download both files (HTML already includes RSS auto-discovery link)
        const htmlFilename = `${sanitizeFilename(pathway.name)}.html`;
        const rssFilename = `${sanitizeFilename(pathway.name)}.rss`;
        downloadFile(html, htmlFilename, 'text/html');
        
        // Small delay to ensure downloads don't conflict
        setTimeout(() => {
            downloadFile(rss, rssFilename, 'application/rss+xml');
        }, 100);
        
        return { success: true, message: 'Downloaded HTML and RSS files' };
    } catch (error) {
        console.error('HTML with RSS export error:', error);
        return { success: false, error: error.message };
    }
}

// Export pathway as RSS feed only
export function exportPathwayAsRSS(pathway) {
    try {
        console.log('Exporting pathway as RSS:', pathway.name);
        const rss = generateRSS(pathway);
        const filename = `${sanitizeFilename(pathway.name)}.rss`;
        downloadFile(rss, filename, 'application/rss+xml');
        return { success: true };
    } catch (error) {
        console.error('RSS export error:', error);
        return { success: false, error: error.message };
    }
}

// Export pathway as CSV
export function exportPathwayAsCSV(pathway) {
    try {
        console.log('Exporting pathway as CSV:', pathway.name);
        const csv = generateCSV(pathway);
        console.log('Generated CSV length:', csv.length);
        console.log('CSV preview:', csv.substring(0, 200));
        const filename = `${sanitizeFilename(pathway.name)}.csv`;
        downloadFile(csv, filename, 'text/csv');
        return { success: true };
    } catch (error) {
        console.error('CSV export error:', error);
        return { success: false, error: error.message };
    }
}

// Export pathway as JSON
export function exportPathwayAsJSON(pathway) {
    try {
        console.log('Exporting pathway as JSON:', pathway.name);
        const json = JSON.stringify(pathway, null, 2);
        const filename = `${sanitizeFilename(pathway.name)}.json`;
        downloadFile(json, filename, 'application/json');
        return { success: true };
    } catch (error) {
        console.error('JSON export error:', error);
        return { success: false, error: error.message };
    }
}

// Export step as HTML
export async function exportStepAsHTML(pathway, stepIndex) {
    try {
        if (!pathway.steps || stepIndex >= pathway.steps.length) {
            throw new Error('Step not found');
        }
        
        const step = pathway.steps[stepIndex];
        console.log('Exporting step as HTML:', step.name);
        
        // Create a simplified pathway with just this step
        const stepAsPathway = {
            name: `${pathway.name} - ${step.name}`,
            description: step.objective || '',
            steps: [step],
            createdBy: pathway.createdBy,
            modifiedBy: pathway.modifiedBy,
            created: pathway.created,
            lastUpdated: pathway.lastUpdated,
            version: pathway.version
        };
        
        const html = generateSophisticatedHTML(stepAsPathway);
        const filename = `${sanitizeFilename(pathway.name)}_step_${sanitizeFilename(step.name)}.html`;
        downloadFile(html, filename, 'text/html');
        return { success: true };
    } catch (error) {
        console.error('Step HTML export error:', error);
        return { success: false, error: error.message };
    }
}

// Export step as CSV
export function exportStepAsCSV(pathway, stepIndex) {
    try {
        if (!pathway.steps || stepIndex >= pathway.steps.length) {
            throw new Error('Step not found');
        }
        
        const step = pathway.steps[stepIndex];
        console.log('Exporting step as CSV:', step.name);
        
        // Create a simplified pathway with just this step
        const stepAsPathway = {
            name: `${pathway.name} - ${step.name}`,
            steps: [step],
            createdBy: pathway.createdBy,
            modifiedBy: pathway.modifiedBy
        };
        
        const csv = generateCSV(stepAsPathway);
        const filename = `${sanitizeFilename(pathway.name)}_step_${sanitizeFilename(step.name)}.csv`;
        downloadFile(csv, filename, 'text/csv');
        return { success: true };
    } catch (error) {
        console.error('Step CSV export error:', error);
        return { success: false, error: error.message };
    }
}

// Export step as JSON
export function exportStepAsJSON(pathway, stepIndex) {
    try {
        if (!pathway.steps || stepIndex >= pathway.steps.length) {
            throw new Error('Step not found');
        }
        
        const step = pathway.steps[stepIndex];
        console.log('Exporting step as JSON:', step.name);
        const json = JSON.stringify(step, null, 2);
        const filename = `${sanitizeFilename(pathway.name)}_step_${sanitizeFilename(step.name)}.json`;
        downloadFile(json, filename, 'application/json');
        return { success: true };
    } catch (error) {
        console.error('Step JSON export error:', error);
        return { success: false, error: error.message };
    }
}