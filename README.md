# 🍰 Shadow Cakes — Installation Guide

## Prerequisites
Open Terminal (press `Cmd+Space`, type Terminal, hit Enter).

> **Note:** Replace `[username]` with the Mac's username throughout this guide.  
> To find the username, type `whoami` in Terminal.

---

## Phase 1: Install Prerequisites

**Install Homebrew:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Install MongoDB:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Install Python:**
```bash
brew install python@3.11
```

**Install Node.js:**
```bash
brew install node@18
```

**Install Yarn:**
```bash
npm install -g yarn
```

---

## Phase 2: Get the Code

Copy the `Shadow-Cakes` folder to: /Users/[username]/Documents/GitHub/Shadow-Cakes

---

## Phase 3: Set Up the Backend

```bash
cd /Users/[username]/Documents/GitHub/Shadow-Cakes/backend
```

```bash
cat > .env << 'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=shadow_cakes
CORS_ORIGINS=http://localhost:3000
EOF
```

```bash
python3 -m venv venv
source venv/bin/activate
pip install emergentintegrations --extra-index-url https://d33sy5t2g0a0s4.cloudfront.net/simple/
pip install -r requirements.txt
```

Test the backend:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
✅ You should see `Uvicorn running on http://0.0.0.0:8001` — press `Ctrl+C` to stop.

---

## Phase 4: Set Up the Frontend

Open a new Terminal window:
```bash
cd /Users/[username]/Documents/GitHub/Shadow-Cakes/frontend
```

```bash
cat > .env << 'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
```

```bash
yarn install
yarn start
```
✅ Browser should open at `http://localhost:3000` — press `Ctrl+C` to stop.

---

## Phase 5: Create the Desktop Launch Icon

1. Open **Automator** (`Cmd+Space` → type Automator → Enter)
2. Click **New Document** → select **Application** → **Choose**
3. In the search bar type `run` → double-click **Run Shell Script**
4. Clear the box and paste the following (replace `[username]` with the Mac username):

```bash
osascript -e 'tell application "Terminal"
    activate
    do script "export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH && cd /Users/[username]/Documents/GitHub/Shadow-Cakes && brew services start mongodb-community && cd backend && source venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8001 & sleep 3 && cd ../frontend && yarn start"
end tell'
```

5. Press **Cmd+S**
6. Name it `Shadow Cakes`
7. Save to: **Desktop**
8. File Format: **Application**
9. Click **Save**

---

## Phase 6: Test It

Double-click **Shadow Cakes** on the Desktop.  
Browser should open at `http://localhost:3000` ✅

---

## Daily Usage

Just double-click the **Shadow Cakes** icon on the Desktop. That's it! 🍰

---

## Troubleshooting

**MongoDB won't start:**
```bash
brew services restart mongodb-community
```

**Port already in use:**
```bash
lsof -ti:8001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

**Python packages missing:**
```bash
cd /Users/[username]/Documents/GitHub/Shadow-Cakes/backend
source venv/bin/activate
pip install -r requirements.txt
```


