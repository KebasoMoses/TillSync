# 🚀 TillSync Deployment Guide

This guide will help you deploy TillSync to production on Cloudflare Pages.

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Git](https://git-scm.com/) installed
- Cloudflare account (free tier available)
- Basic terminal/command line knowledge

## 🎯 Quick Deployment (5 minutes)

### Step 1: Clone and Setup
```bash
git clone https://github.com/KebasoMoses/TillSync.git
cd TillSync
npm install
```

### Step 2: Cloudflare Authentication
```bash
# Login to Cloudflare (opens browser)
npx wrangler login

# Verify authentication
npx wrangler whoami
```

### Step 3: Create Production Database
```bash
# Create D1 database
npx wrangler d1 create tillsync-production

# Copy the database_id from the output
# Update wrangler.jsonc with the database_id
```

**Example output:**
```
✅ Successfully created DB tillsync-production (abc123-def456-ghi789)
```

**Update `wrangler.jsonc`:**
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tillsync-production", 
      "database_id": "abc123-def456-ghi789"  // ← Replace with your ID
    }
  ]
}
```

### Step 4: Setup Database Schema
```bash
# Apply migrations to production database
npm run db:migrate:prod

# Optional: Add sample data (for testing)
npx wrangler d1 execute tillsync-production --file=./seed.sql
```

### Step 5: Deploy to Production
```bash
# Build and deploy
npm run deploy:prod
```

**Expected output:**
```
✨ Success! Deployed to https://tillsync.pages.dev
🌍 Also available at: https://abc123.tillsync.pages.dev
```

## 🎉 That's it!

Your TillSync application is now live and ready for business use!

## 🔧 Advanced Configuration

### Custom Domain Setup
```bash
# Add custom domain (after deployment)
npx wrangler pages domain add yourdomain.com --project-name tillsync
```

### Environment Variables
```bash
# Add secrets for production
npx wrangler pages secret put API_KEY --project-name tillsync
npx wrangler pages secret put WEBHOOK_URL --project-name tillsync
```

### Update Deployment
```bash
# After making code changes
git add .
git commit -m "Your changes"
git push origin main

# Redeploy
npm run deploy:prod
```

## 🛠️ Local Development

### First Time Setup
```bash
npm run build
npm run db:migrate:local  
npm run db:seed
pm2 start ecosystem.config.cjs
```

### Daily Development
```bash
# Start development server
pm2 start ecosystem.config.cjs

# View logs
pm2 logs tillsync --nostream

# Stop server  
pm2 delete tillsync
```

### Database Management
```bash
# Reset local database
npm run db:reset

# Add new migration
# 1. Create file: migrations/XXXX_your_migration.sql
# 2. Run: npm run db:migrate:local

# Query local database
npm run db:console:local
# Example: SELECT * FROM transactions;

# Query production database  
npx wrangler d1 execute tillsync-production --command="SELECT COUNT(*) FROM transactions"
```

## 🔍 Troubleshooting

### Common Issues

**1. Authentication Error**
```bash
# Error: Not authenticated
npx wrangler login
```

**2. Database ID Not Found**
```bash
# Update wrangler.jsonc with correct database_id
npx wrangler d1 list  # Find your database ID
```

**3. Build Failures**
```bash
# Clear build cache
rm -rf dist .wrangler
npm run build
```

**4. Port Already in Use**
```bash
# Kill processes on port 3000
npm run clean-port
# or
fuser -k 3000/tcp
```

**5. Database Migration Fails**
```bash
# Check migration files syntax
# Ensure wrangler.jsonc has correct database_id
# Verify authentication: npx wrangler whoami
```

### Performance Optimization

**1. Database Indexing**
- Migrations include proper indexes
- Monitor query performance in Cloudflare dashboard

**2. Caching**
- Static assets cached automatically by Cloudflare CDN
- API responses cached at edge when appropriate

**3. Monitoring**
```bash
# View analytics
npx wrangler pages deployment list --project-name tillsync

# Check logs
npx wrangler pages deployment tail --project-name tillsync
```

## 📊 Production Checklist

Before going live:

- [ ] Database created and migrated
- [ ] Sample data removed (if not needed)  
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active (automatic)
- [ ] Error monitoring setup
- [ ] Backup strategy planned
- [ ] User training completed
- [ ] Mobile testing on actual devices
- [ ] SMS parsing tested with real messages

## 🔐 Security Considerations

### Data Protection
- All data encrypted in transit (HTTPS)
- Database encrypted at rest (Cloudflare D1)
- No sensitive data in client-side code
- API endpoints properly validated

### Access Control  
- No authentication required (single business use)
- Consider adding basic auth for multi-user setups
- Keep database credentials secure

### Backup Strategy
```bash
# Export data regularly
npx wrangler d1 export tillsync-production --output backup-$(date +%Y%m%d).sql

# Import backup if needed
npx wrangler d1 execute tillsync-production --file backup-20250101.sql
```

## 📞 Support

### Self-Help
1. Check this deployment guide
2. Review [README.md](README.md)  
3. Search [GitHub Issues](https://github.com/KebasoMoses/TillSync/issues)

### Community Support
- [GitHub Discussions](https://github.com/KebasoMoses/TillSync/discussions)
- [Open an Issue](https://github.com/KebasoMoses/TillSync/issues/new)

### Professional Support
For business implementation:
- Custom deployment assistance
- Training and onboarding  
- Feature development
- Integration with existing systems

Contact: Coming soon

---

**Happy deploying! 🚀 Your business transformation starts now.**