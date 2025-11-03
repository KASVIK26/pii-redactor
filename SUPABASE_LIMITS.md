# Supabase Limits & Optimization Guide

## Free Plan Limits

| Resource | Limit | Details |
|----------|-------|---------|
| **API Requests** | 50,000/day | ~0.58 requests/second average |
| **Storage** | 1 GB | File storage quota |
| **Database** | 500 MB | PostgreSQL database size |
| **Bandwidth** | 2 GB/month | Data transfer limit |
| **Real-time connections** | 200 | Concurrent WebSocket connections |

## Pro Plan Limits

| Resource | Limit |
|----------|-------|
| **API Requests** | 1,000,000/day (much more) |
| **Storage** | Per-GB pricing |
| **Database** | Larger limits |

## Your Current Usage

### Polling Impact (Frontend)
- **Current**: Polls every 2.5 seconds for document list
- **Daily cost**: 1 user ≈ 34,560 requests/day (just for polling!)
- **Problem**: Easily exceeds 50,000 limit with multiple users

### Processing Impact (Backend)
Per document processed:
- 1 upload
- 1 status → "processing" update
- 1 download (storage)
- 5-10 database updates (metadata tracking)
- 1 redacted upload
- 1 status → "processed" update
- **Total: ~12-15 API calls per document**

## Current Optimizations Applied

✅ **Frontend Caching**
- Documents are cached client-side
- Only refetch if cache is stale (30 seconds default)
- Stops polling when no documents in "processing" state

✅ **Backend Efficiency**
- Batch metadata updates
- Single transaction for status changes
- Minimal logging (reduced overhead)

## Recommended Further Optimizations

### 1. **Increase Polling Interval** (If on Free plan)
Currently: 2.5 seconds
Recommended: 5-10 seconds for Free tier

### 2. **Implement Smart Polling**
- Stop polling when no documents processing
- Resume polling when new document detected
- Use exponential backoff if no changes

### 3. **Add Response Caching**
```
GET /api/documents/ responses cached for 10 seconds
Reduces 34,560 requests/day → 8,640 requests/day
```

### 4. **Batch Operations**
- Combine status updates into single transaction
- Group metadata updates

### 5. **Consider Supabase Pro**
If active development:
- 1,000,000 requests/day (20x more)
- Better performance
- Priority support

## How to Check Current Usage

1. Go to Supabase Dashboard
2. Navigate to: **Project Settings** → **Usage**
3. Check current API request count for today

## If Hitting Limits

You'll see:
- ❌ HTTP 429 (Too Many Requests)
- ❌ API calls start failing
- ❌ Frontend shows "Connection Failed"

**Solution**: Upgrade to Pro or increase polling interval.

## Recommendations for Your Setup

For **development/testing** (Free tier):
- Increase polling to 5 seconds
- Process one document at a time
- Check daily usage regularly

For **production** (Recommended):
- Use Supabase Pro plan
- Implement aggressive caching
- Use webhooks instead of polling (if available)
- Consider Redis caching layer

---

**Next Steps:**
1. Check your Supabase dashboard for current usage
2. Consider upgrading to Pro if hitting limits
3. Increase polling interval to 5 seconds if needed
