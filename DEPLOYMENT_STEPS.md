# Voice-to-Drive Deployment Guide for Carla

## 🎯 Deployment Checklist

- [ ] Step 1: Create GitHub Repository
- [ ] Step 2: Push Code to GitHub
- [ ] Step 3: Generate PNG Icons
- [ ] Step 4: Set Up Google OAuth
- [ ] Step 5: Deploy to CloudFlare Pages
- [ ] Step 6: Configure DNS
- [ ] Step 7: Update OAuth Origins
- [ ] Step 8: Test & Launch

---

## Step 1: Create GitHub Repository

1. Go to https://github.com/carlorbiz
2. Click "New" (green button)
3. Repository name: `voice-to-drive`
4. Description: `Hands-free PWA for recording voice notes with automatic Google Drive sync`
5. Choose: **Public**
6. **DO NOT** check "Initialize with README" (we already have files)
7. Click "Create repository"

**Copy the repository URL** (it will be: `https://github.com/carlorbiz/voice-to-drive.git`)

---

## Step 2: Push Code to GitHub

Open your terminal and run:

```bash
cd "C:\Users\carlo\Development\mem0-sync\mem0\github-projects\voice-to-drive-deploy"

# Add the GitHub remote
git remote add origin https://github.com/carlorbiz/voice-to-drive.git

# Push to GitHub
git branch -M main
git push -u origin main
```

✅ Your code is now on GitHub!

---

## Step 3: Generate PNG Icons

We need PNG icons for the PWA manifest. Let's use an online tool:

1. Go to: https://realfavicongenerator.net/
2. Upload the file: `voice-to-drive-deploy/icons/icon.svg`
3. Configure settings:
   - **iOS**: Select "Add a solid, plain background"
   - **Android Chrome**: Use default settings
   - **Path**: Set to `/icons/`
4. Click "Generate your Favicons and HTML code"
5. Download the package
6. Extract these files to `voice-to-drive-deploy/icons/`:
   - `icon-192.png` (192x192)
   - `icon-512.png` (512x512)
   - Any other sizes generated

**Or use this quick method:**
- Ask Claude to create the icons using canvas manipulation
- Use online tool: https://www.favicon-generator.org/

Then commit and push:
```bash
git add icons/*.png
git commit -m "Add PWA icons"
git push
```

---

## Step 4: Set Up Google OAuth

### 4.1 Create Google Cloud Project

1. Go to: https://console.cloud.google.com/
2. Click project dropdown (top left) → "New Project"
3. Project name: `Voice-to-Drive`
4. Click "Create"

### 4.2 Enable Google Drive API

1. In your project, go to: **APIs & Services** → **Library**
2. Search for: `Google Drive API`
3. Click on it → Click **"Enable"**

### 4.3 Create OAuth Consent Screen

1. Go to: **APIs & Services** → **OAuth consent screen**
2. User Type: **External** (unless you have Google Workspace)
3. Click "Create"
4. Fill in:
   - App name: `Voice-to-Drive`
   - User support email: `your-email@carlorbiz.com.au`
   - Developer contact: `your-email@carlorbiz.com.au`
5. Click "Save and Continue"
6. **Scopes**: Click "Add or Remove Scopes"
   - Search: `drive.file`
   - Select: `../auth/drive.file` (allows creating/editing own files only)
   - Click "Update" → "Save and Continue"
7. **Test users**: Add your Google email
8. Click "Save and Continue" → "Back to Dashboard"

### 4.4 Create OAuth Client ID

1. Go to: **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: `Voice-to-Drive Web Client`
5. **Authorized JavaScript origins**:
   - Add: `http://localhost:3000` (for testing)
   - Add: `https://voice.carlorbiz.com.au` (production)
   - Add: `https://voice-to-drive.pages.dev` (CloudFlare Pages preview)
6. **Authorized redirect URIs**: Leave empty (not needed for this app)
7. Click **"Create"**

**🔑 IMPORTANT: Copy your Client ID**

It will look like: `123456789-abc123def456.apps.googleusercontent.com`

**Save this somewhere safe!**

---

## Step 5: Configure the App

Edit `js/app.js` line 10:

```javascript
const CONFIG = {
    // Replace with your Google Cloud credentials
    GOOGLE_CLIENT_ID: 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com',
    // ... rest stays the same
};
```

Commit and push:
```bash
git add js/app.js
git commit -m "Configure Google OAuth Client ID"
git push
```

---

## Step 6: Deploy to CloudFlare Pages

### 6.1 Connect GitHub to CloudFlare

1. Log in to CloudFlare: https://dash.cloudflare.com/
2. Select your account
3. In the left sidebar, click **"Workers & Pages"**
4. Click **"Create application"**
5. Go to **"Pages"** tab
6. Click **"Connect to Git"**

### 6.2 Select Repository

1. Click **"Connect GitHub"** (if not already connected)
2. Authorize CloudFlare to access your repositories
3. Select: **`carlorbiz/voice-to-drive`**
4. Click **"Begin setup"**

### 6.3 Configure Build Settings

- **Project name**: `voice-to-drive` (or any name you prefer)
- **Production branch**: `main`
- **Framework preset**: None (select "None" or "Static HTML")
- **Build command**: Leave empty
- **Build output directory**: `/`
- **Root directory**: `/` (or leave empty)
- **Environment variables**: None needed

Click **"Save and Deploy"**

✅ CloudFlare will deploy your site!

**Your temporary URL will be:** `https://voice-to-drive.pages.dev`

---

## Step 7: Configure DNS for Custom Domain

### 7.1 Add Custom Domain

1. In CloudFlare Pages, go to your **voice-to-drive** project
2. Click **"Custom domains"** tab
3. Click **"Set up a custom domain"**
4. Enter: `voice.carlorbiz.com.au`
5. CloudFlare will automatically configure DNS
6. Click **"Activate domain"**

**DNS will propagate in 1-5 minutes.**

### 7.2 Verify HTTPS

CloudFlare automatically provisions SSL certificates. Your site will be:
- ✅ `https://voice.carlorbiz.com.au` (production)
- ✅ `https://voice-to-drive.pages.dev` (also works)

---

## Step 8: Update Google OAuth Origins

Now that you have your production URL, update Google Cloud:

1. Go back to: https://console.cloud.google.com/
2. Navigate to: **APIs & Services** → **Credentials**
3. Click on your **"Voice-to-Drive Web Client"**
4. Under **"Authorized JavaScript origins"**, make sure you have:
   - ✅ `http://localhost:3000`
   - ✅ `https://voice.carlorbiz.com.au`
   - ✅ `https://voice-to-drive.pages.dev`
5. Click **"Save"**

---

## Step 9: Test the App

### Test Locally First

```bash
cd "C:\Users\carlo\Development\mem0-sync\mem0\github-projects\voice-to-drive-deploy"

# Option 1: Python
python -m http.server 3000

# Option 2: Node.js (if installed)
npx serve -l 3000
```

Open: `http://localhost:3000`

**Test checklist:**
- [ ] App loads without errors
- [ ] Can select microphone
- [ ] Mic test shows "Audio detected"
- [ ] "Connect Google Drive" button works
- [ ] OAuth popup appears
- [ ] After authorizing, shows "Connected"
- [ ] Can start/stop recording
- [ ] Recording saves to local queue
- [ ] Recording uploads to Drive (check your Drive folder)

### Test Production

Open: `https://voice.carlorbiz.com.au`

**Full test:**
- [ ] PWA installs to home screen (mobile)
- [ ] Works offline (try recording with WiFi off)
- [ ] Syncs when back online
- [ ] Correct folder structure in Drive: `Voice Recordings/2026/01/03/`

---

## 🎉 Launch Complete!

Your app is now live at:
- **Production**: https://voice.carlorbiz.com.au
- **Preview**: https://voice-to-drive.pages.dev

---

## Troubleshooting

### "Failed to load Google API"
- Check Client ID is correct in `js/app.js`
- Verify OAuth origins include your production URL
- Check browser console for specific error

### "OAuth popup blocked"
- Allow popups for your site
- Try again

### "Microphone access denied"
- Site must be HTTPS (CloudFlare handles this)
- Check browser permissions

### PWA won't install
- Must be HTTPS ✅ (CloudFlare provides this)
- Check `manifest.json` is accessible
- Check service worker registered (DevTools → Application)

### Recording not syncing
- Check "Connected to Drive" status in app
- Check browser console for errors
- Verify internet connection
- Check pending count in header

---

## Next Steps

After deployment:
1. Update `DEPLOYMENT_INVENTORY.md` in mem0 repo
2. Test on mobile device (Android/iOS)
3. Install as PWA on phone
4. Test while actually driving (passenger records audio)
5. Consider adding to MTMOT ecosystem if useful

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| CloudFlare Pages | **FREE** (unlimited bandwidth) |
| Google Drive API | **FREE** (OAuth + Drive access) |
| Domain (carlorbiz.com.au) | Already owned |
| **Total** | **$0.00/month** ✨ |

---

**Questions?** Check the main README.md or deployment instructions.
