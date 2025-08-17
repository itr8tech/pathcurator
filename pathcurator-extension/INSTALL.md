# PathCurator Extension Installation Guide

This guide covers installing the PathCurator browser extension for both end users and developers.

## Quick Installation (End Users)

### Chrome/Chromium Browsers

#### Option 1: Chrome Web Store (Recommended - when available)
1. Visit the Chrome Web Store
2. Search for "PathCurator"
3. Click "Add to Chrome"
4. Confirm by clicking "Add extension"

#### Option 2: Manual Installation
1. Download the extension files
2. Extract to a folder (e.g., `pathcurator-extension`)
3. Open Chrome
4. Go to `chrome://extensions/`
5. Enable "Developer mode" (toggle in top right)
6. Click "Load unpacked"
7. Select the extracted folder
8. Click the extension icon and configure your settings

### Firefox

#### Option 1: Firefox Add-ons (When available)
1. Visit Firefox Add-ons store
2. Search for "PathCurator"
3. Click "Add to Firefox"

#### Option 2: Manual Installation
1. Download the extension files
2. Open Firefox
3. Go to `about:debugging`
4. Click "This Firefox"
5. Click "Load Temporary Add-on"
6. Navigate to the extension folder
7. Select `manifest.json`

### Edge
1. Go to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension folder

## Developer Installation

### Prerequisites
- Chrome/Chromium browser (version 88+)
- OR Firefox (version 109+)
- OR Edge (version 88+)

### Steps

1. **Clone/Download the Extension**
   ```bash
   # If part of PathCurator repo
   cd pathcurator/pathcurator-extension
   
   # Or download the extension folder separately
   ```

2. **Create Icons**
   ```bash
   # Open the icon generator in a browser
   open generate-icons.html
   
   # Generate and download all icon sizes
   # Place them in the icons/ directory
   ```

3. **Install in Browser**

   **Chrome:**
   ```
   1. Go to chrome://extensions/
   2. Enable "Developer mode"
   3. Click "Load unpacked"
   4. Select the pathcurator-extension folder
   ```

   **Firefox:**
   ```
   1. Go to about:debugging
   2. Click "This Firefox"
   3. Click "Load Temporary Add-on"
   4. Select manifest.json
   ```

4. **Configure Extension**
   - Click the extension icon in your toolbar
   - Click "Extension Settings"
   - Set your PathCurator URL (use `http://localhost:3000` for local development)
   - Configure other preferences

## Configuration

### Initial Setup

1. **Click the Extension Icon**
   - Look for the "P" icon in your browser toolbar
   - If not visible, click the extensions menu (puzzle piece icon)

2. **Open Settings**
   - Click "Extension Settings" in the popup
   - Or right-click the extension icon and select "Options"

3. **Configure PathCurator URL**
   - **Production**: `https://pathcurator.com` (default)
   - **Local Development**: `http://localhost:3000` (or your port)
   - **Custom Instance**: Your PathCurator server URL

### Settings Options

- **PathCurator URL**: Where your PathCurator instance is hosted
- **Show Notifications**: Display success/error messages when sharing
- **Enable Keyboard Shortcuts**: Allow Ctrl+Shift+P to share pages

## Verification

### Test the Extension

1. **Basic Functionality**
   - Navigate to any webpage
   - Click the PathCurator extension icon
   - Click "Share to PathCurator"
   - Verify the bookmarklet page opens with page details

2. **Keyboard Shortcut**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Verify the sharing action works

3. **Context Menu**
   - Right-click on any page
   - Look for "Share to PathCurator" option
   - Test that it works

4. **Settings Persistence**
   - Change settings in the options page
   - Close and reopen browser
   - Verify settings are saved

## Troubleshooting

### Extension Not Appearing
- **Chrome**: Check `chrome://extensions/` - ensure it's enabled
- **Firefox**: Temporary add-ons are removed when Firefox closes
- **General**: Look in the extensions menu (puzzle piece icon)

### Sharing Not Working
1. **Check Console Errors**
   - Open Developer Tools (F12)
   - Look for error messages in the Console tab

2. **Verify PathCurator URL**
   - Ensure the URL in settings is correct
   - Test the URL manually in a browser tab

3. **Check Permissions**
   - Go to `chrome://extensions/`
   - Click "Details" on the PathCurator extension
   - Verify permissions are granted

### Local Development Issues

1. **CORS Errors**
   - If running locally, ensure your PathCurator server allows the extension origin
   - Check server logs for blocked requests

2. **Port Mismatch**
   - Verify the extension URL matches your local server port
   - Common ports: 3000, 8080, 8000

3. **Extension Updates**
   - After code changes, click "Reload" on the extension in `chrome://extensions/`
   - Close and reopen the browser for manifest changes

## Advanced Installation

### For Organizations

1. **Create a Policies Configuration**
   ```json
   {
     "ExtensionInstallForcelist": [
       "extension-id-here;https://path-to-update-manifest"
     ]
   }
   ```

2. **Deploy via Group Policy (Windows)**
   - Add to Chrome/Edge administrative templates
   - Configure the ExtensionInstallForcelist policy

3. **Deploy via Configuration Profile (macOS)**
   - Create a configuration profile with Chrome preferences
   - Include the extension installation policy

### Custom Packaging

1. **Create Extension Package**
   ```bash
   # Zip the extension directory
   zip -r pathcurator-extension.zip pathcurator-extension/
   ```

2. **Generate CRX File (Chrome)**
   ```bash
   # Use Chrome's built-in packaging
   # Or use command line tools for automation
   ```

## Security Considerations

### Permissions Review
The extension requests minimal permissions:
- **activeTab**: Access current page information only when used
- **storage**: Save user preferences locally
- **host_permissions**: Connect to PathCurator instances

### Data Handling
- No data is collected or transmitted except to your configured PathCurator instance
- Settings are stored locally in your browser
- Page information is only accessed when you explicitly share

### Network Access
- Extension only communicates with your configured PathCurator URL
- No third-party analytics or tracking
- All network requests are to PathCurator for functionality

## Getting Help

- **Extension Issues**: Check browser's extension management page
- **PathCurator Issues**: Visit the PathCurator documentation
- **General Help**: Use the help link in the extension popup
- **Bug Reports**: Use the feedback link in extension settings

## Uninstalling

### Complete Removal
1. Go to browser extensions page
2. Find PathCurator extension
3. Click "Remove" or trash icon
4. Confirm removal

This will remove all extension files and settings from your browser.