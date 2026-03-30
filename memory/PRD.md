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

## What's Been Implemented (January 2026)

### Backend (FastAPI + MongoDB)
- [x] Ingredient master table with CRUD operations
- [x] Ingredient vendor pricing records with unit cost calculation
- [x] Packaging master table with CRUD operations
- [x] Recipe master table with variants support
- [x] Recipe line items (ingredients per variant)
- [x] Packaging line items (packaging per variant)
- [x] Component recipes (reusable sub-recipes like frostings, ganaches)
- [x] Settings for labour/utility rates
- [x] Cost calculation engine with full breakdown
- [x] Excel/CSV import for ingredients, recipes, packaging, components
- [x] Replace behavior for imports (not merge)
- [x] Sales recording with labour_cost tracking
- [x] Sales summary endpoint (GET /api/sales/summary)
- [x] Bulk delete for ingredients, packaging, components, sales
- [x] CSV export from all data tabs

### Frontend (React + Shadcn UI)
- [x] Dashboard with Sales Overview tracker (Total Sales, Revenue, Cost, Hourly Pay, Profit)
- [x] Dashboard stat cards for Recipes, Ingredients, Packaging, Components
- [x] Recipe library with search and CRUD
- [x] Recipe detail page with cost breakdown panel
- [x] Variant management (add, edit, delete variants)
- [x] Ingredient management with pricing
- [x] Packaging management
- [x] Component recipes management
- [x] Settings page for rates configuration
- [x] Import page with CSV/XLSX support and drag & drop
- [x] Selling price input with margin calculation
- [x] Vendor/store override per ingredient line
- [x] Record a Sale popup from recipe detail
- [x] Sales page with table, search, bulk delete, CSV export

### Design
- [x] Light theme with warm, earthy colors (Organic & Earthy)
- [x] Outfit font for headings, Manrope for body
- [x] JetBrains Mono for numeric values
- [x] Phosphor icons (duotone)
- [x] Professional bakery aesthetic

## Prioritized Backlog

### P0 (Critical) - COMPLETED ✅
All V1 scope items implemented

### P1 (High Priority) - Future
- Batch duplication for recipes
- Ingredient search/filter by vendor
- Cost history tracking
- Print/export cost breakdown

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

## Out of Scope (V1)
- Sales tracking
- Order tracking
- Customer tracking
- Inventory deduction
- Import history log
- Authentication or login
- Multi-business support
- Sales analytics
- Purchase workflow
- Advanced permissions

## Next Tasks
1. Test Excel import with real data files
2. Add more validation messages for import errors
3. Consider adding recipe duplication feature
4. Optimize cost calculation caching for large recipes
