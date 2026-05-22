import { useState } from 'react'
import { METRIC_CONFIG, getDirectionalColor } from '../lib/metricConfig'

// Props: metricKey, value, prev (default null), unit (override),
//        fontSize (default '30px'), style (overrides), showExplain (default true)
export default function MetricValue({
  metricKey, value, prev = null, unit, fontSize = '30px', style = {}, showExplain = true
}) {
  const [open, setOpen] = useState(false)
  const config = METRIC_CONFIG[metricKey] || {}
  const explains = config.explains || null
  const direction = config.desiredDirection ?? 'neutral'
  const displayUnit = unit ?? config.unit ?? ''
  const dirColor = prev != null ? getDirectionalColor(value, prev, direction) : null
  const valueColor = dirColor || style.color || 'inherit'
  const deltaText = (() => {
    if (prev == null || value == null) return null
    const d = Number(value) - Number(prev)
    if (Math.abs(d) < 0.01) return null
    return `${d > 0 ? '+' : ''}${d.toFixed(1)} since last session`
  })()
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
        <div style={{ fontSize, fontWeight: 'bold', color: valueColor,
          transition: 'color 0.3s', ...style, color: valueColor }}>
          {value != null ? `${value}${displayUnit ? ' ' + displayUnit : ''}` : 'NA'}
        </div>
        {showExplain && explains && (
          <button onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: 'none',
              color: open ? '#4a9ee8' : '#444', fontSize: '11px', cursor: 'pointer',
              padding: '2px 4px', marginTop: '4px', lineHeight: 1, fontWeight: 'bold',
              borderRadius: '50%', width: '16px', height: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title='Explain this metric'>?
          </button>
        )}
      </div>
      {deltaText && (
        <div style={{ fontSize: '10px', color: dirColor || '#666', marginTop: '2px' }}>
          {deltaText}
        </div>
      )}
      {open && explains && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: '#0d0f1e', border: '1px solid #1a1b2e', borderRadius: '8px',
          padding: '12px', width: '260px', fontSize: '11px', lineHeight: '1.6',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#ced2f0' }}>
            {config.label || metricKey}
          </div>
          {[['Shows', explains.shows], ['Derived', explains.derived],
            ['Interpret', explains.interpret], ['Action', explains.action]]
            .filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ marginBottom: '6px' }}>
              <span style={{ color: '#4a9ee8', fontWeight: 'bold' }}>{k}: </span>
              <span style={{ color: '#94a3b8' }}>{v}</span>
            </div>
          ))}
          <button onClick={() => setOpen(false)}
            style={{ marginTop: '6px', background: 'none', border: '1px solid #1a1b2e',
              borderRadius: '4px', color: '#555', fontSize: '10px',
              cursor: 'pointer', padding: '2px 8px' }}>close
          </button>
        </div>
      )}
    </div>
  )
}
