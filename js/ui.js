/**
 * Voice to Drive - UI Service
 * Handles all interface updates and state management
 */

const UIService = (function() {
    // DOM Elements (cached on init)
    const elements = {};
    
    // Timer
    let timerInterval = null;
    
    // Visualiser
    let visualiserInterval = null;
    
    /**
     * Initialise UI - cache DOM elements
     */
    function init() {
        // Screens
        elements.setupScreen = document.getElementById('setup-screen');
        elements.mainScreen = document.getElementById('main-screen');
        
        // Setup elements
        elements.micSelect = document.getElementById('mic-select');
        elements.btnTestMic = document.getElementById('btn-test-mic');
        elements.micTestResult = document.getElementById('mic-test-result');
        elements.btnConnectDrive = document.getElementById('btn-connect-drive');
        elements.driveStatus = document.getElementById('drive-status');
        elements.btnStartApp = document.getElementById('btn-start-app');
        
        // Main screen elements
        elements.connectionStatus = document.getElementById('connection-status');
        elements.syncStatus = document.getElementById('sync-status');
        elements.btnSettings = document.getElementById('btn-settings');
        elements.timer = document.getElementById('timer');
        elements.statusMessage = document.getElementById('status-message');
        elements.visualiser = document.getElementById('visualiser');
        elements.btnRecord = document.getElementById('btn-record');
        elements.controlHint = document.getElementById('control-hint');
        elements.secondaryControls = document.getElementById('secondary-controls');
        elements.btnPause = document.getElementById('btn-pause');
        elements.btnStop = document.getElementById('btn-stop');
        elements.btnCancel = document.getElementById('btn-cancel');
        elements.recordingsPanel = document.getElementById('recordings-panel');
        elements.btnToggleRecordings = document.getElementById('btn-toggle-recordings');
        elements.recordingsList = document.getElementById('recordings-list');
        
        // Settings modal
        elements.settingsModal = document.getElementById('settings-modal');
        elements.btnCloseSettings = document.getElementById('btn-close-settings');
        elements.settingsMic = document.getElementById('settings-mic');
        elements.settingsQuality = document.getElementById('settings-quality');
        elements.settingsAutosave = document.getElementById('settings-autosave');
        elements.settingsDriveInfo = document.getElementById('settings-drive-info');
        elements.btnDisconnectDrive = document.getElementById('btn-disconnect-drive');
        elements.storageInfo = document.getElementById('storage-info');
        elements.btnClearSynced = document.getElementById('btn-clear-synced');
        
        // Toast container
        elements.toastContainer = document.getElementById('toast-container');
        
        // Get visualiser bars
        elements.visualiserBars = elements.visualiser.querySelectorAll('.bar');
        
        console.log('UI initialised');
    }
    
    /**
     * Show a specific screen
     */
    function showScreen(screenName) {
        elements.setupScreen.classList.add('hidden');
        elements.mainScreen.classList.add('hidden');
        
        if (screenName === 'setup') {
            elements.setupScreen.classList.remove('hidden');
        } else if (screenName === 'main') {
            elements.mainScreen.classList.remove('hidden');
        }
    }
    
    /**
     * Populate microphone dropdown
     */
    function populateMicrophoneSelect(devices, selectedId = null) {
        const select = elements.micSelect;
        select.innerHTML = '';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label;
            if (device.deviceId === selectedId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // Also update settings dropdown
        elements.settingsMic.innerHTML = select.innerHTML;
        
        elements.btnTestMic.disabled = devices.length === 0;
    }
    
    /**
     * Show microphone test result
     */
    function showMicTestResult(status, message) {
        elements.micTestResult.textContent = message;
        elements.micTestResult.className = 'test-result ' + status;
    }
    
    /**
     * Show Drive connection status
     */
    function showDriveStatus(status, message) {
        elements.driveStatus.textContent = message;
        elements.driveStatus.className = 'connection-status ' + status;
        
        if (status === 'success') {
            elements.btnConnectDrive.textContent = 'Connected ✓';
            elements.btnConnectDrive.disabled = true;
        }
    }
    
    /**
     * Enable/disable start app button
     */
    function enableStartApp(enabled) {
        elements.btnStartApp.disabled = !enabled;
    }
    
    /**
     * Update connection status indicator
     */
    function updateConnectionStatus(online) {
        const indicator = elements.connectionStatus;
        const label = indicator.querySelector('.label');
        
        if (online) {
            indicator.classList.remove('offline');
            label.textContent = 'Online';
        } else {
            indicator.classList.add('offline');
            label.textContent = 'Offline';
        }
    }
    
    /**
     * Update sync status indicator
     */
    function updateSyncStatus(pendingCount, syncing = false) {
        const indicator = elements.syncStatus;
        const count = indicator.querySelector('.count');
        const label = indicator.querySelector('.label');
        
        if (syncing) {
            count.textContent = '↻';
            label.textContent = 'syncing...';
            indicator.classList.add('has-pending');
        } else if (pendingCount > 0) {
            count.textContent = pendingCount;
            label.textContent = 'pending';
            indicator.classList.add('has-pending');
        } else {
            count.textContent = '✓';
            label.textContent = 'synced';
            indicator.classList.remove('has-pending');
        }
    }
    
    /**
     * Update timer display
     */
    function updateTimer(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        elements.timer.querySelector('.hours').textContent = hours.toString().padStart(2, '0');
        elements.timer.querySelector('.minutes').textContent = minutes.toString().padStart(2, '0');
        elements.timer.querySelector('.seconds').textContent = secs.toString().padStart(2, '0');
    }
    
    /**
     * Start timer updates
     */
    function startTimer(getElapsedFn) {
        stopTimer();
        timerInterval = setInterval(() => {
            updateTimer(getElapsedFn());
        }, 200);
    }
    
    /**
     * Stop timer updates
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    /**
     * Update status message
     */
    function updateStatusMessage(message) {
        elements.statusMessage.textContent = message;
    }
    
    /**
     * Update visualiser with audio level
     */
    function updateVisualiser(level) {
        // Level is 0-1, convert to bar heights
        const bars = elements.visualiserBars;
        const baseHeight = 8;
        const maxHeight = 50;
        
        bars.forEach((bar, index) => {
            // Create wave effect based on index
            const offset = Math.abs(index - Math.floor(bars.length / 2)) / (bars.length / 2);
            const variation = Math.sin(Date.now() / 200 + index * 0.5) * 0.3 + 0.7;
            const height = baseHeight + (maxHeight - baseHeight) * level * (1 - offset * 0.5) * variation;
            bar.style.height = `${Math.max(baseHeight, height)}px`;
        });
    }
    
    /**
     * Reset visualiser to idle state
     */
    function resetVisualiser() {
        elements.visualiserBars.forEach(bar => {
            bar.style.height = '8px';
        });
    }
    
    /**
     * Set recording state
     */
    function setRecordingState(state) {
        const recordingArea = document.querySelector('.recording-area');
        const mainScreen = elements.mainScreen;
        
        // Remove all state classes
        recordingArea.classList.remove('recording', 'paused');
        mainScreen.classList.remove('recording', 'paused');
        
        switch (state) {
            case 'idle':
                elements.secondaryControls.classList.add('hidden');
                elements.controlHint.style.display = '';
                elements.controlHint.textContent = 'Tap to start recording';
                resetVisualiser();
                stopTimer();
                updateTimer(0);
                updateStatusMessage('Ready to record');
                break;
                
            case 'recording':
                recordingArea.classList.add('recording');
                mainScreen.classList.add('recording');
                elements.secondaryControls.classList.remove('hidden');
                elements.controlHint.style.display = 'none';
                elements.btnPause.classList.remove('paused');
                elements.btnPause.querySelector('span').textContent = 'Pause';
                updateStatusMessage('Recording');
                break;
                
            case 'paused':
                recordingArea.classList.add('paused');
                mainScreen.classList.add('paused');
                elements.secondaryControls.classList.remove('hidden');
                elements.controlHint.style.display = 'none';
                elements.btnPause.classList.add('paused');
                elements.btnPause.querySelector('span').textContent = 'Resume';
                resetVisualiser();
                updateStatusMessage('Paused');
                break;
        }
    }
    
    /**
     * Update recordings list
     */
    function updateRecordingsList(recordings) {
        const list = elements.recordingsList;
        list.innerHTML = '';
        
        if (recordings.length === 0) {
            list.innerHTML = '<p class="empty-message">No recordings yet</p>';
            return;
        }
        
        recordings.slice(0, 20).forEach(recording => {
            const item = document.createElement('div');
            item.className = 'recording-item';
            
            const date = new Date(recording.timestamp);
            const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const duration = formatDuration(recording.duration);
            
            let statusClass, statusText;
            switch (recording.status) {
                case 'synced':
                    statusClass = 'synced';
                    statusText = '✓ Synced';
                    break;
                case 'uploading':
                    statusClass = 'uploading';
                    statusText = '↻ Uploading';
                    break;
                case 'failed':
                    statusClass = 'pending';
                    statusText = '! Failed';
                    break;
                default:
                    statusClass = 'pending';
                    statusText = '○ Pending';
            }
            
            item.innerHTML = `
                <span class="time">${time}</span>
                <span class="duration">${duration}</span>
                <span class="status ${statusClass}">${statusText}</span>
            `;
            
            list.appendChild(item);
        });
    }
    
    /**
     * Toggle recordings panel
     */
    function toggleRecordingsPanel(show) {
        const btn = elements.btnToggleRecordings;
        const list = elements.recordingsList;
        
        if (show === undefined) {
            show = list.hidden;
        }
        
        list.hidden = !show;
        btn.setAttribute('aria-expanded', show);
    }
    
    /**
     * Show/hide settings modal
     */
    function showSettings(show) {
        if (show) {
            elements.settingsModal.classList.remove('hidden');
        } else {
            elements.settingsModal.classList.add('hidden');
        }
    }
    
    /**
     * Update settings modal with current values
     */
    function updateSettings(settings) {
        if (settings.devices) {
            populateMicrophoneSelect(settings.devices, settings.selectedMic);
        }
        
        if (settings.quality) {
            elements.settingsQuality.value = settings.quality;
        }
        
        if (settings.autosave !== undefined) {
            elements.settingsAutosave.checked = settings.autosave;
        }
        
        if (settings.driveUser) {
            elements.settingsDriveInfo.textContent = `Connected as ${settings.driveUser.email}`;
        } else {
            elements.settingsDriveInfo.textContent = 'Not connected';
        }
        
        if (settings.storage) {
            const percent = settings.storage.percent.toFixed(1);
            const used = formatBytes(settings.storage.usage);
            const quota = formatBytes(settings.storage.quota);
            
            elements.storageInfo.querySelector('.storage-used').style.width = `${percent}%`;
            elements.storageInfo.querySelector('.storage-text').textContent = `${used} of ${quota} used (${percent}%)`;
        }
    }
    
    /**
     * Show toast notification
     */
    function toast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        elements.toastContainer.appendChild(toast);
        
        // Remove after animation
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    /**
     * Show confirmation dialog
     */
    function confirm(message) {
        return window.confirm(message);
    }
    
    // Helper functions
    
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        if (mins >= 60) {
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }
    
    // Public API
    return {
        init,
        showScreen,
        populateMicrophoneSelect,
        showMicTestResult,
        showDriveStatus,
        enableStartApp,
        updateConnectionStatus,
        updateSyncStatus,
        updateTimer,
        startTimer,
        stopTimer,
        updateStatusMessage,
        updateVisualiser,
        resetVisualiser,
        setRecordingState,
        updateRecordingsList,
        toggleRecordingsPanel,
        showSettings,
        updateSettings,
        toast,
        confirm,
        elements
    };
})();
