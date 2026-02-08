# 🚂 Railway Quick Deploy Reference

## ⚡ TL;DR - Deploy in 5 Minutes

### 1️⃣ Railway Setup
```
1. Go to railway.app
2. New Project → Deploy from GitHub
3. Select your repo
4. Settings → Root Directory → /server
```

### 2️⃣ Environment Variables (Railway Dashboard)
```bash
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/zink_zaika
ADMIN_SECRET_CODE=ADMIN2024
# Add these after frontend deployment:
CLIENT_URL=https://your-client.vercel.app
ADMIN_URL=https://your-admin.vercel.app
```

### 3️⃣ Verify
```
Visit: https://your-app.up.railway.app/
Should see: "API is running..."
```

---

## 📋 Deployment Checklist

- [ ] MongoDB Atlas cluster created
- [ ] MongoDB connection string ready
- [ ] Code pushed to GitHub
- [ ] Railway project created
- [ ] Root directory set to `/server`
- [ ] Environment variables added
- [ ] Deployment successful
- [ ] Health check working
- [ ] API endpoints tested

---

## 🔑 Required Environment Variables

| Variable | Example | When to Add |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb+srv://...` | ✅ Before first deploy |
| `ADMIN_SECRET_CODE` | `ADMIN2024` | ✅ Before first deploy |
| `CLIENT_URL` | `https://client.vercel.app` | ⏰ After frontend deploy |
| `ADMIN_URL` | `https://admin.vercel.app` | ⏰ After frontend deploy |

---

## 🧪 Test Your Deployment

```bash
# Health check
curl https://your-app.up.railway.app/

# Get items
curl https://your-app.up.railway.app/api/items

# Admin verify (POST request)
curl -X POST https://your-app.up.railway.app/api/admin/verify-code \
  -H "Content-Type: application/json" \
  -d '{"code":"ADMIN2024"}'
```

---

## 🆘 Common Issues

### Build Fails
→ Check root directory is `/server`

### Database Error
→ Verify MONGO_URI and IP whitelist (0.0.0.0/0)

### CORS Error
→ Add CLIENT_URL and ADMIN_URL to Railway variables

### 502 Error
→ Check Railway logs for startup errors

---

## 📱 Your URLs After Deployment

**Backend API**: `https://your-app.up.railway.app`  
**Health Check**: `https://your-app.up.railway.app/`  
**API Endpoints**: `https://your-app.up.railway.app/api/*`

Update these in your frontend config files!

---

## 📚 Full Documentation

For detailed instructions, see:
- `RAILWAY_DEPLOYMENT.md` - Complete deployment guide
- `DEPLOYMENT_SUMMARY.md` - Changes made summary

---

**Status**: ✅ Ready to Deploy  
**Build**: `npm install`  
**Start**: `npm start`  
**Root**: `/server`
