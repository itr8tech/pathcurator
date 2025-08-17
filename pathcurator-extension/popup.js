// Popup script for PathCurator extension

document.addEventListener('DOMContentLoaded', async function() {
  const pageTitle = document.getElementById('pageTitle');
  const pageUrl = document.getElementById('pageUrl');
  const shareBtn = document.getElementById('shareBtn');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const manageExtensionBtn = document.getElementById('manageExtensionBtn');
  const statusMessage = document.getElementById('statusMessage');
  const helpLink = document.getElementById('helpLink');

  let currentTab = null;

  // Get current tab information
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    
    if (tab) {
      pageTitle.textContent = tab.title || 'Untitled Page';
      pageUrl.textContent = tab.url || '';
    }
  } catch (error) {
    console.error('Error getting tab info:', error);
    showStatus('Error getting page information', 'error');
  }

  // Handle share button click
  shareBtn.addEventListener('click', async function() {
    if (!currentTab) {
      showStatus('No page selected', 'error');
      return;
    }

    try {
      // Show loading state
      shareBtn.innerHTML = '<span class="loading"></span> Sharing...';
      shareBtn.disabled = true;

      // Get user's PathCurator settings
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';

      // Create the bookmarklet URL with current page data
      const bookmarkletUrl = `${baseUrl}/bookmarklet.html?` + 
        `url=${encodeURIComponent(currentTab.url)}&` +
        `title=${encodeURIComponent(currentTab.title || 'Untitled Page')}&` +
        `source=extension`;

      // Open PathCurator bookmarklet page
      await chrome.tabs.create({
        url: bookmarkletUrl,
        active: true
      });

      // Close popup
      window.close();

    } catch (error) {
      console.error('Error sharing to PathCurator:', error);
      showStatus('Failed to share page', 'error');
      
      // Reset button
      shareBtn.innerHTML = '<span class="icon">📚</span> Share to PathCurator';
      shareBtn.disabled = false;
    }
  });

  // Handle dashboard button click
  openDashboardBtn.addEventListener('click', async function() {
    try {
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
      
      await chrome.tabs.create({
        url: `${baseUrl}/dashboard.html`,
        active: true
      });
      
      window.close();
    } catch (error) {
      console.error('Error opening dashboard:', error);
      showStatus('Failed to open dashboard', 'error');
    }
  });

  // Handle extension settings button
  manageExtensionBtn.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Handle help link
  helpLink.addEventListener('click', async function(e) {
    e.preventDefault();
    try {
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
      
      await chrome.tabs.create({
        url: `${baseUrl}/docs.html#bookmarklet`,
        active: true
      });
      
      window.close();
    } catch (error) {
      console.error('Error opening help:', error);
    }
  });

  // Utility function to show status messages
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.classList.remove('hidden');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }

  // Check if PathCurator is accessible
  async function checkPathCuratorAccess() {
    try {
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
      
      // We'll assume it's accessible since we can't easily do CORS requests from popup
      // The actual check will happen when the user tries to share
      return true;
    } catch (error) {
      return false;
    }
  }
});