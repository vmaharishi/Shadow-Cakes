# Shadow Cakes Pricing Tool - Product Requirements Document

## Original Problem Statement
Shadow Cakes needs a simple, reliable recipe costing app that replaces spreadsheet workflows with a database-backed tool for calculating recipe cost, packaging, labour, utilities, total cost, selling price, and profit margin.

## What's Been Implemented

### Core Features
- [x] **Sales Dashboard** with month filter, KPI cards (Revenue, Cost, Wages, Profit), searchable sales table
- [x] **Recipes** — full CRUD with variants, ingredients, packaging, components, prep time, utility time
- [x] **Components** — rebuilt to match recipe structure exactly (variants, ingredients, packaging, prep/utility time, batch yield, cost breakdown with cost-per-gram)
- [x] **Ingredients** — flattened per-vendor rows, inline edit/delete
- [x] **Packaging** — inline edit/delete, full field support
- [x] **Import** — CSV/XLSX for ingredients, recipes, packaging, components, sales (with per-section disclaimers)
- [x] **Settings** — labour rate, utility rate, Install App button
- [x] **PWA** — offline support, service worker, installable on Mac/mobile
- [x] Separate Prep Time (→ labour cost) and Utility Time (→ utility cost)
- [x] Selling price input with profit margin calculation (no lag)
- [x] Record a Sale from recipe detail page
- [x] CSV export from all data tabs

### Architecture
- React + Shadcn UI frontend, FastAPI + MongoDB backend
- Service worker with offline caching, IndexedDB mutation queuing
- PWA manifest with custom Shadow logo icons

## Prioritized Backlog

### P1 (High Priority)
- [ ] Recipe duplication feature
- [ ] Print/Export cost breakdown to PDF

### P2 (Medium Priority)
- [ ] Recipe categories/tags filtering
- [ ] Cost history tracking
- [ ] Dark mode option

### P3 (Low Priority)
- [ ] Recipe photos
- [ ] Keyboard shortcuts
- [ ] Mobile responsive improvements
