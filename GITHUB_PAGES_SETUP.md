# GitHub Pages Setup for the Gospel Study & Presentations Hub

> **Note:** GitHub Pages is already enabled for this repository — the steps below are
> kept as reference. The repository was renamed `church` → `hub`; GitHub permanently
> redirects the old path, so any bookmark to `ssoward/church` still resolves.

Repository: **https://github.com/ssoward/hub**

## 🚀 Enable GitHub Pages (Free Hosting)

### Step 1: Enable GitHub Pages
1. Go to your repository: https://github.com/ssoward/hub
2. Click on **Settings** (in the repository menu)
3. Scroll down to **Pages** in the left sidebar
4. Under **Source**, select **"Deploy from a branch"**
5. Choose **Branch: `main`** and **`/ (root)`**
6. Click **Save**

### Step 2: Access Your Live App
After 1-2 minutes, your app will be live at:
**https://ssoward.github.io/hub/**

### Step 3: Test Your App
Once live, test these features:
- [ ] Navigate through all pages (Scripture, Analysis, Gallery, Applications)
- [ ] Test search functionality
- [ ] Try installing as PWA (Add to Home Screen)
- [ ] Test offline functionality (turn off internet, reload)
- [ ] Check responsive design on mobile devices

## 🔧 Alternative Deployment Options

### Vercel (Recommended for Production)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (run from your local project directory)
vercel

# Follow prompts to connect to GitHub repo
```

### Netlify
1. Go to [netlify.com](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub account
4. Select the `ssoward/hub` repository
5. Deploy settings:
   - Build command: (leave empty)
   - Publish directory: `/` (root)
6. Click "Deploy site"

### Custom Domain Setup (Optional)
If you want a custom domain like `alma31study.org`:

**GitHub Pages:**
1. Go to repository Settings > Pages
2. Add your custom domain in the "Custom domain" field
3. Create a CNAME record in your DNS settings pointing to `ssoward.github.io`

**Vercel/Netlify:**
- Both platforms have simple custom domain setup in their dashboards

## 📊 Performance Optimization Tips

Once deployed, run these checks:
1. **Lighthouse Audit** (in Chrome DevTools)
   - Performance: Should score 90+
   - Accessibility: Should score 95+
   - PWA: Should score 100

2. **PWA Installation Test**
   - Visit site on mobile
   - Look for "Add to Home Screen" prompt
   - Install and test offline functionality

3. **Cross-Browser Testing**
   - Chrome, Firefox, Safari, Edge
   - Mobile browsers (iOS Safari, Android Chrome)

## 🎯 Next Steps After Deployment

1. **Share Your App**: Once live, share the URL with family, friends, or your congregation
2. **Gather Feedback**: Use the contact information in the About page
3. **Add Real Images**: Replace placeholder images with actual artwork
4. **Monitor Usage**: Consider adding Google Analytics if desired

## 🔄 Making Updates

To update your app after deployment:
```bash
# Make changes to files
# Then commit and push
git add .
git commit -m "Update content or fix issues"
git push

# Changes will automatically deploy to GitHub Pages
# For Vercel/Netlify, they auto-deploy on git push too
```

---

**Repository**: https://github.com/ssoward/hub
**Live Site**: https://ssoward.github.io/hub/
**Features**: Gospel presentations, tech talks, activities, conference schedules, and the Alma 31 study app — with PWA/offline support