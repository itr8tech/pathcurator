// Background service worker for PathCurator extension

// Install event - set default settings
chrome.runtime.onInstalled.addListener(async function(details) {
  console.log('PathCurator extension installed/updated');
  
  // Set default settings
  try {
    const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
    if (!settings.pathcuratorUrl) {
      await chrome.storage.sync.set({
        pathcuratorUrl: 'https://pathcurator.com',
        showNotifications: true,
        autoDetectPathways: true
      });
    }
  } catch (error) {
    console.error('Error setting default settings:', error);
  }

  // Show welcome notification on first install
  if (details.reason === 'install') {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'PathCurator Extension Installed',
        message: 'Click the PathCurator icon in your toolbar to start sharing pages to your learning pathways!'
      });
    } catch (error) {
      // Notifications permission not granted, that's okay
      console.log('Notification permission not available');
    }
  }
});

// Handle extension icon click (fallback for when popup doesn't load)
chrome.action.onClicked.addListener(async function(tab) {
  try {
    const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
    const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
    
    // Create bookmarklet URL with current page data
    const bookmarkletUrl = `${baseUrl}/bookmarklet.html?` + 
      `url=${encodeURIComponent(tab.url)}&` +
      `title=${encodeURIComponent(tab.title || 'Untitled Page')}&` +
      `source=extension`;

    // Open PathCurator bookmarklet page
    await chrome.tabs.create({
      url: bookmarkletUrl,
      active: true
    });
  } catch (error) {
    console.error('Error handling icon click:', error);
  }
});

// Context menu integration (right-click menu)
chrome.runtime.onInstalled.addListener(function() {
  try {
    chrome.contextMenus.create({
      id: 'shareToPathCurator',
      title: 'Share to PathCurator',
      contexts: ['page', 'link', 'selection']
    });

    chrome.contextMenus.create({
      id: 'openDashboard',
      title: 'Open PathCurator Dashboard',
      contexts: ['page']
    });
  } catch (error) {
    console.error('Error creating context menus:', error);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async function(info, tab) {
  try {
    const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
    const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';

    if (info.menuItemId === 'shareToPathCurator') {
      let url = info.linkUrl || tab.url;
      let title = info.selectionText || tab.title || 'Untitled Page';
      
      // If text is selected, use that as the title
      if (info.selectionText && info.selectionText.length > 0) {
        title = info.selectionText.substring(0, 100) + (info.selectionText.length > 100 ? '...' : '');
      }

      const bookmarkletUrl = `${baseUrl}/bookmarklet.html?` + 
        `url=${encodeURIComponent(url)}&` +
        `title=${encodeURIComponent(title)}&` +
        `source=extension`;

      await chrome.tabs.create({
        url: bookmarkletUrl,
        active: true
      });
    } else if (info.menuItemId === 'openDashboard') {
      await chrome.tabs.create({
        url: `${baseUrl}/dashboard.html`,
        active: true
      });
    }
  } catch (error) {
    console.error('Error handling context menu click:', error);
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async function(command) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (command === 'share-to-pathcurator' && tab) {
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
      
      const bookmarkletUrl = `${baseUrl}/bookmarklet.html?` + 
        `url=${encodeURIComponent(tab.url)}&` +
        `title=${encodeURIComponent(tab.title || 'Untitled Page')}&` +
        `source=extension`;

      await chrome.tabs.create({
        url: bookmarkletUrl,
        active: true
      });
    }
  } catch (error) {
    console.error('Error handling keyboard shortcut:', error);
  }
});

// Message passing for popup/content script communication
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title,
          favIconUrl: tabs[0].favIconUrl
        });
      } else {
        sendResponse({ error: 'No active tab found' });
      }
    });
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: request.title || 'PathCurator',
      message: request.message || ''
    });
  }
});