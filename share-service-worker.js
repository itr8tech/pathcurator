// Service worker for Web Share Target API
// This handles shared URLs from other apps/websites

// Install event
self.addEventListener('install', event => {
  console.log('Share target service worker installing...');
  event.waitUntil(self.skipWaiting());
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Share target service worker activating...');
  event.waitUntil(self.clients.claim());
});

// Handle shared content from Web Share Target API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Check if this is a share target request
  if (url.pathname === '/share-target.html' && event.request.method === 'GET') {
    console.log('Handling Web Share Target request', url.searchParams);
    
    // Extract shared data from URL parameters
    const sharedTitle = url.searchParams.get('title') || '';
    const sharedText = url.searchParams.get('text') || '';
    const sharedUrl = url.searchParams.get('url') || '';
    
    // Log the shared content for debugging
    console.log('Shared content:', {
      title: sharedTitle,
      text: sharedText,
      url: sharedUrl
    });
    
    // Allow the default handling to proceed
    // The share-target.html page will handle the actual processing
    return;
  }
});

// Handle messages from the extension
self.addEventListener('message', event => {
  console.log('Share service worker received message:', event.data);
  
  if (event.data.type === 'SHARE_URL') {
    // Store shared data temporarily
    const sharedData = {
      url: event.data.url,
      title: event.data.title,
      text: event.data.text,
      timestamp: Date.now()
    };
    
    // Respond to the sender
    event.ports[0].postMessage({
      success: true,
      data: sharedData
    });
  }
});

// Handle background sync for offline sharing (optional feature)
self.addEventListener('sync', event => {
  if (event.tag === 'share-bookmark') {
    console.log('Background sync triggered for shared bookmark');
    // Could handle offline bookmark saving here
  }
});

console.log('Share target service worker loaded');