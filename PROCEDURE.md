# Alpha & Omega Conference 2026 — Referral System Integration Procedure

## Project Overview

Two codebases in this repository:
- **`main/`** — Raffle HQ: Local SQLite + Express + React (Vite). Contains the referral system logic.
- **`v2/alpha-omega-conference/`** — Public Firebase site + Admin Portal. Target for referral system integration.

**Goal**: Merge the referral system from `main` into `v2`:
- `invitedById` field links invitee → inviter (phoneDigits format)
- Valid referral = invitee attended 4+ event days
- Keep both `referralSource` (marketing channel) and `invitedById` (specific person)

---

## Files Modified

### Phase 1: Firestore Rules (`v2/alpha-omega-conference/public/firestore.rules`)

| Change | Details |
|--------|---------|
| `users` collection read | `allow read: if request.auth != null` — enables dropdown population |
| `users` create validation | `invitedById` must match `^234[789][0-9]{9}$` (Nigerian phone digits) |
| Daily collections (`event_day1`–`event_day6`) | Added `invitedById` validation to `isValidDailyRegistration()` |
| New `directory` collection | Admin-only read/create with `invitedById` validation |

---

### Phase 2: Public Registration Form

| File | Changes |
|------|---------|
| `public/index.html` | Added "Invited by" dropdown + search input in **Step 1** (after email) |
| `public/js/db.js` | Added `getAllUsers()` to fetch all users for dropdown; updated `submitRegistration()` to accept `invitedById` |
| `public/js/form.js` | - Load inviters on Step 1 open<br>- Search/filter dropdown by name<br>- Include `invitedById` in submit payload<br>- Reset dropdown on form close |

---

### Phase 3: Admin Daily Registration Modal

| File | Changes |
|------|---------|
| `public/admin.html` | Added "Invited by" dropdown + search in walk-in registration modal |
| `public/js/admin-daily.js` | - Load inviters when modal opens<br>- Filter dropdown by search input<br>- Include `invitedById` in check-in write + `addToDirectory()` call |
| `public/js/admin-directory.js` | Updated `normalizeRecord()` and `addToDirectory()` to include `invitedById` |

---

### Phase 4: Admin Referral Leaderboard Page

| File | Changes |
|------|---------|
| `public/admin.html` | - Added **Leaderboard** tab in sidebar & bottom nav<br>- Added Leaderboard view: summary stats cards + table (Rank, Referrer, Phone, Total Invited, Valid Referrals, Day 1/2/3/4/6 columns)<br>- Export button (data-admin only) |
| `public/js/admin-leaderboard.js` | **New file** — Full leaderboard logic:<br>- Fetches pre-event users, daily records, directory users<br>- Builds unified person map by phone (E.164)<br>- Computes referral tree + per-day attendance counts<br>- Renders sorted table with CSV export |
| `public/js/admin-main.js` | Import & wire `initLeaderboard()` / `stopLeaderboard()` |

---

### Phase 5: Cloud Functions Exports

| File | Changes |
|------|---------|
| `public/functions/index.js` | - `fetchAllUsers()` now returns `invitedById`<br>- `exportAllRegistrations` Excel includes **"Invited By (Phone)"** column |

---

### Phase 6: Admin Pre-Event View & Exports

| File | Changes |
|------|---------|
| `public/js/admin-preevent.js` | - Displays inviter name + phone in list (looks up `invitedById` in users)<br>- Includes `invitedById` in `allUsers` for export |
| `public/js/admin-export.js` | Added **"Invited By (Phone)"** column to:<br>- `exportPreEventFull()` (pre-event Excel)<br>- `exportDay()` (daily Excel) |

---

## Firestore Rules Summary

```javascript
// users collection — public create, authenticated read
match /users/{phoneId} {
  allow create: if
    // ... existing validation ...
    (request.resource.data.invitedById == null ||
      (request.resource.data.invitedById is string &&
       request.resource.data.invitedById.matches('^234[789][0-9]{9}$'))) &&
    request.resource.data.createdAt == request.time;
  allow read: if request.auth != null;  // for dropdown
  allow update, delete: if false;
}

// Daily collections — admin only, with invitedById validation
function isValidDailyRegistration() {
  let data = request.resource.data;
  return
    // ... existing validation ...
    (data.invitedById == null ||
      (data.invitedById is string &&
       data.invitedById.matches('^234[789][0-9]{9}$'))) &&
    data.createdAt == request.time;
}

// Directory collection — admin only
function isValidDirectoryEntry() {
  let data = request.resource.data;
  return
    // ... same fields as daily ...
    (data.invitedById == null ||
      (data.invitedById is string &&
       data.invitedById.matches('^234[789][0-9]{9}$'))) &&
    data.createdAt == request.time;
}
match /directory/{phoneId} {
  allow read, list: if isAdmin();
  allow create: if isAdmin() && isValidDirectoryEntry();
  allow update, delete: if false;
}
```

---

## Admin Access Setup (For Collaborators)

Two separate permissions required:

| Access | Controlled By | Setup Required |
|--------|---------------|----------------|
| **Admin Portal (`/admin.html`)** | Firestore `admins` collection | Owner creates doc: `admins/{your-uid}` with `{ email: "your@email.com" }` |
| **Export Functions** | Firebase Custom Claims | Owner runs: `admin.auth().setCustomUserClaims(uid, { admin: true })` |

**To get your UID**: After being added as Firebase project member, run `firebase login`, visit the site, sign in once. Owner finds your UID in Firebase Console → Authentication → Users.

---

## Local Testing Commands

```bash
# Navigate to project
cd v2/alpha-omega-conference/public

# Start emulators (requires firebase login + project access)
firebase emulators:start
# Opens: Hosting (5000), Firestore (8080), Auth (9099), Functions (5001), UI (4000)

# Deploy preview channel (shareable URL)
firebase hosting:channel:deploy preview

# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy Cloud Functions
cd functions && npm install
firebase deploy --only functions

# Full deploy
firebase deploy
```

---

## Verification Checklist

| Feature | Test |
|---------|------|
| Public registration Step 1 | "Invited by" dropdown appears, searchable, populated from `users` |
| Public registration submit | `invitedById` written to Firestore |
| Admin daily modal | "Invited by" dropdown works for walk-ins |
| Admin daily check-in | `invitedById` saved to daily collection + directory |
| Leaderboard tab | Shows ranking, valid referrals, per-day breakdown |
| Leaderboard export | CSV downloads with correct columns |
| Pre-event list | Shows inviter name + phone |
| Pre-event export | Excel includes "Invited By (Phone)" |
| Daily export | Excel includes "Invited By (Phone)" |
| Firestore rules | No permission errors in browser console |

---

## Key Data Structures

### Participant (`users` / `directory` collections)
```javascript
{
  fullName: string,
  phone: string,              // E.164: "+2348012345678"
  email: string | null,
  attendeeType: "Church Member" | "Guest" | "First-Time Attendee",
  churchOrMinistry: string | null,
  referralSource: string | null,      // Marketing channel
  invitedById: string | null,         // Phone digits: "2348012345678"
  createdAt: Timestamp,
  attendance: string[]                // Pre-event only
}
```

### Daily Check-in (`event_day1`–`event_day6`)
```javascript
{
  fullName: string,
  phone: string,
  email: string | null,
  attendeeType: string,
  churchOrMinistry: string | null,
  referralSource: string | null,
  invitedById: string | null,
  createdAt: Timestamp
}
```

---

## Future Maintenance Notes

1. **Scale**: Leaderboard computes in-browser. If >10k registrations, move aggregation to Cloud Function + cached document.
2. **Indexes**: Add composite index on `users` if querying by `invitedById` becomes slow.
3. **Card System**: The printable member card PDF (from `main` folder) is **not ported** to v2 — separate feature if needed.
4. **Referral Threshold**: Currently "4+ days attended" = valid referral. Change in `admin-leaderboard.js` constant if requirements shift.
5. **Saturday (Day 5)**: Excluded from registration (Medical Outreach). Leaderboard skips Day 5 column.

---

## Quick Reference: Owner Actions for New Collaborators

1. Add collaborator to Firebase project (Editor role)
2. Collaborator runs `firebase login`
3. Collaborator visits site, signs in → get UID from Auth console
4. Owner creates `admins/{uid}` doc in Firestore
5. Owner runs: `admin.auth().setCustomUserClaims(uid, { admin: true })`
6. Collaborator can now run `firebase emulators:start` and test everything