import { useState } from 'react';

// These call the same localStorage and Supabase paths already used by App.jsx.
// Supabase client is passed in as a prop to avoid re-instantiating it.
function appendToLocalKey(key, item) {
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(item);
  localStorage.setItem(key, JSON.stringify(existing));
}

function commitPayload(type, payload, supabase) {
  const now = new Date().toISOString();

  if (type === 'weight') {
    appendToLocalKey('lift_biometric_records', { ...payload, logged_at: now });
    return { store: 'lift_biometric_records (localStorage)', summary: `Weight: ${payload.weight_lb} lb on ${payload.date}` };
  }

  if (type === 'sleep') {
    appendToLocalKey('lift_sleep_records', { ...payload, logged_at: now });
    return { store: 'lift_sleep_records (localStorage)', summary: `Sleep: ${payload.duration_hours}h on ${payload.date}` };
  }

  if (type === 'oc_checkin') {
    const items = JSON.parse(localStorage.getItem('oc-items') || '[]');
    if (payload.is_new_issue) {
      const newItem = {
        id: `oc_${Date.now()}`,
        region: payload.body_region,
        onset: payload.date,
        status: 'active',
        episodes: [{ date: payload.date, severity: payload.severity, note: payload.note }],
        logged_at: now
      };
      items.push(newItem);
    } else {
      const match = items.find(i =>
        i.region?.toLowerCase().includes(payload.body_region?.toLowerCase())
      );
      if (match) {
        match.episodes = match.episodes || [];
        match.episodes.push({ date: payload.date, severity: payload.severity, note: payload.note });
      } else {
        items.push({
          id: `oc_${Date.now()}`,
          region: payload.body_region,
          onset: payload.date,
          status: 'active',
          episodes: [{ date: payload.date, severity: payload.severity, note: payload.note }],
          logged_at: now
        });
      }
    }
    localStorage.setItem('oc-items', JSON.stringify(items));
    return { store: 'oc-items (localStorage)', summary: `OC check-in: ${payload.body_region}, severity ${payload.severity} on ${payload.date}` };
  }

  if (type === 'race') {
    appendToLocalKey('lift_race_calendar', { ...payload, logged_at: now });
    return { store: 'lift_race_calendar (localStorage)', summary: `Race: ${payload.name} (${payload.distance_label}) on ${payload.date}` };
  }

  if (type === 'meal') {
    const key = `meal-log-${payload.date}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...payload, logged_at: now });
    localStorage.setItem(key, JSON.stringify(existing));
    return { store: `meal-log-${payload.date} (localStorage)`, summary: `Meal: ${payload.meal_label} on ${payload.date}` };
  }

  if (type === 'session') {
    const session = {
      id: `ce_${Date.now()}`,
      date: payload.date,
      start_date: payload.date + 'T' + (payload.start_time || '08:00') + ':00',
      modality: payload.modality,
      duration_sec: payload.duration_min ? payload.duration_min * 60 : null,
      distance_miles: payload.distance_miles || null,
      notes: payload.notes || '',
      mtp_score: payload.mtp_score ?? null,
      zone: payload.zone || null,
      session_label: payload.session_label || payload.modality,
      source: 'coach_entry',
      logged_at: now
    };
    appendToLocalKey('lift_coach_sessions', session);

    if (supabase) {
      supabase.from('canonical_sessions').insert([{
        start_date: session.start_date,
        modality: session.modality,
        duration_sec: session.duration_sec,
        notes: session.notes,
        source: 'coach_entry'
      }]).then(({ error }) => {
        if (error) console.warn('Supabase session write failed:', error.message);
      });
    }

    return { store: 'lift_coach_sessions (localStorage) + Supabase canonical_sessions', summary: `Session: ${payload.session_label} on ${payload.date}` };
  }

  return { store: 'none', summary: 'Unknown type, nothing written.' };
}

const TYPE_LABELS = {
  session: 'Workout session',
  weight: 'Body weight',
  oc_checkin: 'OC check-in',
  race: 'Race',
  sleep: 'Sleep',
  meal: 'Meal',
  unknown: 'Unknown'
};

export default function CoachEntry({ supabase }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);

  async function handleParse() {
    if (!input.trim()) return;
    setStatus('parsing');
    setErrorMsg('');
    setParsed(null);
    setResult(null);

    try {
      const res = await fetch('/api/coach-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: input.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsed(data);
      setStatus('confirming');
    } catch (e) {
      setErrorMsg(e.message || 'Parse failed.');
      setStatus('error');
    }
  }

  function handleConfirm() {
    setStatus('writing');
    const r = commitPayload(parsed.type, parsed.payload, supabase);
    setResult(r);
    setHistory(prev => [{ input, parsed, result: r, ts: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
    setStatus('done');
    setInput('');
    setParsed(null);
  }

  function handleReject() {
    setParsed(null);
    setStatus('idle');
  }

  function handleReset() {
    setStatus('idle');
    setResult(null);
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px', fontFamily: 'Arial', fontSize: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Coach Entry</h2>
      <p style={{ color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
        Describe what happened in plain language. Examples: "ran 4.2 miles this morning, Zone 2, MTP score 0",
        "weighed 159.4 this morning", "left toe soreness, severity 1 after yesterday's run",
        "adding a 10K on June 14 in Chicago".
      </p>

      {(status === 'idle' || status === 'error') && (
        <div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
            placeholder="Tell the coach what happened..."
            style={{
              width: '100%', minHeight: 80, padding: 10, borderRadius: 6,
              border: '1px solid #ccc', fontFamily: 'Arial', fontSize: 14,
              resize: 'vertical', boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleParse}
            disabled={!input.trim()}
            style={{
              marginTop: 10, padding: '8px 20px', background: '#1a73e8', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14
            }}
          >
            Parse
          </button>
          {status === 'error' && (
            <p style={{ color: '#c00', marginTop: 8 }}>Error: {errorMsg}</p>
          )}
        </div>
      )}

      {status === 'parsing' && (
        <p style={{ color: '#666' }}>Parsing...</p>
      )}

      {status === 'confirming' && parsed && (
        <div style={{ border: '1px solid #1a73e8', borderRadius: 8, padding: 16, background: '#f0f6ff' }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{
              background: '#1a73e8', color: '#fff', borderRadius: 4,
              padding: '2px 8px', fontSize: 12, fontWeight: 600
            }}>
              {TYPE_LABELS[parsed.type] || parsed.type}
            </span>
            <span style={{ marginLeft: 10, color: '#888', fontSize: 12 }}>
              Confidence: {Math.round((parsed.confidence || 0) * 100)}%
            </span>
          </div>

          {parsed.ambiguity && (
            <p style={{ color: '#b45', marginBottom: 12, fontStyle: 'italic' }}>
              Note: {parsed.ambiguity}
            </p>
          )}

          <pre style={{
            background: '#fff', border: '1px solid #ddd', borderRadius: 4,
            padding: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap'
          }}>
            {JSON.stringify(parsed.payload, null, 2)}
          </pre>

          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button
              onClick={handleConfirm}
              style={{
                padding: '8px 20px', background: '#188038', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14
              }}
            >
              Confirm and write
            </button>
            <button
              onClick={handleReject}
              style={{
                padding: '8px 16px', background: '#fff', color: '#333',
                border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14
              }}
            >
              Reject, re-enter
            </button>
          </div>
        </div>
      )}

      {status === 'writing' && <p style={{ color: '#666' }}>Writing...</p>}

      {status === 'done' && result && (
        <div style={{ border: '1px solid #188038', borderRadius: 8, padding: 16, background: '#f0fff4' }}>
          <p style={{ fontWeight: 600, color: '#188038', marginBottom: 4 }}>Written successfully</p>
          <p style={{ marginBottom: 4 }}>{result.summary}</p>
          <p style={{ fontSize: 12, color: '#888' }}>Store: {result.store}</p>
          <button
            onClick={handleReset}
            style={{
              marginTop: 12, padding: '6px 16px', background: '#fff', color: '#333',
              border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14
            }}
          >
            Add another
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#444' }}>
            This session ({history.length})
          </h3>
          {history.map((h, i) => (
            <div key={i} style={{
              borderLeft: '3px solid #1a73e8', paddingLeft: 12, marginBottom: 12, color: '#555'
            }}>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{h.ts}</p>
              <p style={{ margin: '2px 0', fontSize: 13 }}>{h.result?.summary}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>{h.input}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
