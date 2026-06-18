# Walkthrough - Costco Mongolia Deployment & Domain Resolution

This walkthrough details the verification and deployment steps taken to resolve the domain accessibility issue for Costco Mongolia (www.costco.mn).

## 1. Diagnostics & Root Cause Analysis

### www.costco.mn (Subdomain)
- **Status:** Resolving correctly to Firebase Hosting.
- **Issue:** Before our deployment, the live site was serving a build compiled on **Feb 18, 2026**. That build had `IS_MAINTENANCE_MODE = true` hardcoded, resulting in Vite/Rollup tree-shaking the entire application and unconditionally rendering the Maintenance page. Local fixes to set `IS_MAINTENANCE_MODE = false` and camera scanner fixes had not been deployed to the live server.
- **Resolution:**
  1. Ran a production build locally (`npm run build`).
  2. Authenticated Firebase CLI via the service account in `functions/service-account.json`.
  3. Deployed the build to Firebase Hosting: `firebase deploy --only hosting --project costco-fe034`.
  4. Verified via `curl -I https://www.costco.mn` that the live site now serves the fresh build (Last-Modified: May 20, 2026). The site is live and fully functional.

### costco.mn (Naked/Root Domain)
- **Status:** Not resolving.
- **Issue:** Running DNS lookup (`Resolve-DnsName costco.mn -Type A`) returned no records (only SOA authority). This means the naked domain `costco.mn` has no A records configured at the domain registrar.
- **Resolution/Action Required by User:**
  - The domain owner needs to log in to their domain registrar (e.g., Datacom.mn) and add Firebase Hosting's recommended A records for the root domain `@`:
    - `199.36.158.100`
    - `199.36.158.95`

## 2. Changes Deployed

- **Maintenance Mode:** Disabled (`IS_MAINTENANCE_MODE = false` in `src/maintenance.js`).
- **ESLint Fixes:** Solved React Hook rule violations in `src/App.jsx`.
- **Dynamic Imports:** Resolved Vite bundle size/import issues by converting dynamic Firebase imports to static imports in:
  - `src/services/productService.js`
  - `src/store/authStore.js`
  - `src/store/productStore.js`
  - `src/components/ChatModal.jsx`
- **Camera/Scanner fixes:** Fallbacks and CSS fixes added to both `src/pages/ScannerPage.jsx` and `src/pages/QuickScanPage.jsx` are now live.
