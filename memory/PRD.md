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
4. Labour costing based on prep time and labour rate per hour
5. Utility costing based on utility time and utility rate per hour
6. Recipe variants by size (e.g., 6-inch, 8-inch)
7. Store/vendor override per ingredient line
8. Enter selling price and calculate margin
9. Detailed cost breakdown by line item
10. Excel spreadsheet import for recipes and ingredient pricing
11. Currency: CAD ($)
12. PWA with full offline support (installable on Mac/mobile)

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- [x] Full CRUD for ingredients, ingredient prices, packaging, recipes, components, sales
- [x] Ingredient vendor pricing with unit cost calculation
- [x] Recipe variants with separate prep_time_minutes and utility_time_minutes
- [x] Component recipes restructured with variants (matching recipe structure)
- [x] Cost calculation engine: separate labour (prep time) and utility (utility time)
- [x] CSV/XLSX import for all entity types (tested and verified)
- [x] Sales recording with labour_cost tracking
- [x] Sales summary, bulk delete, CSV export
- [x] Component variant cost endpoint (/api/component-recipes/{id}/variants/{vid}/cost)

### Frontend (React + Shadcn UI)
- [x] **Sales Dashboard** with month filter (filters KPI cards + sales table by month)
- [x] Recipe library with search and CRUD
- [x] Recipe detail page with cost breakdown panel
- [x] Variant management (add, edit, delete variants)
- [x] Ingredient management with pricing (flattened per-vendor rows)
- [x] Packaging management (inline edit/delete, full field support)
- [x] Component recipes management
- [x] Settings page for rates configuration
- [x] Import page with CSV/XLSX support and drag & drop
- [x] Selling price input with margin calculation (useRef, no lag)
- [x] Record a Sale popup from recipe detail
- [x] Sales page with search, bulk delete, CSV export

### PWA Features
- [x] manifest.json with Shadow Cakes branding, standalone display
- [x] Service worker with offline caching (network-first API, cache-first static)
- [x] Offline mutation queuing via IndexedDB with background sync
- [x] Offline banner indicator
- [x] Install App button in Settings page
- [x] PWA icons from user's Shadow logo (72px–512px)

## Recent Changes

### April 6, 2026
- Added month filter to Sales Dashboard (filters KPI cards + table by month)
- KPI summary now computed client-side from filtered sales data
- Backend: Added `utility_time_minutes` to RecipeVariant model
- Backend: Restructured ComponentRecipe to use variants (matching Recipe)
- Backend: Separate labour/utility cost calculation (prep time → labour, utility time → utility)
- Backend: Added `/api/component-recipes/{id}/variants/{vid}/cost` endpoint
- Backend: Updated component import to support variant_name column

## Prioritized Backlog

### P0 (In Progress — from user's original message)
- [ ] **Recipe detail page**: Add separate editable Prep Time and Utility Time fields per variant
- [ ] **Components page**: Rebuild to match recipe structure (list page + detail page with variants)

### P1 (High Priority)
- Recipe duplication feature
- Print/Export cost breakdown to PDF

### P2 (Medium Priority)
- Recipe categories/tags filtering
- Cost history tracking
- Bulk edit capabilities
- Dark mode option

### P3 (Low Priority)
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
│   └── .env
├── frontend/
│   ├── public/ (manifest.json, service-worker.js, icons, index.html)
│   ├── src/
│   │   ├── serviceWorkerRegistration.js
│   │   ├── components/ (Layout.jsx with offline banner)
│   │   ├── hooks/ (useOnlineStatus.js, usePWA.js)
│   │   ├── pages/ (Dashboard, Recipes, RecipeDetail, Ingredients, Packaging, Components, Import, Settings)
│   │   ├── App.js, App.css, index.css, index.js
│   │   └── lib/
│   └── package.json
└── memory/
    └── PRD.md
```
