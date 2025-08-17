# 🔒 SECURITY & DEPLOYMENT GUIDE

## ⚠️ IMPORTANT: Before Deploying

### 1. Change the Admin Password
**CRITICAL:** The default admin password is `dema2025!` - change this immediately!

**Option A: Environment Variable (Recommended)**
```bash
export ADMIN_PASSWORD="your-super-strong-password-here"
npm start
```

**Option B: Create .env file**
1. Copy `.env.example` to `.env`
2. Change the `ADMIN_PASSWORD` value
3. The server will automatically use it

### 2. Admin Access
- **Local:** http://localhost:3001/admin?password=your-password-here
- **Production:** https://yourdomain.com/admin?password=your-password-here

⚠️ **NEVER share the admin URL publicly!**

### 3. Security Features Added
✅ **Authentication** - Admin panel is now password protected  
✅ **Input validation** - All user input is validated and sanitized  
✅ **Rate limiting** - Prevents spam/abuse (100 requests/minute per IP)  
✅ **Security headers** - Protects against common web vulnerabilities  
✅ **XSS protection** - User input is escaped to prevent script injection  
✅ **Error handling** - Better error messages without exposing system info  

### 4. Deployment Options

#### Static Hosting (Simple)
If you don't need the admin features, you can deploy just the static files:
- Upload `index.html`, `styles.css`, `script.js`, `assets/` to any web host
- The tour dates will be static (no editing via admin panel)

#### Full Server Deployment (Recommended)
For the complete experience with admin features:

**Heroku:**
```bash
git add .
git commit -m "Ready for deployment"
heroku create your-band-name
heroku config:set ADMIN_PASSWORD="your-password-here"
git push heroku main
```

**Netlify/Vercel:**
- These can host the static files
- For admin features, you'll need a server-capable host

**Traditional Web Host:**
- Ensure Node.js is supported
- Upload all files except `node_modules/`
- Run `npm install` on the server
- Set environment variable `ADMIN_PASSWORD`
- Start with `npm start`

### 5. What We Fixed

#### Before (Dangerous):
- ❌ Anyone could access `/admin` and modify your tour dates
- ❌ No input validation - attackers could inject harmful code
- ❌ No rate limiting - could be overwhelmed with requests
- ❌ Missing security headers

#### After (Secure):
- ✅ Admin panel requires password authentication
- ✅ All input is validated and sanitized
- ✅ Rate limiting prevents abuse
- ✅ Security headers protect against attacks
- ✅ Better error handling

### 6. Regular Maintenance
- Update dependencies: `npm update`
- Monitor for any suspicious activity in server logs
- Change admin password periodically
- Keep backups of your `data/` folder

### 7. Getting Help
If something breaks or you need help:
1. Check the server logs for error messages
2. Make sure all dependencies are installed: `npm install`
3. Verify the admin password is set correctly
4. Check that the `data/` folder has proper write permissions

---

**Your website is now much more secure and ready for deployment! 🚀**

Remember to test everything locally before deploying to production.
