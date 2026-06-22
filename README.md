# Shadow Cakes — Repo Summary

## What Is Shadow Cakes?

A **recipe costing and pricing tool** for a custom cake business. It lets the owner:
- Build recipes with multiple size/variant options (e.g. 6-inch vs 8-inch cake)
- Track ingredient costs from different vendors with price history
- Calculate the true cost of each recipe: ingredients + packaging + labour + utilities
- Log sales and see profit margins
- Import bulk data via CSV or Excel
- Works offline (it's a Progressive Web App) and syncs when back online

It runs as a **web app in the browser**, but it's self-hosted — you start both a backend server and a frontend server in the terminal, then open it at `http://localhost:3000` in your browser.

---

## Folder Structure

```
Shadow-Cakes/
├── backend/                    # Python API server
│   ├── server.py               # The entire backend in one ~1250-line file
│   ├── requirements.txt        # Python packages needed
│   └── tests/                  # Automated tests (hit live API)
│
├── frontend/                   # React web app
│   ├── public/
│   │   ├── index.html          # HTML shell
│   │   ├── manifest.json       # PWA config (app name, icons)
│   │   ├── service-worker.js   # Offline caching logic
│   │   └── nerd_alert_logo.png # Logo asset
│   │
│   └── src/
│       ├── App.js              # Root: sets up all page routes
│       ├── pages/              # One file per screen (10 pages)
│       │   ├── Dashboard.jsx         → Sales overview with KPIs
│       │   ├── RecipesPage.jsx       → List / create recipes
│       │   ├── RecipeDetailPage.jsx  → Edit a recipe, ingredients, variants
│       │   ├── IngredientsPage.jsx   → Manage ingredients & vendor prices
│       │   ├── PackagingPage.jsx     → Manage packaging costs
│       │   ├── ComponentsPage.jsx    → Reusable sub-recipes (e.g. ganache)
│       │   ├── SalesPage.jsx         → Sales table
│       │   ├── ImportPage.jsx        → Upload CSV/Excel data
│       │   └── SettingsPage.jsx      → Labour rate, utility rate, currency
│       ├── components/
│       │   ├── Layout.jsx      # Sidebar + nav shell that wraps every page
│       │   └── ui/             # Button, Dialog, Table, etc. (Shadcn/Radix)
│       └── hooks/              # useOnlineStatus, usePWA, use-toast
```

---

## How to Run It

**Three things must be running simultaneously, in this order:**

### 1. Start MongoDB (the database)
On Mac:
```bash
brew services start mongodb-community
```
On Windows: start the MongoDB service from the Start menu, or run `mongod` in a terminal.

### 2. Start the backend server
```bash
cd backend
source venv/bin/activate      # Mac/Linux
# venv\Scripts\activate       # Windows
uvicorn server:app --host 0.0.0.0 --port 8002 --reload
```
Server runs at `http://localhost:8002`. API docs at `http://localhost:8002/docs`.

### 3. Start the frontend
```bash
cd frontend
npm start
```
App opens at `http://localhost:3000`.

---

## Tech Stack

| Layer | What | Purpose |
|---|---|---|
| Database | MongoDB (port 27017) | Stores all data |
| Backend | Python + FastAPI + Motor | REST API |
| Frontend | React + Tailwind + Shadcn | UI |
| HTTP client | Axios | Frontend calls the backend |
| Offline | Service Worker + IndexedDB | Queues requests when offline |
