/**
 * Voice to Drive - Storage Service
 * IndexedDB wrapper for offline-first recording storage
 * Handles chunked saves for crash protection
 */

const StorageService = (function() {
    const DB_NAME = 'voice-to-drive';
    const DB_VERSION = 2; // Incremented to fix boolean->number migration
    const STORES = {
        RECORDINGS: 'recordings',
        CHUNKS: 'chunks',
        SETTINGS: 'settings'
    };
    
    let db = null;
    
    /**
     * Initialise the database
     */
    async function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('Failed to open database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                db = request.result;
                console.log('Database opened successfully');
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Recordings store - completed recordings awaiting sync
                if (!database.objectStoreNames.contains(STORES.RECORDINGS)) {
                    const recordingsStore = database.createObjectStore(STORES.RECORDINGS, { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    recordingsStore.createIndex('timestamp', 'timestamp');
                    recordingsStore.createIndex('status', 'status');
                    recordingsStore.createIndex('synced', 'synced');
                }
                
                // Chunks store - for crash protection during recording
                if (!database.objectStoreNames.contains(STORES.CHUNKS)) {
                    const chunksStore = database.createObjectStore(STORES.CHUNKS, { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    chunksStore.createIndex('sessionId', 'sessionId');
                    chunksStore.createIndex('sequence', 'sequence');
                }
                
                // Settings store - user preferences
                if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
                    database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }
                
                console.log('Database schema created/upgraded');
            };
        });
    }
    
    /**
     * Save a completed recording
     */
    async function saveRecording(blob, metadata = {}) {
        const recording = {
            blob,
            timestamp: new Date().toISOString(),
            duration: metadata.duration || 0,
            fileName: generateFileName(new Date()),
            drivePath: generateDrivePath(new Date()),
            status: 'pending', // pending, uploading, synced, failed
            synced: 0, // 0 = not synced, 1 = synced (IndexedDB requires numeric keys)
            retryCount: 0,
            lastRetry: null,
            fileSize: blob.size,
            mimeType: blob.type,
            ...metadata
        };
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const request = store.add(recording);
            
            request.onsuccess = () => {
                console.log('Recording saved, id:', request.result);
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('Failed to save recording:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Save a chunk during recording (crash protection)
     */
    async function saveChunk(sessionId, sequence, blob) {
        const chunk = {
            sessionId,
            sequence,
            blob,
            timestamp: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
            const store = transaction.objectStore(STORES.CHUNKS);
            const request = store.add(chunk);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get all chunks for a session (for recovery)
     */
    async function getSessionChunks(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.CHUNKS], 'readonly');
            const store = transaction.objectStore(STORES.CHUNKS);
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);
            
            request.onsuccess = () => {
                const chunks = request.result.sort((a, b) => a.sequence - b.sequence);
                resolve(chunks);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Clear chunks for a session
     */
    async function clearSessionChunks(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.CHUNKS], 'readwrite');
            const store = transaction.objectStore(STORES.CHUNKS);
            const index = store.index('sessionId');
            const request = index.openCursor(IDBKeyRange.only(sessionId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Recover recording from chunks (after crash)
     */
    async function recoverFromChunks(sessionId) {
        const chunks = await getSessionChunks(sessionId);
        if (chunks.length === 0) return null;
        
        const blobs = chunks.map(c => c.blob);
        const combinedBlob = new Blob(blobs, { type: blobs[0].type });
        
        return combinedBlob;
    }
    
    /**
     * Get all unsynced recordings
     */
    async function getUnsyncedRecordings() {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('Database not initialised'));
                return;
            }
            const transaction = db.transaction([STORES.RECORDINGS], 'readonly');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const index = store.index('synced');
            
            // Use IDBKeyRange to ensure a valid key is used
            const request = index.getAll(IDBKeyRange.only(0)); // 0 = not synced
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                console.error('Failed to get unsynced recordings:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Mark a recording as synced
     */
    async function markRecordingAsSynced(id, driveId) {
        return updateRecordingStatus(id, 'synced', { driveId });
    }
    
    /**
     * Get all recordings
     */
    async function getAllRecordings() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readonly');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const recordings = request.result.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                resolve(recordings);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get a single recording by ID
     */
    async function getRecording(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readonly');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Update recording status
     */
    async function updateRecordingStatus(id, status, extraFields = {}) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const recording = getRequest.result;
                if (!recording) {
                    reject(new Error('Recording not found'));
                    return;
                }

                recording.status = status;
                recording.synced = status === 'synced' ? 1 : 0; // Convert to number
                
                if (status === 'synced') {
                    recording.syncedAt = new Date().toISOString();
                }
                
                Object.assign(recording, extraFields);
                
                const putRequest = store.put(recording);
                putRequest.onsuccess = () => resolve(recording);
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }
    
    /**
     * Increment retry count for failed upload
     */
    async function incrementRetryCount(id) {
        const recording = await getRecording(id);
        if (!recording) return;
        
        return updateRecordingStatus(id, recording.status, {
            retryCount: (recording.retryCount || 0) + 1,
            lastRetry: new Date().toISOString()
        });
    }
    
    /**
     * Delete a recording
     */
    async function deleteRecording(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Delete all synced recordings
     */
    async function clearSyncedRecordings() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.RECORDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.RECORDINGS);
            const index = store.index('synced');
            const request = index.openCursor(IDBKeyRange.only(1)); // 1 = synced
            
            let count = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    count++;
                    cursor.continue();
                } else {
                    console.log(`Cleared ${count} synced recordings`);
                    resolve(count);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get/Set settings
     */
    async function getSetting(key, defaultValue = null) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SETTINGS], 'readonly');
            const store = transaction.objectStore(STORES.SETTINGS);
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : defaultValue);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async function setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
            const store = transaction.objectStore(STORES.SETTINGS);
            const request = store.put({ key, value });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get storage estimate
     */
    async function getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                percent: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
            };
        }
        return { usage: 0, quota: 0, percent: 0 };
    }
    
    /**
     * Check for orphaned chunks (from crashed sessions)
     */
    async function getOrphanedSessions() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.CHUNKS], 'readonly');
            const store = transaction.objectStore(STORES.CHUNKS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const chunks = request.result;
                const sessions = [...new Set(chunks.map(c => c.sessionId))];
                resolve(sessions);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    // Helper functions
    function generateFileName(date) {
        const pad = (n) => n.toString().padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = pad(date.getHours());
        const min = pad(date.getMinutes());
        const s = pad(date.getSeconds());
        return `${y}-${m}-${d}_${h}-${min}-${s}.webm`;
    }
    
    function generateDrivePath(date) {
        const y = date.getFullYear().toString();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `recordings/${y}/${m}/${d}`;
    }
    
    // Public API
    return {
        init,
        saveRecording,
        saveChunk,
        getSessionChunks,
        clearSessionChunks,
        recoverFromChunks,
        getUnsyncedRecordings,
        markRecordingAsSynced,
        getAllRecordings,
        getRecording,
        updateRecordingStatus,
        incrementRetryCount,
        deleteRecording,
        clearSyncedRecordings,
        getSetting,
        setSetting,
        getStorageEstimate,
        getOrphanedSessions
    };
})();
