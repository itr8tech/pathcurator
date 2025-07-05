# Link Audit System Design

## Overview
A system to detect and manage link rot within pathways.

## Data Model Extensions
- Add status fields to bookmark objects:
  - `lastChecked`: Timestamp of last status check
  - `status`: HTTP status code (200, 404, etc.)
  - `available`: Boolean indicating link health
  - `redirectUrl`: Store final URL if redirected
  - `checkError`: Any errors during checking

## Features
1. Background link checking
   - Periodic audit of all stored URLs
   - Status updates stored with bookmarks
2. Visual indicators in UI
   - Status badges for healthy/broken links
   - Warning for outdated checks
3. Audit dashboard
   - View all link statuses across pathways
   - Filter by status, last check date
   - Batch recheck capability
4. Link repair tools
   - Update redirected links
   - Fix common URL issues
   - Archive.org integration

## Implementation Plan
1. Update data model
2. Create link checking service
3. Add UI indicators
4. Build audit dashboard page
5. Implement repair functionality

