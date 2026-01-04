/**
 * Voice to Drive - Google Drive Service
 * Handles OAuth authentication and file uploads to Google Drive
 * Creates Year/Month/Day folder structure
 */

const DriveService = (function() {
    // Configuration - These should be set before use
    const CONFIG = {
        CLIENT_ID: '', // Set via configure()
        API_KEY: '',   // Set via configure()
        SCOPES: 'https://www.googleapis.com/auth/drive.file',
        DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        ROOT_FOLDER: 'Voice Recordings' // Root folder in Drive
    };
    
    // State
    let isInitialised = false;
    let isSignedIn = false;
    let currentUser = null;
    let tokenClient = null;
    let accessToken = null;
    
    // Folder cache to avoid repeated lookups
    const folderCache = new Map();
    
    /**
     * Configure the Drive service with credentials
     */
    function configure(clientId, apiKey = '') {
        CONFIG.CLIENT_ID = clientId;
        CONFIG.API_KEY = apiKey;
    }
    
    /**
     * Initialise the Google API client
     */
    async function init() {
        return new Promise((resolve, reject) => {
            // Load the Google API client library
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = async () => {
                try {
                    await loadGapiClient();
                    await loadGisClient();
                    isInitialised = true;
                    
                    // Check if we have a stored token
                    const storedToken = await StorageService.getSetting('driveToken');
                    if (storedToken && storedToken.expiry > Date.now()) {
                        accessToken = storedToken.token;
                        isSignedIn = true;
                        await fetchUserInfo();
                    }
                    
                    resolve(isSignedIn);
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = () => reject(new Error('Failed to load Google API'));
            document.head.appendChild(script);
        });
    }
    
    async function loadGapiClient() {
        return new Promise((resolve, reject) => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: CONFIG.API_KEY,
                        discoveryDocs: CONFIG.DISCOVERY_DOCS
                    });
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    async function loadGisClient() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.CLIENT_ID,
                    scope: CONFIG.SCOPES,
                    callback: handleTokenResponse
                });
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
            document.head.appendChild(script);
        });
    }
    
    let tokenResolve = null;
    let tokenReject = null;
    
    function handleTokenResponse(response) {
        if (response.error) {
            console.error('Token error:', response);
            if (tokenReject) tokenReject(new Error(response.error));
            return;
        }
        
        accessToken = response.access_token;
        isSignedIn = true;
        
        // Store token with expiry
        const expiry = Date.now() + (response.expires_in * 1000);
        StorageService.setSetting('driveToken', { token: accessToken, expiry });
        
        fetchUserInfo();
        
        if (tokenResolve) tokenResolve(true);
    }
    
    /**
     * Sign in to Google
     */
    async function signIn() {
        if (!isInitialised) {
            throw new Error('Drive service not initialised');
        }
        
        return new Promise((resolve, reject) => {
            tokenResolve = resolve;
            tokenReject = reject;
            
            if (accessToken) {
                // Request with existing token (consent already given)
                tokenClient.requestAccessToken({ prompt: '' });
            } else {
                // First time - show consent screen
                tokenClient.requestAccessToken({ prompt: 'consent' });
            }
        });
    }
    
    /**
     * Sign out
     */
    async function signOut() {
        if (accessToken) {
            google.accounts.oauth2.revoke(accessToken);
        }
        
        accessToken = null;
        isSignedIn = false;
        currentUser = null;
        folderCache.clear();
        
        await StorageService.setSetting('driveToken', null);
    }
    
    /**
     * Get current sign-in status
     */
    function isAuthenticated() {
        return isSignedIn && accessToken;
    }
    
    /**
     * Get current user info
     */
    function getCurrentUser() {
        return currentUser;
    }
    
    async function fetchUserInfo() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (response.ok) {
                currentUser = await response.json();
            }
        } catch (error) {
            console.error('Failed to fetch user info:', error);
        }
    }
    
    /**
     * Upload a recording to Google Drive
     */
    async function uploadRecording(blob, fileName, folderPath) {
        if (!isAuthenticated()) {
            throw new Error('Not authenticated');
        }
        
        try {
            // Use the user-defined folder path directly
            // If folderPath is empty, use the default root folder
            const fullPath = folderPath || CONFIG.ROOT_FOLDER;
            console.log('Ensuring folder path:', fullPath);
            
            // Ensure folder structure exists
            const folderId = await ensureFolderPath(fullPath);
            console.log('Target folder ID:', folderId);
            
            // Upload file
            const fileId = await uploadFile(blob, fileName, folderId);
            
            return {
                success: true,
                fileId,
                fileName,
                folderPath
            };
            
        } catch (error) {
            console.error('Upload failed:', error);
            
            // Check if token expired
            if (error.status === 401) {
                // Try to refresh token
                await signIn();
                // Retry upload
                return uploadRecording(blob, fileName, folderPath);
            }
            
            throw error;
        }
    }
    
    /**
     * Ensure folder path exists, creating folders as needed
     */
    async function ensureFolderPath(path) {
        // Check cache first
        if (folderCache.has(path)) {
            return folderCache.get(path);
        }
        
        const parts = path.split('/').filter(p => p && p.trim() !== '');
        let parentId = 'root';
        let currentPath = '';
        
        for (const folderName of parts) {
            currentPath += (currentPath ? '/' : '') + folderName;
            
            if (folderCache.has(currentPath)) {
                parentId = folderCache.get(currentPath);
                continue;
            }
            
            // Search for existing folder
            let folderId = await findFolder(folderName, parentId);
            
            if (!folderId) {
                // Create folder
                folderId = await createFolder(folderName, parentId);
            }
            
            folderCache.set(currentPath, folderId);
            parentId = folderId;
        }
        
        folderCache.set(path, parentId);
        return parentId;
    }
    
    /**
     * Find a folder by name within a parent
     */
    async function findFolder(name, parentId) {
        const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
        
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );
        
        if (!response.ok) {
            const error = new Error('Failed to search folders');
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        return data.files.length > 0 ? data.files[0].id : null;
    }
    
    /**
     * Create a folder
     */
    async function createFolder(name, parentId) {
        const metadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        
        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
        });
        
        if (!response.ok) {
            const error = new Error('Failed to create folder');
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        console.log('Created folder:', name, data.id);
        return data.id;
    }
    
    /**
     * Upload a file to a folder
     */
    async function uploadFile(blob, fileName, folderId) {
        const metadata = {
            name: fileName,
            parents: [folderId]
        };
        
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob);
        
        const response = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: formData
            }
        );
        
        if (!response.ok) {
            const error = new Error('Failed to upload file');
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        console.log('Uploaded file:', fileName, data.id);
        return data.id;
    }
    
    /**
     * Get Drive storage quota
     */
    async function getStorageQuota() {
        if (!isAuthenticated()) return null;
        
        try {
            const response = await fetch(
                'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return data.storageQuota;
            }
        } catch (error) {
            console.error('Failed to get storage quota:', error);
        }
        
        return null;
    }
    
    /**
     * List recent uploads (for verification)
     */
    async function listRecentUploads(limit = 10) {
        if (!isAuthenticated()) return [];
        
        try {
            const query = `mimeType='audio/webm' or mimeType='audio/mp4' or mimeType='audio/mpeg'`;
            
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&pageSize=${limit}&fields=files(id,name,createdTime,size,webViewLink)`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return data.files;
            }
        } catch (error) {
            console.error('Failed to list uploads:', error);
        }
        
        return [];
    }
    
    // Public API
    return {
        configure,
        init,
        signIn,
        signOut,
        isAuthenticated,
        getCurrentUser,
        uploadRecording,
        getStorageQuota,
        listRecentUploads
    };
})();
