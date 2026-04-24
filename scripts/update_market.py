import os
import json
from google import genai # New 2026 SDK
from datetime import datetime

def update_market():
    # Setup Client
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    
    # 1. Load existing data
    try:
        with open('gambling/data.json', 'r') as f:
            data = json.load(f)
    except:
        data = {"current_events": [], "history": []}

    # 2. Prepare the prompt
    prompt = f"""
    Today's date is {datetime.now().strftime('%Y-%m-%d')}.
    Act as a news-based bookie. 
    
    1. Check these past events: {json.dumps(data.get('current_events', []))}. 
       Mark as "WON", "LOST", or "PENDING" based on today's news.

    2. Generate 5 NEW upcoming events. 
       Focus: UK/Scotland politics, transit, or 2026 tech trends.
       Provide title, probability (0.1-0.9), and a short description.

    Return ONLY a JSON object:
    {{
        "settled": [{{ "id": "id", "result": "WON/LOST" }}],
        "new_events": [{{ "id": "unique_str", "title": "...", "payout": 2.0, "desc": "..." }}]
    }}
    """

    # 3. Call Gemini 3 Flash
    response = client.models.generate_content(
        model="gemini-3-flash", 
        contents=prompt
    )
    
    # Clean up the response text (remove markdown backticks if present)
    raw_text = response.text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:-3]
    
    updates = json.loads(raw_text)

    # 4. Update and Save
    # Move settled events to history
    for s in updates.get('settled', []):
        for e in data['current_events']:
            if e['id'] == s['id']:
                e['result'] = s['result']
                data['history'].append(e)

    # Replace old events with new ones
    data['current_events'] = updates['new_events']
    data['last_update'] = datetime.now().strftime('%Y-%m-%d %H:%M')

    with open('gambling/data.json', 'w') as f:
        json.dump(data, f, indent=4)

if __name__ == "__main__":
    update_market()
