#!/bin/zsh

echo "🍰 Shadow Cakes V2"
echo "Backend: http://localhost:8002"
echo "Frontend: http://localhost:3001"

# Backend
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8002 --reload &
cd ..

# Wait
sleep 3

# Frontend
cd frontend
yarn start &
cd ..

echo "✅ Both running! Press Ctrl+C to stop"
trap "pkill -f uvicorn; pkill -f yarn; echo 'Stopped'; exit" INT
wait
