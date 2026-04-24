import os
import json
import google.generativeai as genai
from datetime import datetime

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel('gemini-1.5-flash')

def update_market():
    try:
        with open('gambling/data.json', 'r') as f:
            data = json.load(f)
    except:
        data = {"current_events": [], "history": []}

    prompt = f"""
    You are a news-based bookie for a prediction game. Today's date is {datetime.now().strftime('%Y-%m-%d')}.
    
    TASK 1: Look at these past events: {json.dumps(data['current_events'])}. 
    Check current news and return "WON", "LOST", or "PENDING" for each.

    TASK 2: Generate 5 new upcoming events for today. 
    Focus on: Scottish and UK Politics, International relations and conflicts, and general Scottish events.
    Provide a title, a probability (0.1 to 0.9), and a 1-sentence 'why'.

    Return ONLY a JSON object like this:
    {{
        "settled": [{{ "id": "id", "result": "WON/LOST" }}],
        "new_events": [{{ "id": "unique_str", "title": "...", "payout": 2.0, "desc": "..." }}]
    }}
    """

    response = model.generate_content(prompt)
    raw_json = response.text.replace('```json', '').replace('```', '')
    updates = json.loads(raw_json)

    for s in updates['settled']:
        for e in data['current_events']:
            if e['id'] == s['id']:
                e['result'] = s['result']
                data['history'].append(e)

    data['current_events'] = updates['new_events']
    data['last_update'] = datetime.now().strftime('%Y-%m-%d')

    with open('gambling/data.json', 'w') as f:
        json.dump(data, f, indent=4)

if __name__ == "__main__":
    update_market()
