# Admin QA Checklist

## Core flow
- [ ] Admin login loads
- [ ] Login succeeds with configured admin credentials
- [ ] Properties dashboard loads
- [ ] Property cards render without crashes
- [ ] Edit Details opens an existing record
- [ ] Save Property persists a harmless text edit
- [ ] Reload shows the saved change

## Data integrity
- [ ] Slug is present and stable
- [ ] Address fields render cleanly
- [ ] Pricing fields do not show misleading placeholder values
- [ ] Numeric fields display sensible formatting
- [ ] Buildout-derived fields populate when present

## Create / routing
- [ ] New property page opens
- [ ] New property can be saved
- [ ] New property returns to edit page successfully
- [ ] Dashboard links resolve by slug or document id fallback

## Security / config
- [ ] Vercel env vars exist:
  - [ ] FIREBASE_SERVICE_ACCOUNT
  - [ ] ADMIN_LOGIN_EMAIL
  - [ ] ADMIN_LOGIN_PASSWORD
- [ ] Admin routes require login
- [ ] Firestore rules reviewed before wider rollout

## Nice-to-have polish
- [ ] Collapsible source metadata section
- [ ] Cleaner grouped editor sections
- [ ] Better numeric formatting / blank defaults
- [ ] Public-page impact spot-check after edit
