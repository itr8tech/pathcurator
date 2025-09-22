# PathCurator

A web application to create and manage Learning Curator pathways.

## Overview

PathCurator helps educators and learners organize educational resources into structured learning pathways. Create, manage, and share curated collections of links with detailed step information for guided learning experiences.

## Features

- **Pathway Management**: Create, edit, and organize learning pathways with multiple steps
- **Bookmark Integration**: Save and categorize important resources within your pathways
- **Export Options**: Export pathways in various formats including HTML, CSV, and JSON
- **Import Options**: Import pathways from JSON
- **Link Tracking**: Track which links you've already visited/launched
- **Link Auditing**: Verify the status of links in your pathways
- **GitHub Integration**: Save and share pathways via GitHub repositories
- **Automatic Versioning**: Track pathway changes with automatic version numbering

## Getting Started

Simply visit [pathcurator.com](https://pathcurator.com) to get started right away! No installation required.

## Usage

1. **Create a Pathway**: Click "New Pathway" to start creating your learning path
2. **Add Steps**: Use the "Add Step" button to create new steps in your pathway
3. **Add Bookmarks**: Within each step, add bookmarks to relevant resources
4. **Export**: Use the export options to generate shareable HTML, CSV, or JSON files

## GitHub Integration

PathCurator allows you to store and synchronize your pathways using GitHub repositories. This feature makes it easy to share pathways across devices and with colleagues.

### Setting Up GitHub Integration

1. **Create a GitHub Personal Access Token (PAT)**:
   - Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
   - Click "Generate new token" (classic)
   - Give your token a descriptive name (e.g., "PathCurator")
   - Set an expiration date (recommended for security)
   - Select the **public_repo** scope (this allows PathCurator to access your public repositories)
   - Click "Generate token"
   - **Important**: Copy your token immediately! GitHub will only show it once.

2. **Connect to GitHub in PathCurator**:
   - In the PathCurator dashboard, click on "GitHub Settings" in the menu
   - Paste your GitHub Personal Access Token in the provided field
   - Click "Connect to GitHub"
   - After connecting, you'll be able to select a repository, branch, and file path for storing your pathways

3. **Using GitHub Features**:
   - **Save to GitHub**: From the dashboard, click "Commit to GitHub" to save your current pathways
   - **Import from GitHub**: When connecting to a repository with existing pathway data, you'll be prompted to import it
   - **Sync Across Devices**: Use the same GitHub repository on multiple devices to keep your pathways in sync

### Security Notes

- Your GitHub token is stored securely with encryption in your browser's local storage
- PathCurator only requests the minimum permissions needed (public_repo scope)
- For maximum security, consider using a token with an expiration date and regularly rotating it

## Version Numbering

PathCurator automatically tracks changes to your pathways with a comprehensive versioning system:

### How Versioning Works

- **Automatic Version Generation**: Every change to a pathway triggers a new version number
- **Content-Based Hashing**: Version numbers are generated based on the actual content of your pathway, ensuring unique identifiers for each state
- **Change Detection**: Any modification to the following elements will trigger a version change:
  - Pathway name or description
  - Adding, removing, or modifying steps
  - Adding, removing, or modifying bookmarks within steps
  - Updating content warnings or acknowledgments
  - Changing bookmark URLs, titles, descriptions, or context

### Version Format

Versions are formatted as `HASH-DATE` where:
- **HASH**: A unique 6-character identifier derived from the pathway content
- **DATE**: The date when the version was created (YYYY-MM-DD format)

Example: `a3b2c1-2024-09-22`

### Version History

- PathCurator maintains a history of the last 10 versions for each pathway
- Each version entry includes:
  - Version hash
  - Timestamp of the change
  - Number of steps and bookmarks at that version
  - Username of the person who made the change (when GitHub integration is enabled)
- Version history is preserved when exporting and importing pathways
- Previous versions remain accessible in your Git history when using GitHub integration

## Development

This web application is built using standard web technologies:
- HTML, CSS, and JavaScript
- Bootstrap 5 for styling
- Font Awesome for icons

## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.
