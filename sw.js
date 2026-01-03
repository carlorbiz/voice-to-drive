/**
 * Voice to Drive - Service Worker
 * Handles offline caching and background sync
 */

const CACHE_NAME = 'voice-to-drive-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/storage.js',
    '/js/recorder.js',
    '/js/drive.js',
    '/js/ui.js',
    '/js/app.js',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Install failed:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activate complete');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - serve from cache, fall back to network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip Google API requests (they need to go to network)
    if (url.hostname.includes('googleapis.com') || 
        url.hostname.includes('accounts.google.com') ||
        url.hostname.includes('gstatic.com')) {
        return;
    }
    
    // For navigation requests, try network first, fall back to cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('/index.html'))
        );
        return;
    }
    
    // For other requests, try cache first, fall back to network
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(request)
                    .then((networkResponse) => {
                        // Cache successful responses
                        if (networkResponse.ok && shouldCache(request)) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, responseToCache);
                                });
                        }
                        
                        return networkResponse;
                    })
                    .catch(() => {
                        // Return offline fallback for images
                        if (request.destination === 'image') {
                            return new Response(
                                '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#1a1a24"/></svg>',
                                { headers: { 'Content-Type': 'image/svg+xml' } }
                            );
                        }
                        
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

/**
 * Determine if a request should be cached
 */
function shouldCache(request) {
    const url = new URL(request.url);
    
    // Cache same-origin resources
    if (url.origin === self.location.origin) {
        return true;
    }
    
    // Cache fonts
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        return true;
    }
    
    return false;
}

/**
 * Background sync for uploads
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'upload-recordings') {
        console.log('[SW] Background sync: upload-recordings');
        event.waitUntil(syncRecordings());
    }
});

/**
 * Push notification handler (for future use)
 */
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const data = event.data.json();
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Voice to Drive', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            data: data.data
        })
    );
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Focus existing window if available
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

/**
 * Message handler for communication with main app
 */
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

/**
 * Sync recordings (placeholder - actual sync happens in main app)
 */
async function syncRecordings() {
    // This would be implemented if we use background sync
    // For now, sync happens in the main app when online
    console.log('[SW] Sync recordings triggered');
}

console.log('[SW] Service Worker loaded');
