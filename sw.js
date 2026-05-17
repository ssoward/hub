/**
 * Service Worker for Alma 31 Study App
 * Provides offline functionality and improved performance through caching
 */

const CACHE_NAME = 'alma31-study-v1.3.2';
const STATIC_CACHE_NAME = 'alma31-static-v1.3.2';
const DYNAMIC_CACHE_NAME = 'alma31-dynamic-v1.3.2';

// Static files to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/site.css',
    '/css/alma31.css',
    '/css/reveal-site-theme.css',
    '/css/main.css',
    '/css/responsive.css',
    '/js/main.js',
    '/js/search.js',
    '/pages/scripture.html',
    '/pages/analysis.html',
    '/pages/gallery.html',
    '/pages/applications.html',
    '/pages/about.html',
    // Activity files
    '/activities/index.html',
    '/activities/hat-riddle/index.html',
    // Presentation files
    '/presentations/confidence-in-presence-of-god/confidence-presentation.html',
    '/presentations/confidence-in-presence-of-god/confidence-presentation-fixes.css',
    '/presentations/confidence-in-presence-of-god/critical-fixes.css',
    // Add common icon paths
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png',
    '/assets/icons/favicon.ico',
    // Add any common images
    '/assets/images/og-image.jpg'
];

// Network-first strategies for these paths
const NETWORK_FIRST_PATHS = [
    '/api/',
    '/feedback/',
    '/analytics/'
];

// Cache-first strategies for these file types
const CACHE_FIRST_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.woff', '.woff2', '.ttf', '.eot',
    '.css', '.js'
];

/**
 * Install Event - Cache static assets
 */
self.addEventListener('install', (event) => {
    console.log('SW: Installing service worker');

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('SW: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('SW: Static assets cached successfully');
                // Force the waiting service worker to become the active service worker
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('SW: Failed to cache static assets:', error);
            })
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('SW: Activating service worker');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old caches
                        if (cacheName !== STATIC_CACHE_NAME &&
                            cacheName !== DYNAMIC_CACHE_NAME &&
                            cacheName.startsWith('alma31-')) {
                            console.log('SW: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('SW: Service worker activated');
                // Take control of all pages
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - Handle network requests with caching strategies
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip cross-origin requests (unless they're for assets we want to cache)
    if (url.origin !== location.origin) {
        return;
    }

    console.log('SW: Handling fetch for:', request.url);

    // Determine caching strategy based on request
    if (isNetworkFirstRequest(request)) {
        event.respondWith(handleNetworkFirst(request));
    } else if (isCacheFirstRequest(request)) {
        event.respondWith(handleCacheFirst(request));
    } else {
        event.respondWith(handleStaleWhileRevalidate(request));
    }
});

/**
 * Network First Strategy - Try network first, fallback to cache
 */
async function handleNetworkFirst(request) {
    const cacheName = DYNAMIC_CACHE_NAME;

    try {
        // Try network first
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache the response
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('SW: Network failed, trying cache:', request.url);

        // Fallback to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // If nothing in cache, return offline page or error
        return getOfflineResponse(request);
    }
}

/**
 * Cache First Strategy - Try cache first, fallback to network
 */
async function handleCacheFirst(request) {
    const cacheName = STATIC_CACHE_NAME;

    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        console.log('SW: Serving from cache:', request.url);
        return cachedResponse;
    }

    console.log('SW: Cache miss, fetching from network:', request.url);

    try {
        // Fallback to network
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache for future use
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('SW: Network and cache both failed for:', request.url);
        return getOfflineResponse(request);
    }
}

/**
 * Stale While Revalidate Strategy - Serve from cache, update in background
 */
async function handleStaleWhileRevalidate(request) {
    const cacheName = DYNAMIC_CACHE_NAME;

    // Always try to get from cache first
    const cachedResponse = await caches.match(request);

    // Fetch from network in background
    const networkResponsePromise = fetch(request)
        .then(async (response) => {
            if (response.ok) {
                const cache = await caches.open(cacheName);
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch((error) => {
            console.log('SW: Background fetch failed:', request.url);
        });

    // Return cached version immediately if available
    if (cachedResponse) {
        console.log('SW: Serving stale content:', request.url);
        // Don't await the network request
        networkResponsePromise;
        return cachedResponse;
    }

    // If no cache, wait for network
    try {
        return await networkResponsePromise;
    } catch (error) {
        return getOfflineResponse(request);
    }
}

/**
 * Determine if request should use network-first strategy
 */
function isNetworkFirstRequest(request) {
    const url = new URL(request.url);
    return NETWORK_FIRST_PATHS.some(path => url.pathname.startsWith(path));
}

/**
 * Determine if request should use cache-first strategy
 */
function isCacheFirstRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();

    return CACHE_FIRST_EXTENSIONS.some(ext => pathname.endsWith(ext)) ||
           STATIC_ASSETS.some(asset => pathname === asset || pathname.endsWith(asset));
}

/**
 * Get appropriate offline response based on request type
 */
function getOfflineResponse(request) {
    const url = new URL(request.url);

    // For HTML pages, return a generic offline page
    if (request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/index.html').then(response => {
            return response || new Response(
                getOfflineHTML(),
                {
                    headers: { 'Content-Type': 'text/html' },
                    status: 200
                }
            );
        });
    }

    // For images, return a placeholder
    if (request.headers.get('accept')?.includes('image/')) {
        return new Response(
            getSVGPlaceholder('Image unavailable offline'),
            {
                headers: { 'Content-Type': 'image/svg+xml' },
                status: 200
            }
        );
    }

    // For other requests, return a generic error
    return new Response(
        JSON.stringify({
            error: 'Content not available offline',
            message: 'Please check your internet connection'
        }),
        {
            headers: { 'Content-Type': 'application/json' },
            status: 503
        }
    );
}

/**
 * Generate offline HTML page
 */
function getOfflineHTML() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Offline - Alma 31 Study</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    margin: 0;
                    padding: 2rem;
                    text-align: center;
                    background: #f8f9fa;
                    color: #212529;
                }
                .offline-container {
                    max-width: 600px;
                    margin: 2rem auto;
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .offline-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    color: #002E5D;
                }
                h1 {
                    color: #002E5D;
                    margin-bottom: 1rem;
                }
                .btn {
                    display: inline-block;
                    padding: 0.75rem 1.5rem;
                    background: #002E5D;
                    color: white;
                    text-decoration: none;
                    border-radius: 4px;
                    margin-top: 1rem;
                }
                .btn:hover {
                    background: #1B4F8C;
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📖</div>
                <h1>You're Offline</h1>
                <p>This page isn't available offline, but you can still access cached content from your previous visits.</p>
                <p>The Alma 31 Study app works partially offline. Core scripture content and analysis may still be available.</p>
                <a href="/" class="btn" onclick="window.history.back(); return false;">Go Back</a>
                <script>
                    // Try to reload after connection is restored
                    window.addEventListener('online', () => {
                        window.location.reload();
                    });
                </script>
            </div>
        </body>
        </html>
    `;
}

/**
 * Generate SVG placeholder for images
 */
function getSVGPlaceholder(text = 'Offline') {
    return `
        <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="300" height="200" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
            <text x="150" y="90" text-anchor="middle" fill="#6c757d" font-family="Arial, sans-serif" font-size="14">
                📖
            </text>
            <text x="150" y="120" text-anchor="middle" fill="#6c757d" font-family="Arial, sans-serif" font-size="12">
                ${text}
            </text>
        </svg>
    `;
}

/**
 * Background Sync Event - Handle background operations
 */
self.addEventListener('sync', (event) => {
    console.log('SW: Background sync triggered:', event.tag);

    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

/**
 * Handle background sync operations
 */
async function doBackgroundSync() {
    console.log('SW: Performing background sync');

    try {
        // Update cache with latest content
        const cache = await caches.open(DYNAMIC_CACHE_NAME);

        // Fetch fresh versions of key pages
        const keyPages = ['/index.html', '/pages/scripture.html'];

        for (const page of keyPages) {
            try {
                const response = await fetch(page);
                if (response.ok) {
                    await cache.put(page, response);
                    console.log('SW: Updated cache for:', page);
                }
            } catch (error) {
                console.log('SW: Failed to update cache for:', page);
            }
        }
    } catch (error) {
        console.error('SW: Background sync failed:', error);
    }
}

/**
 * Push Event - Handle push notifications (future feature)
 */
self.addEventListener('push', (event) => {
    console.log('SW: Push message received:', event);

    // For future implementation of study reminders or updates
    if (event.data) {
        const data = event.data.json();

        const options = {
            body: data.message || 'New content available in Alma 31 Study',
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/icon-96x96.png',
            vibrate: [200, 100, 200],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: data.primaryKey || '1'
            },
            actions: [
                {
                    action: 'explore',
                    title: 'Study Now',
                    icon: '/assets/icons/icon-72x72.png'
                },
                {
                    action: 'close',
                    title: 'Later',
                    icon: '/assets/icons/icon-72x72.png'
                }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Alma 31 Study', options)
        );
    }
});

/**
 * Notification Click Event
 */
self.addEventListener('notificationclick', (event) => {
    console.log('SW: Notification clicked:', event);

    event.notification.close();

    if (event.action === 'explore') {
        // Open the app when notification is clicked
        event.waitUntil(
            clients.matchAll().then((clientList) => {
                if (clientList.length > 0) {
                    return clientList[0].focus();
                }
                return clients.openWindow('/');
            })
        );
    }
});

/**
 * Message Event - Handle messages from main thread
 */
self.addEventListener('message', (event) => {
    console.log('SW: Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName.startsWith('alma31-')) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        );
    }
});

console.log('SW: Service worker script loaded');