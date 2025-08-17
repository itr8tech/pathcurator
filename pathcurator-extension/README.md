# PathCurator Browser Extension

A lightweight browser extension that adds a "Share to PathCurator" button to your browser toolbar, providing easy access to the PathCurator bookmarklet functionality without requiring bookmarks bar management.

## Features

- **One-click sharing**: Share any webpage to your PathCurator learning pathways
- **Keyboard shortcut**: Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to quickly share pages
- **Context menu**: Right-click on any page or link to share to PathCurator
- **Automatic metadata**: Extracts page title, URL, and description automatically
- **Configurable**: Set your PathCurator instance URL (supports localhost for development)
- **Lightweight**: Minimal permissions and resource usage

## Installation

### For End Users

#### Chrome Web Store (Recommended)
1. Visit the [PathCurator Extension on Chrome Web Store](https://chrome.google.com/webstore) (when available)
2. Click "Add to Chrome"
3. Click "Add extension" in the confirmation dialog

#### Manual Installation (Development/Testing)
1. Download the extension files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `pathcurator-extension` folder
6. The extension will be installed and ready to use

### For Firefox Users

#### Firefox Add-ons (When Available)
1. Visit the [PathCurator Extension on Firefox Add-ons](https://addons.mozilla.org) (when available)
2. Click "Add to Firefox"

#### Manual Installation
1. Download the extension files
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from the extension folder

## Configuration

1. Click the PathCurator extension icon in your toolbar
2. Click "Extension Settings" in the popup
3. Configure your settings:
   - **PathCurator URL**: Set to your PathCurator instance (default: https://pathcurator.com)
   - **Notifications**: Enable/disable success notifications
   - **Keyboard Shortcuts**: Enable/disable keyboard shortcuts

### For Local Development
If you're running PathCurator locally:
1. Set the PathCurator URL to `http://localhost:3000` (or your local port)
2. Ensure your local instance is running when using the extension

## Usage

### Quick Share
1. Navigate to any webpage you want to add to your pathways
2. Click the PathCurator extension icon in your toolbar
3. Click "Share to PathCurator"
4. The PathCurator bookmarklet page will open with the current page's details pre-filled

### Keyboard Shortcut
1. Navigate to any webpage
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. The page will be shared to PathCurator

### Context Menu
1. Right-click on any page or link
2. Select "Share to PathCurator" from the context menu
3. The page or link will be shared to PathCurator

### Dashboard Access
- Click the extension icon and select "Open Dashboard" to quickly access your PathCurator dashboard

## Development

### Building the Extension

The extension is built with vanilla JavaScript and requires no build process. All files are ready to use as-is.

### File Structure

```
pathcurator-extension/
├── manifest.json          # Extension manifest (v3)
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── background.js          # Background service worker
├── content.js             # Content script for page interaction
├── options.html           # Settings page
├── options.js             # Settings page functionality
├── icons/                 # Extension icons (16, 32, 48, 128px)
├── generate-icons.html    # Tool to generate icons
├── create-icons.md        # Icon creation guidelines
└── README.md              # This file
```

### Creating Icons

Icons are required in multiple sizes. Use the provided `generate-icons.html` tool:

1. Open `generate-icons.html` in a browser
2. Click "Generate Icons"
3. Download all four icon sizes
4. Place them in the `icons/` directory

Alternatively, create icons manually following the guidelines in `create-icons.md`.

### Testing

1. Load the extension in developer mode
2. Test on various websites
3. Verify the popup works correctly
4. Test keyboard shortcuts
5. Test context menu options
6. Check that settings persist correctly

### Permissions Explained

- **activeTab**: Access to the current tab to get page information
- **storage**: Store user settings (PathCurator URL, preferences)
- **host_permissions**: Access to PathCurator domains for integration

## Packaging for Distribution

### Chrome Web Store

1. Create icons using the icon generator tool
2. Zip the entire extension directory
3. Upload to Chrome Developer Dashboard
4. Complete store listing with screenshots and descriptions

### Firefox Add-ons

1. Ensure manifest.json is compatible with Firefox (it should be)
2. Zip the extension directory
3. Upload to Firefox Developer Hub
4. Complete the review process

### Manual Distribution

1. Create icons using the provided tool
2. Zip the extension directory
3. Distribute the zip file with installation instructions

## Troubleshooting

### Extension Not Working
- Ensure the PathCurator URL is set correctly in settings
- Check that your PathCurator instance is accessible
- Verify the extension has necessary permissions

### Local Development Issues
- Make sure your local PathCurator server is running
- Set the extension URL to match your local server address
- Check browser console for error messages

### Keyboard Shortcut Conflicts
- Check Chrome's keyboard shortcuts in `chrome://extensions/shortcuts`
- Change the shortcut if it conflicts with other extensions

## Privacy

The PathCurator extension:
- Only accesses page information when you explicitly share a page
- Stores settings locally in your browser
- Does not collect or transmit personal data
- Only communicates with your configured PathCurator instance

## Support

- **Documentation**: Visit the PathCurator docs page
- **Issues**: Report bugs or request features on GitHub
- **Help**: Use the help link in the extension popup

## Version History

### v1.0.0
- Initial release
- Basic sharing functionality
- Keyboard shortcuts
- Context menu integration
- Settings page
- Support for custom PathCurator instances