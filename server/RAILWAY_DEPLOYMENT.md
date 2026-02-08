# 🚂 Railway Deployment Guide

This guide will help you deploy the Zink Zaika backend server to Railway.

---

## ✅ Pre-Deployment Checklist

Your backend is now **100% Railway-ready** with the following configurations:

### ✅ package.json
- ✅ Valid `"start": "node server.js"` script
- ✅ Correct main file: `"main": "server.js"`
- ✅ All runtime dependencies in `dependencies` (not `devDependencies`)

### ✅ server.js
- ✅ Uses `process.env.PORT || 5000`
- ✅ No hardcoded ports
- ✅ Has `app.use(express.json())`
- ✅ Proper CORS configuration with environment variables
- ✅ Health check route: `GET /`

### ✅ Database
- ✅ Uses `process.env.MONGO_URI`
- ✅ No localhost MongoDB URLs in production
- ✅ Proper error handling with try-catch

### ✅ Security
- ✅ No secrets hardcoded
- ✅ `.env` in `.gitignore`
- ✅ Environment variables ready for Railway

---

## 🚀 Deployment Steps

### Step 1: Prepare MongoDB Atlas (if not already done)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist all IP addresses (0.0.0.0/0) for Railway
5. Get your connection string (looks like):
   ```
   mongodb+srv://username:password@cluster.mongodb.net/zink_zaika?retryWrites=true&w=majority
   ```

---

### Step 2: Deploy to Railway

1. **Go to [Railway.app](https://railway.app/)**
2. **Sign in** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your repository**
6. **Set Root Directory**:
   - Click on your service
   - Go to **Settings** → **Root Directory**
   - Set to: `/server`
   - Click **Update**

---

### Step 3: Configure Environment Variables

In Railway Dashboard:

1. Click on your service
2. Go to **Variables** tab
3. Add the following variables:

```bash
# Required Variables
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/zink_zaika?retryWrites=true&w=majority
ADMIN_SECRET_CODE=ADMIN2024

# Optional - Frontend URLs for CORS (add after deploying frontend)
CLIENT_URL=https://your-client-app.vercel.app
ADMIN_URL=https://your-admin-dashboard.vercel.app
```

**Important Notes:**
- Replace `MONGO_URI` with your actual MongoDB Atlas connection string
- Replace `CLIENT_URL` and `ADMIN_URL` with your actual frontend URLs
- You can add `CLIENT_URL` and `ADMIN_URL` later after deploying your frontend
- Railway will automatically set `PORT` - you don't need to add it

---

### Step 4: Deploy

1. Railway will automatically deploy after you push to GitHub
2. Wait for the build to complete
3. Once deployed, Railway will provide you with a URL like:
   ```
   https://your-app-name.up.railway.app
   ```

---

### Step 5: Verify Deployment

Test your API by visiting:
```
https://your-app-name.up.railway.app/
```

You should see: **"API is running..."**

Test an API endpoint:
```
https://your-app-name.up.railway.app/api/items
```

---

## 🔧 Railway Configuration Summary

### Build Command
Railway will automatically run:
```bash
npm install
```

### Start Command
Railway will automatically run:
```bash
npm start
```
(which executes `node server.js`)

### Root Directory
```
/server
```

---

## 🌐 CORS Configuration

The backend is configured to accept requests from:

**Development (Local):**
- `http://localhost:5173` (Client)
- `http://localhost:5174` (Admin)

**Production:**
- Value of `CLIENT_URL` environment variable
- Value of `ADMIN_URL` environment variable

This means:
- ✅ Works locally without environment variables
- ✅ Works in production with environment variables
- ✅ No code changes needed between environments

---

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGO_URI` | ✅ Yes | MongoDB connection string | `mongodb+srv://...` |
| `ADMIN_SECRET_CODE` | ✅ Yes | Admin dashboard access code | `ADMIN2024` |
| `CLIENT_URL` | ⚠️ Optional* | Frontend client URL for CORS | `https://client.vercel.app` |
| `ADMIN_URL` | ⚠️ Optional* | Admin dashboard URL for CORS | `https://admin.vercel.app` |
| `PORT` | ❌ No | Railway sets this automatically | Auto-set by Railway |

*Optional during initial deployment, but required for production frontend access

---

## 🔍 Troubleshooting

### Build Fails
- Check that root directory is set to `/server`
- Verify `package.json` has all dependencies
- Check Railway logs for specific errors

### Database Connection Error
- Verify `MONGO_URI` is correct
- Check MongoDB Atlas IP whitelist (should include 0.0.0.0/0)
- Ensure database user has correct permissions

### CORS Errors
- Add `CLIENT_URL` and `ADMIN_URL` to Railway environment variables
- Ensure URLs don't have trailing slashes
- Check that frontend is making requests to the correct Railway URL

### 502 Bad Gateway
- Check that server is listening on `process.env.PORT`
- Verify no hardcoded ports in code
- Check Railway logs for startup errors

---

## 🎯 Next Steps After Deployment

1. **Update Frontend Config Files**
   
   Update `client/src/config.js`:
   ```javascript
   const API_URL = import.meta.env.VITE_API_BASE_URL || "https://your-app.up.railway.app/api";
   ```

   Update `AdminDashbord/src/config.js`:
   ```javascript
   const API_URL = import.meta.env.VITE_API_BASE_URL || "https://your-app.up.railway.app/api";
   ```

2. **Deploy Frontend to Vercel/Netlify**

3. **Update Railway Environment Variables**
   - Add `CLIENT_URL` with your deployed client URL
   - Add `ADMIN_URL` with your deployed admin URL

4. **Test Everything**
   - Test API endpoints
   - Test frontend-to-backend communication
   - Test Socket.IO real-time features
   - Test file uploads

---

## 📊 Monitoring

In Railway Dashboard:
- **Deployments**: View deployment history and logs
- **Metrics**: Monitor CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Settings**: Update environment variables, domains, etc.

---

## 🎉 Success!

Your backend is now deployed and running on Railway! 🚀

**Your API URL**: `https://your-app-name.up.railway.app`

**Health Check**: `https://your-app-name.up.railway.app/`

**API Endpoints**: `https://your-app-name.up.railway.app/api/*`

---

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

**Last Updated**: 2026-01-08
**Status**: ✅ Ready for Production Deployment
