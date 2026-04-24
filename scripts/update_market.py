import os
import json
from google import genai
from datetime import datetime

def update_market():
    # 1. Setup Client
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    
    # 2. Load existing data safely
    try:
        with open('gambling/data.json', 'r') as f:
            content = f.read().strip()
            data = json.loads(content) if content else {"current_events": [], "history": []}
    except (FileNotFoundError, json.JSONDecodeError):
        data = {"current_events": [], "history": []}

    # 3. The Prompt
    prompt = f"""
    Today is {datetime.now().strftime('%Y-%m-%d')}. Act as a 2026 bookie.
    
    TASKS:
    1. Resolve these: {json.dumps(data.get('current_events', []))}. (WON/LOST/PENDING)
    2. Create 5 new events for today (Politics, Scotland Transit, Tech).
    
    Return ONLY a JSON object:
    {{
        "settled": [{{ "id": "id", "result": "WON/LOST" }}],
        "new_events": [{{ "id": "unique_str", "title": "...", "payout": 2.5, "desc": "..." }}]
    }}
    """

    # 4. Generate with Gemini 3 Flash (The 2026 standard)
    response = client.models.generate_content(
        model="gemini-3-flash", 
        contents=prompt
    )
    
    # Clean JSON response
    text = response.text.strip()
    if text.startswith("
http://googleusercontent.com/immersive_entry_chip/0

---

### How to verify it actually changed:
1.  Go to your repository on **GitHub.com**.
2.  Click on the `scripts` folder, then click `update_market.py`.
3.  **Read the code on the screen.** Does it say `gemini-1.5-flash` anywhere? 
    * If **YES**: You haven't successfully pushed your changes from your computer to GitHub. Run `git add .`, `git commit -m "fix code"`, and `git push`.
    * If **NO**: Go to the **Actions** tab, click "Daily Bookie Update" on the left, click **Run workflow**, and let's see the new log.

**If it fails again, copy the very bottom of the log (the part starting with `Traceback`)—that's where the specific "why" is hidden!**
