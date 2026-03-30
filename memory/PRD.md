# Shadow Cakes Pricing Tool - Product Requirements Document

## Original Problem Statement
Shadow Cakes needs a simple, reliable recipe costing app for personal use that replaces the current inefficient spreadsheet workflow with a database-backed tool for calculating recipe cost, packaging cost, labour, utilities, total cost, selling price, and profit margin.

## User Personas
- **Primary User**: Shadow Cakes business owner (single-user, personal use)
- **Use Case**: Calculate accurate recipe costs, manage ingredient pricing, track profit margins

## Core Requirements (Static)
1. Recipe and component recipe costing
2. Ingredient pricing by store/vendor with override capability
3. Packaging costing as line items
4. Labour costing based on time ($10/hr default)
5. Utility costing based on time ($1/hr default)
6. Recipe variants by size (e.g., 6-inch, 8-inch)
7. Store/vendor override per ingredient line
8. Enter selling price and calculate margin
9. Detailed cost breakdown by line item
10. Excel spreadsheet import for recipes and ingredient pricing
11. Currency: CAD ($)
12. PWA with full offline support (installable on Mac/mobile)

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- [x] Ingredient master table with CRUD operations
- [x] Ingredient vendor pricing records with unit cost calculation
- [x] Packaging master table with CRUD operations (full fields: store_vendor, purchase_price, package_size, purchase_date)
- [x] Recipe master table with variants support
- [x] Recipe line items (ingredients per variant)
- [x] Packaging line items (packaging per variant)
- [x] Component recipes (reusable sub-recipes like frostings, ganaches)
- [x] Settings for labour/utility rates
- [x] Cost calculation engine with full breakdown
- [x] CSV import for ingredients, recipes, packaging, components (TESTED)
- [x] XLSX import for ingredients, recipes, packaging, components (TESTED)
- [x] Replace behavior for imports (not merge)
- [x] Sales recording with labour_cost tracking
- [x] Sales summary endpoint (GET /api/sales/summary)
- [x] Bulk delete for ingredients, packaging, components, sales
- [x] CSV export from all data tabs

### Frontend (React + Shadcn UI)
- [x] Dashboard with Sales Overview tracker (Total Sales, Revenue, Cost, Hourly Pay, Profit)
- [x] Recipe library with search and CRUD
- [x] Recipe detail page with cost breakdown panel
- [x] Variant management (add, edit, delete variants)
- [x] Ingredient management with pricing (flattened per-vendor rows)
- [x] Packaging management (inline edit/delete, full field support)
- [x] Component recipes management
- [x] Settings page for rates configuration
- [x] Import page with CSV/XLSX support and drag & drop
- [x] Selling price input with margin calculation (useRef, no lag)
- [x] Vendor/store override per ingredient line
- [x] Record a Sale popup from recipe detail
- [x] Sales page with table, search, bulk delete, CSV export

### PWA Features (March 2026)
- [x] manifest.json with Shadow Cakes branding, icons, standalone display
- [x] Service worker with full offline caching (static assets + API responses)
- [x] Network-first API caching with IndexedDB fallback
- [x] Offline mutation queuing (POST/PUT/DELETE saved to IndexedDB, synced on reconnect)
- [x] Background sync when coming back online
- [x] Offline banner indicator (amber bar with pending count)
- [x] Install App button in sidebar (via beforeinstallprompt)
- [x] PWA icons generated from user's Shadow logo (72px to 512px)
- [x] Apple touch icon and favicon
- [x] apple-mobile-web-app-capable meta tags

### Design
- [x] Light theme with warm, earthy colors (Organic & Earthy)
- [x] Outfit font for headings, Manrope for body
- [x] JetBrains Mono for numeric values
- [x] Phosphor icons (duotone)
- [x] Professional bakery aesthetic

## Bug Fixes (March 2026)
- [x] Fixed selling price input lag (useRef pattern prevents re-render during typing)
- [x] Fixed packaging import missing store_vendor, purchase_price, package_size, purchase_date fields
- [x] Fixed packaging import purchase_date datetime conversion for Excel files
- [x] Verified CSV and XLSX import for all entity types (ingredients, recipes, packaging, components)

## Prioritized Backlog

### P1 (High Priority) - Future
- Batch duplication for recipes
- Ingredient search/filter by vendor
- Cost history tracking
- Print/export cost breakdown to PDF

### P2 (Medium Priority) - Future
- Recipe categories/tags filtering
- Ingredient usage reports
- Bulk edit capabilities
- Dark mode option

### P3 (Low Priority) - Future
- Recipe photos
- Notes attachments
- Keyboard shortcuts
- Mobile responsive improvements

## Architecture
```
/app/
├── backend/
│   ├── server.py (FastAPI app, routes, DB motor logic, Data Models)
│   ├── requirements.txt
│   ├── tests/
│   │   └── test_pwa_and_imports.py
│   └── .env
├── frontend/
│   ├── public/
│   │   ├── index.html (PWA meta tags)
│   │   ├── manifest.json
│   │   ├── service-worker.js
│   │   ├── icon-*.png (72, 96, 128, 144, 152, 192, 384, 512)
│   │   ├── apple-touch-icon.png
│   │   └── favicon.ico
│   ├── src/
│   │   ├── serviceWorkerRegistration.js
│   │   ├── components/ (Layout.jsx with offline banner + install btn)
│   │   ├── hooks/ (useOnlineStatus.js)
│   │   ├── pages/ (Dashboard, Recipes, Ingredients, Packaging, Components, Import, Settings)
│   │   ├── App.js, App.css, index.css, index.js
│   │   └── lib/
│   └── package.json
└── memory/
    └── PRD.md
```
