import os
import json
import re
from google import genai
from datetime import datetime

def update_market():
    # 1. Setup Client with the 2026 SDK
    # The API Key is pulled from your GitHub Secrets
    api_key = os.environ.get("GEMINI_API_KEY", "")
    client = genai.Client(api_key=api_key)
    
    # 2. Load existing data safely
    # If the file is missing or corrupted, we start fresh
    try:
        if os.path.exists('gambling/data.json'):
            with open('gambling/data.json', 'r') as f:
                content = f.read().strip()
                data = json.loads(content) if content else {"current_events": [], "history": []}
        else:
            data = {"current_events": [], "history": []}
    except (json.JSONDecodeError, Exception):
        data = {"current_events": [], "history": []}

    # 3. The Prompt - Specifically designed for the 2026 landscape
    today_date = datetime.now().strftime('%Y-%m-%d')
    prompt = f"""
    Today's Date: {today_date}
    Role: Professional News-Based Bookie & Resolution Agent.

    TASK 1: Resolution
    Check these events from yesterday: {json.dumps(data.get('current_events', []))}
    Based on real-world news as of today, determine if they happened. 
    Return "WON" (happened), "LOST" (didn't happen/expired), or "PENDING" (not yet known).

    TASK 2: Generation
    Create 5 NEW betting events for today. 
    Focus: 
    - UK Politics (Starmer, Reform UK, upcoming bills)
    - Scottish Transit (ScotRail, A9 improvements, Ferry issues)
    - Tech (AI advancements, Space sector)
    
    Probability must be between 0.1 and 0.9. Payout = 1/Probability.

    OUTPUT REQUIREMENT:
    Return ONLY a valid JSON object with this structure:
    {{
        "settled": [{{ "id": "original_id", "result": "WON/LOST" }}],
        "new_events": [{{ "id": "unique_str_timestamp", "title": "...", "payout": 2.5, "desc": "..." }}]
    }}
    """

    # 4. Generate with the 2026 stable model
    # Note: Using generate_content via the new Client structure
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash", 
            contents=prompt
        )
        
        # 5. Robust JSON Cleaning
        # AI models sometimes wrap JSON in markdown blocks or add introductory text
        raw_text = response.text.strip()
        
        # Extract anything between the first { and last }
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            json_str = match.group(0)
            updates = json.loads(json_str)
        else:
            # Fallback if the AI didn't provide brackets
            updates = json.loads(raw_text)

        # 6. Process History & Payouts
        # Move events that are now settled into history
        current_events = data.get('current_events', [])
        settled_map = {s['id']: s['result'] for s in updates.get('settled', []) if s['result'] != "PENDING"}
        
        new_history = []
        remaining_current = []
        
        for event in current_events:
            if event['id'] in settled_map:
                event['result'] = settled_map[event['id']]
                event['settled_at'] = today_date
                new_history.append(event)
            else:
                remaining_current.append(event)

        # Update the main data object
        data['history'] = data.get('history', []) + new_history
        data['current_events'] = updates.get('new_events', [])
        data['last_update'] = datetime.now().strftime('%Y-%m-%d %H:%M')

        # 7. Write back to data.json
        # Ensure the directory exists (GitHub runner usually handles this, but good for safety)
        os.makedirs('gambling', exist_ok=True)
        with open('gambling/data.json', 'w') as f:
            json.dump(data, f, indent=4)
            
        print(f"Successfully updated market for {today_date}")

    except Exception as e:
        print(f"Error during market update: {str(e)}")
        # We don't want to crash the whole action, just log the error
        raise e

if __name__ == "__main__":
    update_market()
