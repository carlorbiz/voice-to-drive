# Voice-to-Drive Deployment Instructions for Claude Code

## Context
Carla has a new Voice-to-Drive PWA that needs to replace the existing repo contents and be deployed. The zip file contains a complete, working PWA for hands-free voice recording with Google Drive sync.

## Priority: Get It Live

### Step 1: Replace Repo Contents

```bash
# Navigate to the voice-to-drive repo
cd ~/path/to/voice-to-drive

# Backup current contents (optional)
git checkout -b backup-old-version
git add -A && git commit -m "Backup old version"
git checkout main

# Remove old files (keep .git)
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +

# Extract new files from zip (Carla will provide location)
unzip ~/Downloads/voice-to-drive.zip
mv voice-to-drive/* .
rm -rf voice-to-drive

# Commit new version
git add -A
git commit -m "Complete rebuild: continuous recording, device selection, crash protection"
git push origin main
```

### Step 2: Generate PNG Icons

The app has an SVG icon but needs PNG versions for PWA manifest.

```bash
# Option A: Using ImageMagick
cd icons
for size in 72 96 128 144 152 192 384 512; do
  convert -background none icon.svg -resize ${size}x${size} icon-${size}.png
done

# Option B: Use online tool
# Go to https://realfavicongenerator.net/ and upload icon.svg
```

### Step 3: Get Google Cloud Credentials

1. Go to https://console.cloud.google.com/
2. Create project "Voice-to-Drive" (or use existing)
3. Enable Google Drive API:
   - APIs & Services > Library > Search "Google Drive API" > Enable
4. Create OAuth credentials:
   - APIs & Services > Credentials > Create Credentials > OAuth client ID
   - Application type: Web application
   - Name: Voice-to-Drive
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://voice-to-drive.netlify.app` (or your domain)
   - Save the **Client ID**

### Step 4: Configure the App

Edit `js/app.js` line 8:

```javascript
const CONFIG = {
    GOOGLE_CLIENT_ID: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
    // ...
};
```

Commit and push.

### Step 5: Deploy to Netlify

```bash
# Option A: Netlify CLI
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod

# Option B: Netlify Dashboard
# 1. Go to https://app.netlify.com/
# 2. New site from Git
# 3. Connect GitHub repo
# 4. Build command: (leave empty)
# 5. Publish directory: .
# 6. Deploy
```

### Step 6: Update OAuth Origins

After deployment, add the Netlify URL to Google OAuth:
1. Google Cloud Console > APIs & Services > Credentials
2. Edit your OAuth client
3. Add Netlify URL to "Authorized JavaScript origins"
4. Save

---

## Architecture Summary (For Context)

**What This App Does:**
- Continuous voice recording (no fragmentation from pauses)
- Works with any microphone including headphones
- Saves chunks every 30 seconds (crash protection)
- Queues recordings in IndexedDB when offline
- Syncs to Google Drive with Year/Month/Day folders
- Dark mode, glanceable UI for driving

**Key Files:**
- `js/app.js` - Main coordinator, contains Google credentials
- `js/recorder.js` - Audio recording with device selection
- `js/storage.js` - IndexedDB for offline queue
- `js/drive.js` - Google OAuth and Drive API
- `js/ui.js` - UI state management
- `sw.js` - Service worker for offline PWA

**Future Additions (Not In This Version):**
- Supabase backend for cloud backup
- Self-hosted Whisper transcription
- n8n workflow integration

---

## Testing Checklist

- [ ] App loads without errors
- [ ] Can select microphone (including headphones)
- [ ] Mic test shows "Audio detected"
- [ ] Google Drive connects successfully
- [ ] Recording starts/stops cleanly
- [ ] Timer updates during recording
- [ ] Pause/Resume works
- [ ] Recording saves to local queue
- [ ] Recording uploads to Drive when online
- [ ] Correct folder structure: Voice Recordings/2026/01/03/
- [ ] PWA installs to home screen
- [ ] Works offline (records, queues for sync)

---

## Troubleshooting

**"Failed to load Google API"**
- Check internet connection
- Verify Client ID is correct
- Check browser console for specific error

**"Microphone access denied"**
- Must be on HTTPS (or localhost)
- Check browser permissions

**PWA won't install**
- Must be HTTPS
- Check manifest.json is accessible
- Check service worker registered (DevTools > Application)

**Drive upload fails**
- Check OAuth token hasn't expired
- Verify Drive API is enabled in Google Cloud
- Check browser console for 401/403 errors

---

## Questions for Carla

If anything is unclear:
1. What's the GitHub repo URL?
2. Does she have existing Google Cloud project to use?
3. Preferred hosting (Netlify/Vercel/other)?
4. Any custom domain to configure?
