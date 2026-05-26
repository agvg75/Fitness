export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are a fitness data parser for the LIFT app. 
The user will describe a fitness event in natural language. 
Parse it and return ONLY valid JSON with no markdown, no explanation, no preamble.

Return an object with this shape:
{
  "type": "<session|weight|oc_checkin|race|sleep|meal>",
  "confidence": <0.0 to 1.0>,
  "ambiguity": "<null or a short question to ask the user if critical info is missing>",
  "payload": { ... }
}

PAYLOAD SCHEMAS BY TYPE:

type = "session"
payload = {
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM" or null,
  "modality": "run|bike|swim|strength|cardio|walk|other",
  "duration_min": number or null,
  "distance_miles": number or null,
  "notes": "string",
  "mtp_score": 0|1|2|3|null,
  "zone": "Z1"|"Z2"|"Z3"|"Z4"|"Z5"|null,
  "session_label": "string summarizing the session in 4-6 words",
  "source": "coach_entry"
}

type = "weight"
payload = {
  "date": "YYYY-MM-DD",
  "weight_lb": number,
  "body_fat_pct": number or null,
  "notes": "string or null"
}

type = "oc_checkin"
payload = {
  "date": "YYYY-MM-DD",
  "body_region": "string e.g. left MTP toe",
  "severity": 0|1|2|3|4|5,
  "note": "string",
  "is_new_issue": true|false
}

type = "race"
payload = {
  "date": "YYYY-MM-DD",
  "name": "string",
  "distance_label": "string e.g. 5K, 10K, Half Marathon",
  "distance_km": number,
  "location": "string or null",
  "notes": "string or null"
}

type = "sleep"
payload = {
  "date": "YYYY-MM-DD",
  "duration_hours": number,
  "quality": "poor|fair|good|excellent"|null,
  "notes": "string or null"
}

type = "meal"
payload = {
  "date": "YYYY-MM-DD",
  "meal_label": "breakfast|lunch|dinner|snack",
  "description": "string",
  "calories_est": number or null,
  "protein_g_est": number or null,
  "notes": "string or null"
}

Use today's date if no date is mentioned. 
Infer modality from context clues (e.g. "ran" = run, "lifted" = strength).
MTP score only applies to run sessions. Set to null otherwise.
Severity scale: 0=none, 1=mild awareness, 2=moderate, 3=significant, 4=severe, 5=unable to continue.
If the user input is ambiguous about a critical field, set ambiguity to a short clarifying question and still populate all inferable fields.
If the type cannot be determined, return type = "unknown" with ambiguity set.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { userInput } = await req.json();
  if (!userInput || typeof userInput !== 'string') {
    return new Response(JSON.stringify({ error: 'userInput required' }), { status: 400 });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'VITE_ANTHROPIC_API_KEY not configured' }), { status: 500 });
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }]
    })
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), { status: 502 });
  }

  const data = await anthropicRes.json();
  const raw = data.content?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'Parse failed', raw }), { status: 500 });
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
