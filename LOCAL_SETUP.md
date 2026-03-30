# Shadow Cakes Pricing Tool - Local Setup Guide

## Prerequisites

You'll need these installed on your Mac:

### 1. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install MongoDB
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### 3. Install Python 3.11+
```bash
brew install python@3.11
```

### 4. Install Node.js 18+
```bash
brew install node@18
```

### 5. Install Yarn
```bash
npm install -g yarn
```

---

## Setup Instructions

### Step 1: Download the Code
Download your code from Emergent (use the download button in the UI) and unzip it.

### Step 2: Set Up Backend

Open Terminal and navigate to the backend folder:
```bash
cd /path/to/your/app/backend
```

Create a `.env` file:
```bash
cat > .env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=shadow_cakes
CORS_ORIGINS=http://localhost:3000
EOF
```

Create a virtual environment and install dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Run the backend:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Keep this terminal open. The backend will run at http://localhost:8001

### Step 3: Set Up Frontend

Open a NEW Terminal window and navigate to the frontend folder:
```bash
cd /path/to/your/app/frontend
```

Create a `.env` file:
```bash
cat > .env << 'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
```

Install dependencies and run:
```bash
yarn install
yarn start
```

The app will open automatically at http://localhost:3000

---

## Quick Start Script

Save this as `start-app.sh` in your app folder and run with `bash start-app.sh`:

```bash
#!/bin/bash

# Start MongoDB if not running
brew services start mongodb-community

# Start Backend (in background)
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start Frontend
cd frontend
yarn start &
FRONTEND_PID=$!
cd ..

echo ""
echo "🍰 Shadow Cakes Pricing Tool is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait and cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
```

---

## Stopping the App

- Press `Ctrl+C` in both terminal windows
- Or if using the quick start script, just `Ctrl+C` once

## Troubleshooting

### MongoDB won't start
```bash
brew services restart mongodb-community
```

### Port already in use
```bash
# Kill process on port 8001
lsof -ti:8001 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Python packages missing
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

---

## Your Data

All your data is stored in MongoDB. To backup:
```bash
mongodump --db shadow_cakes --out ~/shadow_cakes_backup
```

To restore:
```bash
mongorestore --db shadow_cakes ~/shadow_cakes_backup/shadow_cakes
```
