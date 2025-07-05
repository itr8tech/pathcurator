// Bookmarklet generator for PathCurator
// This creates a bookmarklet that users can drag to their bookmarks bar

export function generateBookmarklet(baseUrl) {
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // Bookmarklet code that will run on any page
    const bookmarkletCode = `
    (function() {
        const url = encodeURIComponent(window.location.href);
        const title = encodeURIComponent(document.title);
        const description = encodeURIComponent(
            document.querySelector('meta[name="description"]')?.content || 
            document.querySelector('meta[property="og:description"]')?.content || 
            ''
        );
        
        // Open PathCurator in a new window with the bookmark data
        const width = 600;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        window.open(
            '${baseUrl}/#/add-bookmark?url=' + url + '&title=' + title + '&description=' + description,
            'PathCuratorBookmark',
            'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',toolbar=no,menubar=no'
        );
    })();
    `.replace(/\s+/g, ' ').trim();
    
    return 'javascript:' + encodeURIComponent(bookmarkletCode);
}

// Create bookmarklet setup UI
export function createBookmarkletUI() {
    const currentUrl = window.location.origin + window.location.pathname.replace(/[^\/]*$/, '');
    const bookmarkletUrl = generateBookmarklet(currentUrl);
    
    return `
        <div class="bookmarklet-setup">
            <h3>Bookmarklet Setup</h3>
            <p>Drag this button to your bookmarks bar to quickly save bookmarks from any webpage:</p>
            <div class="text-center my-4">
                <a href="${bookmarkletUrl}" 
                   class="btn btn-lg btn-primary bookmarklet-button"
                   onclick="alert('Drag this button to your bookmarks bar!'); return false;">
                    <i class="bi bi-bookmark-plus"></i> Add to PathCurator
                </a>
            </div>
            <div class="alert alert-info">
                <h5>How to use:</h5>
                <ol>
                    <li>Drag the button above to your bookmarks bar</li>
                    <li>When viewing any webpage you want to save, click the bookmarklet</li>
                    <li>A popup will open allowing you to add the page to your pathways</li>
                </ol>
            </div>
            <div class="alert alert-warning">
                <strong>Alternative:</strong> You can also manually add bookmarks using the 
                "Add Bookmark" button in the navigation bar.
            </div>
        </div>
    `;
}