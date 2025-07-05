// Client-side router for PathCurator

export const router = {
    routes: {},
    currentRoute: null,
    
    init() {
        // Define routes
        this.routes = {
            '/': () => this.loadPage('dashboard'),
            '/dashboard': () => this.loadPage('dashboard'),
            '/pathway/:id': (id) => this.loadPage('pathway-detail', { id }),
            '/edit-pathway/:id': (id) => this.loadPage('edit-pathway', { id }),
            '/edit-step/:pathwayId/:stepId': (pathwayId, stepId) => this.loadPage('edit-step', { pathwayId, stepId }),
            '/edit-bookmark/:pathwayId/:stepId/:bookmarkId': (pathwayId, stepId, bookmarkId) => 
                this.loadPage('edit-bookmark', { pathwayId, stepId, bookmarkId }),
            '/link-audit': () => this.loadPage('link-audit'),
            '/github-settings': () => this.loadPage('github-settings'),
            '/add-bookmark': () => this.handleAddBookmark()
        };
        
        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Handle initial route
        this.handleRoute();
    },
    
    handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        this.navigate(hash);
    },
    
    navigate(path) {
        // Remove hash if present
        if (path.startsWith('#')) {
            path = path.slice(1);
        }
        
        // Find matching route
        let routeFound = false;
        for (const [pattern, handler] of Object.entries(this.routes)) {
            const regex = this.patternToRegex(pattern);
            const match = path.match(regex);
            
            if (match) {
                routeFound = true;
                this.currentRoute = path;
                // Extract params and call handler
                const params = match.slice(1);
                handler(...params);
                break;
            }
        }
        
        if (!routeFound) {
            this.loadPage('dashboard'); // Default to dashboard
        }
    },
    
    patternToRegex(pattern) {
        // Convert route pattern to regex
        // e.g., '/pathway/:id' becomes /^\/pathway\/([^\/]+)$/
        const regexPattern = pattern
            .replace(/\//g, '\\/')
            .replace(/:([^\/]+)/g, '([^\\/]+)');
        return new RegExp(`^${regexPattern}$`);
    },
    
    async loadPage(pageName, params = {}) {
        // Special handling for dashboard - redirect to full page
        if (pageName === 'dashboard') {
            window.location.href = 'dashboard.html';
            return;
        }
        
        const mainContent = document.getElementById('main-content');
        
        try {
            // Load the HTML content
            const response = await fetch(`${pageName}.html`);
            if (!response.ok) throw new Error('Page not found');
            
            const html = await response.text();
            
            // Create a temporary container to parse the HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Extract only the main content (skip the full HTML structure)
            const content = temp.querySelector('.container, .container-fluid, main, body > *') || temp;
            
            // Update main content
            mainContent.innerHTML = content.innerHTML;
            
            // Load and execute the corresponding JavaScript module
            try {
                const module = await import(`./${pageName}.js`);
                if (module.default && typeof module.default.init === 'function') {
                    module.default.init(params);
                } else if (typeof module.init === 'function') {
                    module.init(params);
                }
            } catch (e) {
                console.log(`No JavaScript module found for ${pageName}`, e);
            }
            
            // Update active nav link
            this.updateActiveNavLink(pageName);
            
        } catch (error) {
            console.error('Error loading page:', error);
            mainContent.innerHTML = '<div class="alert alert-danger">Error loading page</div>';
        }
    },
    
    updateActiveNavLink(pageName) {
        // Remove active class from all nav links
        document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active class to current nav link
        const activeLink = document.querySelector(`[data-route="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    },
    
    handleAddBookmark() {
        // Get URL parameters
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const url = params.get('url') ? decodeURIComponent(params.get('url')) : '';
        const title = params.get('title') ? decodeURIComponent(params.get('title')) : '';
        const description = params.get('description') ? decodeURIComponent(params.get('description')) : '';
        
        // Pre-fill the bookmark form
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addBookmarkModal'));
        
        if (url) document.getElementById('bookmarkUrl').value = url;
        if (title) document.getElementById('bookmarkTitle').value = title;
        
        // Load pathways
        window.app.loadPathwaysForBookmark();
        
        // Show the modal
        modal.show();
        
        // If opened from bookmarklet, redirect to dashboard after modal closes
        if (params.get('url')) {
            document.getElementById('addBookmarkModal').addEventListener('hidden.bs.modal', () => {
                this.navigate('/dashboard');
            }, { once: true });
        }
    }
};