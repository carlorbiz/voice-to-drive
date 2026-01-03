/**
 * Voice to Drive - Main Application
 * Coordinates all services: Storage, Recorder, Drive, UI
 */

const App = (function() {
    // Configuration
    const CONFIG = {
        // Replace with your Google Cloud credentials
        GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
        GOOGLE_API_KEY: '', // Optional for Drive API
        
        // Recording settings
        DEFAULT_BITRATE: 64000,
        AUTOSAVE_ENABLED: true,
        
        // Sync settings
        SYNC_INTERVAL_MS: 30000,
        MAX_RETRY_COUNT: 5
    };
    
    // State
    let isReady = false;
    let selectedMicId = null;
    let syncInterval = null;
    let isSyncing = false;
    
    /**
     * Initialise the application
     */
    async function init() {
        try {
            console.log('Initialising Voice to Drive...');
            
            // Initialise UI
            UIService.init();
            
            // Initialise storage
            await StorageService.init();
            console.log('Storage initialised');
            
            // Load saved settings
            selectedMicId = await StorageService.getSetting('selectedMic');
            
            // Configure Drive service
            DriveService.configure(CONFIG.GOOGLE_CLIENT_ID, CONFIG.GOOGLE_API_KEY);
            
            // Check for orphaned sessions (crash recovery)
            await checkForRecovery();
            
            // Set up event listeners
            setupEventListeners();
            
            // Update network status
            updateNetworkStatus();
            window.addEventListener('online', updateNetworkStatus);
            window.addEventListener('offline', updateNetworkStatus);
            
            // Check if setup is needed
            const setupComplete = await StorageService.getSetting('setupComplete');
            
            if (setupComplete) {
                await startApp();
            } else {
                await showSetup();
            }
            
            console.log('App initialised successfully');
            
        } catch (error) {
            console.error('Failed to initialise app:', error);
            UIService.toast('Failed to start app: ' + error.message, 'error');
        }
    }
    
    /**
     * Show setup screen
     */
    async function showSetup() {
        UIService.showScreen('setup');
        
        // Get available microphones
        try {
            const devices = await RecorderService.getAudioDevices();
            UIService.populateMicrophoneSelect(devices, selectedMicId);
        } catch (error) {
            UIService.showMicTestResult('error', 'Microphone access denied. Please allow microphone access.');
        }
        
        // Check Drive connection
        try {
            const signedIn = await DriveService.init();
            if (signedIn) {
                const user = DriveService.getCurrentUser();
                UIService.showDriveStatus('success', `Connected as ${user?.email || 'Unknown'}`);
                checkSetupComplete();
            }
        } catch (error) {
            console.error('Drive init error:', error);
        }
    }
    
    /**
     * Start the main app
     */
    async function startApp() {
        UIService.showScreen('main');
        
        // Initialise Drive if not already
        if (!DriveService.isAuthenticated()) {
            try {
                await DriveService.init();
            } catch (error) {
                console.error('Drive init error:', error);
            }
        }
        
        // Initialise recorder with saved mic
        try {
            await RecorderService.init(selectedMicId, CONFIG.DEFAULT_BITRATE);
            
            // Set up recorder callbacks
            RecorderService.setCallbacks({
                onAudioLevel: (level) => {
                    if (RecorderService.getState() === 'recording') {
                        UIService.updateVisualiser(level);
                    }
                },
                onChunkSaved: (info) => {
                    console.log('Chunk saved:', info);
                },
                onError: (error) => {
                    console.error('Recorder error:', error);
                    UIService.toast('Recording error: ' + error.message, 'error');
                }
            });
        } catch (error) {
            UIService.toast('Failed to access microphone', 'error');
        }
        
        // Start sync interval
        startSyncInterval();
        
        // Update UI
        await updateRecordingsList();
        await updateSyncStatus();
        
        isReady = true;
    }
    
    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Setup screen
        UIService.elements.micSelect?.addEventListener('change', handleMicChange);
        UIService.elements.btnTestMic?.addEventListener('click', handleTestMic);
        UIService.elements.btnConnectDrive?.addEventListener('click', handleConnectDrive);
        UIService.elements.btnStartApp?.addEventListener('click', handleStartApp);
        
        // Main screen
        UIService.elements.btnRecord?.addEventListener('click', handleRecordToggle);
        UIService.elements.btnPause?.addEventListener('click', handlePause);
        UIService.elements.btnStop?.addEventListener('click', handleStop);
        UIService.elements.btnCancel?.addEventListener('click', handleCancel);
        UIService.elements.btnSettings?.addEventListener('click', () => showSettings(true));
        UIService.elements.btnToggleRecordings?.addEventListener('click', () => UIService.toggleRecordingsPanel());
        
        // Settings modal
        UIService.elements.settingsModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => showSettings(false));
        UIService.elements.btnCloseSettings?.addEventListener('click', () => showSettings(false));
        UIService.elements.settingsMic?.addEventListener('change', handleSettingsMicChange);
        UIService.elements.settingsQuality?.addEventListener('change', handleSettingsQualityChange);
        UIService.elements.settingsAutosave?.addEventListener('change', handleSettingsAutosaveChange);
        UIService.elements.btnDisconnectDrive?.addEventListener('click', handleDisconnectDrive);
        UIService.elements.btnClearSynced?.addEventListener('click', handleClearSynced);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeydown);
        
        // Visibility change (for pause on tab switch)
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Before unload (save any in-progress recording)
        window.addEventListener('beforeunload', handleBeforeUnload);
    }
    
    // Event Handlers
    
    async function handleMicChange(e) {
        selectedMicId = e.target.value;
        await StorageService.setSetting('selectedMic', selectedMicId);
        UIService.showMicTestResult('', '');
        checkSetupComplete();
    }
    
    async function handleTestMic() {
        const deviceId = UIService.elements.micSelect.value;
        
        UIService.showMicTestResult('listening', 'Listening... Speak now');
        UIService.elements.btnTestMic.disabled = true;
        
        try {
            const result = await RecorderService.testMicrophone(deviceId, 3000);
            
            if (result.detected) {
                UIService.showMicTestResult('success', `✓ Audio detected! Level: ${Math.round(result.level * 100)}%`);
            } else {
                UIService.showMicTestResult('error', 'No audio detected. Check your microphone.');
            }
        } catch (error) {
            UIService.showMicTestResult('error', 'Failed to test microphone: ' + error.message);
        }
        
        UIService.elements.btnTestMic.disabled = false;
        checkSetupComplete();
    }
    
    async function handleConnectDrive() {
        try {
            UIService.elements.btnConnectDrive.disabled = true;
            UIService.elements.btnConnectDrive.textContent = 'Connecting...';
            
            await DriveService.signIn();
            
            const user = DriveService.getCurrentUser();
            UIService.showDriveStatus('success', `Connected as ${user?.email || 'Unknown'}`);
            checkSetupComplete();
            
        } catch (error) {
            console.error('Drive sign in error:', error);
            UIService.showDriveStatus('error', 'Failed to connect: ' + error.message);
            UIService.elements.btnConnectDrive.disabled = false;
            UIService.elements.btnConnectDrive.textContent = 'Connect to Google Drive';
        }
    }
    
    async function handleStartApp() {
        await StorageService.setSetting('setupComplete', true);
        await startApp();
    }
    
    function checkSetupComplete() {
        const micSelected = UIService.elements.micSelect.value;
        const driveConnected = DriveService.isAuthenticated();
        
        UIService.enableStartApp(micSelected && driveConnected);
    }
    
    async function handleRecordToggle() {
        const state = RecorderService.getState();
        
        if (state === 'inactive') {
            // Start recording
            try {
                RecorderService.start();
                UIService.setRecordingState('recording');
                UIService.startTimer(() => RecorderService.getElapsedTime());
                UIService.toast('Recording started', 'success');
            } catch (error) {
                UIService.toast('Failed to start recording: ' + error.message, 'error');
            }
        } else if (state === 'recording' || state === 'paused') {
            // Stop recording
            await handleStop();
        }
    }
    
    function handlePause() {
        const state = RecorderService.getState();
        
        if (state === 'recording') {
            RecorderService.pause();
            UIService.setRecordingState('paused');
        } else if (state === 'paused') {
            RecorderService.resume();
            UIService.setRecordingState('recording');
        }
    }
    
    async function handleStop() {
        try {
            UIService.updateStatusMessage('Saving...');
            
            const result = await RecorderService.stop();
            
            if (result && result.blob.size > 0) {
                // Save to local storage
                const recordingId = await StorageService.saveRecording(result.blob, {
                    duration: result.duration,
                    mimeType: result.mimeType
                });
                
                UIService.toast('Recording saved', 'success');
                
                // Update list
                await updateRecordingsList();
                
                // Trigger sync
                syncRecordings();
            }
            
            UIService.setRecordingState('idle');
            
        } catch (error) {
            console.error('Stop recording error:', error);
            UIService.toast('Error saving recording: ' + error.message, 'error');
            UIService.setRecordingState('idle');
        }
    }
    
    async function handleCancel() {
        if (!UIService.confirm('Cancel recording and discard?')) {
            return;
        }
        
        await RecorderService.cancel();
        UIService.setRecordingState('idle');
        UIService.toast('Recording cancelled', 'warning');
    }
    
    function handleKeydown(e) {
        // Space bar to toggle recording (when not in input)
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            e.preventDefault();
            handleRecordToggle();
        }
        
        // Escape to close modal
        if (e.code === 'Escape') {
            showSettings(false);
        }
    }
    
    function handleVisibilityChange() {
        // Auto-save chunk when app goes to background
        if (document.hidden && RecorderService.getState() === 'recording') {
            // The recorder service handles chunked saves internally
            console.log('App backgrounded during recording');
        }
    }
    
    function handleBeforeUnload(e) {
        if (RecorderService.getState() === 'recording') {
            e.preventDefault();
            e.returnValue = 'Recording in progress. Are you sure you want to leave?';
        }
    }
    
    async function showSettings(show) {
        if (show) {
            // Update settings with current values
            const devices = await RecorderService.getAudioDevices();
            const storage = await StorageService.getStorageEstimate();
            
            UIService.updateSettings({
                devices,
                selectedMic: selectedMicId,
                quality: CONFIG.DEFAULT_BITRATE,
                autosave: CONFIG.AUTOSAVE_ENABLED,
                driveUser: DriveService.getCurrentUser(),
                storage
            });
        }
        
        UIService.showSettings(show);
    }
    
    async function handleSettingsMicChange(e) {
        selectedMicId = e.target.value;
        await StorageService.setSetting('selectedMic', selectedMicId);
        
        // Reinitialise recorder if not recording
        if (RecorderService.getState() === 'inactive') {
            RecorderService.cleanup();
            await RecorderService.init(selectedMicId, CONFIG.DEFAULT_BITRATE);
        }
        
        UIService.toast('Microphone updated', 'success');
    }
    
    async function handleSettingsQualityChange(e) {
        CONFIG.DEFAULT_BITRATE = parseInt(e.target.value);
        await StorageService.setSetting('audioBitrate', CONFIG.DEFAULT_BITRATE);
        UIService.toast('Audio quality updated', 'success');
    }
    
    async function handleSettingsAutosaveChange(e) {
        CONFIG.AUTOSAVE_ENABLED = e.target.checked;
        await StorageService.setSetting('autosave', CONFIG.AUTOSAVE_ENABLED);
    }
    
    async function handleDisconnectDrive() {
        if (!UIService.confirm('Disconnect from Google Drive? Pending recordings will remain queued.')) {
            return;
        }
        
        await DriveService.signOut();
        UIService.updateSettings({ driveUser: null });
        UIService.toast('Disconnected from Google Drive', 'warning');
    }
    
    async function handleClearSynced() {
        const count = await StorageService.clearSyncedRecordings();
        await updateRecordingsList();
        UIService.toast(`Cleared ${count} synced recordings`, 'success');
        
        // Update storage display
        const storage = await StorageService.getStorageEstimate();
        UIService.updateSettings({ storage });
    }
    
    // Sync Functions
    
    function startSyncInterval() {
        stopSyncInterval();
        
        syncInterval = setInterval(() => {
            if (navigator.onLine && !isSyncing) {
                syncRecordings();
            }
        }, CONFIG.SYNC_INTERVAL_MS);
        
        // Initial sync
        syncRecordings();
    }
    
    function stopSyncInterval() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }
    
    async function syncRecordings() {
        if (isSyncing || !navigator.onLine || !DriveService.isAuthenticated()) {
            return;
        }
        
        isSyncing = true;
        
        try {
            const recordings = await StorageService.getUnsyncedRecordings();
            
            if (recordings.length === 0) {
                updateSyncStatus();
                return;
            }
            
            UIService.updateSyncStatus(recordings.length, true);
            
            for (const recording of recordings) {
                // Skip if too many retries
                if (recording.retryCount >= CONFIG.MAX_RETRY_COUNT) {
                    continue;
                }
                
                try {
                    // Update status to uploading
                    await StorageService.updateRecordingStatus(recording.id, 'uploading');
                    await updateRecordingsList();
                    
                    // Upload to Drive
                    const result = await DriveService.uploadRecording(
                        recording.blob,
                        recording.fileName,
                        recording.drivePath
                    );
                    
                    // Mark as synced
                    await StorageService.updateRecordingStatus(recording.id, 'synced', {
                        driveFileId: result.fileId
                    });
                    
                    console.log('Synced recording:', recording.id);
                    
                } catch (error) {
                    console.error('Failed to sync recording:', recording.id, error);
                    await StorageService.updateRecordingStatus(recording.id, 'failed');
                    await StorageService.incrementRetryCount(recording.id);
                }
            }
            
            await updateRecordingsList();
            
        } finally {
            isSyncing = false;
            updateSyncStatus();
        }
    }
    
    async function updateSyncStatus() {
        const recordings = await StorageService.getUnsyncedRecordings();
        UIService.updateSyncStatus(recordings.length, isSyncing);
    }
    
    async function updateRecordingsList() {
        const recordings = await StorageService.getAllRecordings();
        UIService.updateRecordingsList(recordings);
    }
    
    function updateNetworkStatus() {
        UIService.updateConnectionStatus(navigator.onLine);
        
        if (navigator.onLine) {
            syncRecordings();
        }
    }
    
    // Recovery Functions
    
    async function checkForRecovery() {
        const orphanedSessions = await StorageService.getOrphanedSessions();
        
        if (orphanedSessions.length > 0) {
            console.log('Found orphaned sessions:', orphanedSessions);
            
            for (const sessionId of orphanedSessions) {
                try {
                    const blob = await StorageService.recoverFromChunks(sessionId);
                    
                    if (blob && blob.size > 0) {
                        // Save recovered recording
                        await StorageService.saveRecording(blob, {
                            recovered: true,
                            originalSessionId: sessionId
                        });
                        
                        UIService.toast('Recovered recording from previous session', 'success');
                    }
                    
                    // Clear the chunks
                    await StorageService.clearSessionChunks(sessionId);
                    
                } catch (error) {
                    console.error('Failed to recover session:', sessionId, error);
                }
            }
        }
    }
    
    // Public API
    return {
        init,
        syncRecordings
    };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
