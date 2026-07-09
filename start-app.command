#!/bin/zsh
osascript -e 'tell application "Terminal" to do script "cd \"/Users/arizadivecha/Documents/Varun'"'"'s Project/Shadow-Cakes-3/backend\" && source venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8002 --reload; cd \"/Users/arizadivecha/Documents/Varun'"'"'s Project/Shadow-Cakes-3/frontend\" && yarn start"'
