// version-utils.js
// Utilities for generating and handling version information for pathways

/**
 * Generates a hash-like identifier for a pathway based on its content
 * This uses a simplified approach to create a deterministic "hash" for versioning
 * 
 * @param {Object} pathway - The pathway object to generate a hash for
 * @returns {Object} - An object containing version info { hash, timestamp, count }
 */
export function generateVersionInfo(pathway) {
  if (!pathway) return null;
  
  // Start with basic numeric values
  let hash = 0;
  const timestamp = Date.now();
  
  // Count total content items
  const stepCount = pathway.steps?.length || 0;
  let bookmarkCount = 0;
  
  // Function to add a string's character codes to the hash
  const addToHash = (str) => {
    if (!str) return;
    
    // Simple algorithm to create a hash value from string content
    // This ensures the same content always produces the same hash
    for (let i = 0; i < str.length; i++) {
      // Multiply by 31 (common in hash functions) and add character code
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      // Convert to 32-bit integer to avoid overflows
      hash = hash & hash;
    }
  };
  
  // Add pathway name and description to hash
  addToHash(pathway.name);
  addToHash(pathway.description);
  addToHash(pathway.contentWarning);
  addToHash(pathway.acknowledgments);
  
  // Add each step and bookmark to hash
  if (pathway.steps) {
    pathway.steps.forEach(step => {
      addToHash(step.name);
      addToHash(step.objective);
      
      if (step.bookmarks) {
        bookmarkCount += step.bookmarks.length;
        
        step.bookmarks.forEach(bookmark => {
          addToHash(bookmark.title);
          addToHash(bookmark.url);
          addToHash(bookmark.description);
          addToHash(bookmark.context);
          addToHash(bookmark.type);
          addToHash(bookmark.contentType);
        });
      }
    });
  }
  
  // Convert hash to a string format (always positive, base 36 for shorter representation)
  const hashString = Math.abs(hash).toString(36).padStart(6, '0');
  
  // Format the timestamp in a more readable way
  const date = new Date(timestamp);
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  return {
    // Include timestamp in hash for uniqueness across identical content versions
    hash: `${hashString}-${formattedDate}`,
    timestamp,
    formattedDate,
    stepCount,
    bookmarkCount
  };
}

/**
 * Updates a pathway with new version information
 *
 * @param {Object} pathway - The pathway to update
 * @param {String} modifierUsername - The username of who modified the pathway (optional)
 * @returns {Object} - The updated pathway with version info
 */
export async function updatePathwayVersion(pathway, modifierUsername = null) {
  if (!pathway) return pathway;

  // Generate new version info
  const versionInfo = generateVersionInfo(pathway);

  // Get the modifier username if not provided
  let modifiedBy = modifierUsername;
  if (!modifiedBy) {
    try {
      // Use dynamic import to avoid circular dependencies
      const { getGitHubUsername } = await import('./export-utils.js');
      // Make sure getGitHubUsername exists and is callable
      if (typeof getGitHubUsername === 'function') {
        modifiedBy = await getGitHubUsername();
      } else {
        console.error('getGitHubUsername is not a function');
        modifiedBy = 'Unknown';
      }
    } catch (error) {
      console.error('Error getting GitHub username for version history:', error);
      modifiedBy = 'Unknown';
    }
  }

  // Create a new version history entry with modifier info
  const versionEntry = {
    hash: versionInfo.hash,
    timestamp: versionInfo.timestamp,
    stepCount: versionInfo.stepCount,
    bookmarkCount: versionInfo.bookmarkCount,
    modifiedBy // Add the username of who made the modification
  };

  // Make a DEEP copy of the pathway to avoid modifying the original
  // Using JSON parse/stringify to ensure a complete deep clone of all nested objects
  const updatedPathway = JSON.parse(JSON.stringify(pathway));

  // Initialize version history if it doesn't exist
  if (!updatedPathway.versionHistory) {
    updatedPathway.versionHistory = [];
  }

  // Add new version to history (keep only the most recent 10 versions)
  updatedPathway.versionHistory.unshift(versionEntry);
  if (updatedPathway.versionHistory.length > 10) {
    updatedPathway.versionHistory = updatedPathway.versionHistory.slice(0, 10);
  }

  // Set current version info
  updatedPathway.version = versionEntry.hash;
  updatedPathway.lastUpdated = versionEntry.timestamp;
  updatedPathway.modifiedBy = modifiedBy; // Add the username to the pathway itself

  // If this is a brand new pathway (first version) and createdBy isn't set yet,
  // set the createdBy field to be the same as modifiedBy
  if (!updatedPathway.createdBy && updatedPathway.versionHistory.length === 1) {
    updatedPathway.createdBy = modifiedBy;
  }

  return updatedPathway;
}

/**
 * Formats a version hash for display
 * 
 * @param {String} hash - The version hash
 * @returns {String} - A formatted version string
 */
export function formatVersion(hash) {
  if (!hash) return "No version";
  
  // Extract parts from hash format
  const parts = hash.split('-');
  if (parts.length !== 2) return hash;
  
  // Return formatted version
  return `${parts[0].toUpperCase()} (${parts[1]})`;
}

/**
 * Format the timestamp into a human-readable date
 * 
 * @param {Number} timestamp - The timestamp in milliseconds
 * @returns {String} - A formatted date string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}