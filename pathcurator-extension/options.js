// Options page script for PathCurator extension

document.addEventListener('DOMContentLoaded', async function() {
  const pathcuratorUrlInput = document.getElementById('pathcuratorUrl');
  const showNotificationsCheckbox = document.getElementById('showNotifications');
  const enableKeyboardShortcutsCheckbox = document.getElementById('enableKeyboardShortcuts');
  const saveBtn = document.getElementById('saveBtn');
  const statusMessage = document.getElementById('statusMessage');
  const helpLink = document.getElementById('helpLink');
  const feedbackLink = document.getElementById('feedbackLink');

  // Load saved settings
  try {
    const settings = await chrome.storage.sync.get([
      'pathcuratorUrl',
      'showNotifications',
      'enableKeyboardShortcuts'
    ]);

    pathcuratorUrlInput.value = settings.pathcuratorUrl || 'https://pathcurator.com';
    showNotificationsCheckbox.checked = settings.showNotifications !== false;
    enableKeyboardShortcutsCheckbox.checked = settings.enableKeyboardShortcuts !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }

  // Save settings
  saveBtn.addEventListener('click', async function() {
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      // Validate URL
      const url = pathcuratorUrlInput.value.trim();
      if (!url) {
        throw new Error('PathCurator URL is required');
      }

      // Ensure URL has protocol
      let validUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
      }

      // Remove trailing slash
      validUrl = validUrl.replace(/\/$/, '');

      // Validate URL format
      try {
        new URL(validUrl);
      } catch {
        throw new Error('Please enter a valid URL');
      }

      // Save settings
      await chrome.storage.sync.set({
        pathcuratorUrl: validUrl,
        showNotifications: showNotificationsCheckbox.checked,
        enableKeyboardShortcuts: enableKeyboardShortcutsCheckbox.checked
      });

      // Update URL input with normalized value
      pathcuratorUrlInput.value = validUrl;

      showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus(error.message || 'Error saving settings', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  });

  // Test connection button
  pathcuratorUrlInput.addEventListener('blur', async function() {
    const url = pathcuratorUrlInput.value.trim();
    if (url) {
      // Auto-add https if no protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        pathcuratorUrlInput.value = 'https://' + url;
      }
    }
  });

  // Help link
  helpLink.addEventListener('click', async function(e) {
    e.preventDefault();
    try {
      const settings = await chrome.storage.sync.get(['pathcuratorUrl']);
      const baseUrl = settings.pathcuratorUrl || 'https://pathcurator.com';
      
      chrome.tabs.create({
        url: `${baseUrl}/docs.html`,
        active: true
      });
    } catch (error) {
      chrome.tabs.create({
        url: 'https://pathcurator.com/docs.html',
        active: true
      });
    }
  });

  // Feedback link
  feedbackLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({
      url: 'https://github.com/pathcurator/extension/issues',
      active: true
    });
  });

  // Auto-save on change
  [pathcuratorUrlInput, showNotificationsCheckbox, enableKeyboardShortcutsCheckbox].forEach(input => {
    input.addEventListener('change', function() {
      // Visual indicator that settings have changed
      saveBtn.style.background = '#ffc107';
      saveBtn.textContent = 'Save Changes';
    });
  });

  // Utility function to show status messages
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    }
  }
});