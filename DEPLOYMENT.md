# Demà OS - Deployment Configuration

## Static Hosting Options

This website is a static site that can be deployed to any static hosting service:

### Netlify
1. Connect your GitHub repository
2. Set build command: `echo "No build needed"`
3. Set publish directory: `/`
4. Deploy!

### Vercel
1. Import GitHub repository
2. Framework preset: Other
3. Build command: (leave empty)
4. Output directory: (leave empty)
5. Deploy!

### GitHub Pages
1. Go to repository Settings > Pages
2. Source: Deploy from a branch
3. Branch: main / (root)
4. Save

### Cloudflare Pages
1. Connect GitHub repository
2. Build command: (leave empty)
3. Build output directory: (leave empty)
4. Deploy!

## Local Development

```bash
# Install serve globally
npm install -g serve

# Serve locally
serve .

# Or use Python
python -m http.server 8000

# Or use Node.js
npx serve .
```

## Performance Optimizations

- All images are inline SVG for fast loading
- CSS and JS are minified-ready
- Uses system fonts with web font fallbacks
- Responsive images through CSS
- Minimal external dependencies

## Domain Configuration

For custom domain (demaband.cat):
1. Add CNAME record pointing to your hosting provider
2. Configure SSL certificate
3. Update canonical URLs in HTML meta tags

## SEO Optimizations

The site includes:
- Proper meta tags
- Semantic HTML structure
- Alt text for images
- Open Graph tags (can be added)
- Schema.org markup (can be added)

Add these meta tags for better SEO:

```html
<meta property="og:title" content="Demà - Catalan Indie Band">
<meta property="og:description" content="Demà is a small Catalan indie band making dreamy, honest music — en català i sense trompetes.">
<meta property="og:image" content="https://demaband.cat/og-image.jpg">
<meta property="og:url" content="https://demaband.cat">
<meta name="twitter:card" content="summary_large_image">
```
