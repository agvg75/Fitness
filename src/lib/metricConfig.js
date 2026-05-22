export const METRIC_CONFIG = {

  weight: {
    label: 'Body Weight', unit: 'lb', desiredDirection: 'down',
    explains: {
      shows: 'Total body mass from scale or Apple Health, 3-day smoothed.',
      derived: 'Raw daily weigh-ins smoothed with a 3-day rolling average to reduce noise.',
      interpret: 'Expect day-to-day variation of 1 to 2 lb. Trend over 7 to 14 days is the meaningful signal.',
      action: 'If trending up over 14 days with no intentional surplus, check calorie log and sodium.'
    }
  },

  bodyFat: {
    label: 'Body Fat %', unit: '%', desiredDirection: 'down',
    explains: {
      shows: 'Estimated body fat percentage, anchored to DEXA scan values.',
      derived: 'DEXA scans are ground-truth anchors. Between scans projected at 1.7 lb/month fat-loss rate.',
      interpret: 'DEXA error margin is roughly 1 to 2 percentage points. Small inter-scan changes are within noise.',
      action: 'Use DEXA anchors (September 2026 next) to recalibrate. Do not over-interpret daily estimates.'
    }
  },

  leanMass: {
    label: 'Lean Mass', unit: 'lb', desiredDirection: 'up',
    explains: {
      shows: 'Fat-free mass including muscle, bone, and water, from DEXA.',
      derived: 'Measured directly by DEXA. Between scans held constant unless a new scan is entered.',
      interpret: 'Lean mass below 115 lb would represent a regression. Target is preservation during cut, then gain from July 2026.',
      action: 'If lean mass drops more than 2 lb between scans, review protein intake and strength frequency.'
    }
  },

  vo2Apple: {
    label: 'VO2max (Apple)', unit: 'mL/kg/min', desiredDirection: 'up',
    explains: {
      shows: 'Apple Watch estimate of maximal aerobic capacity.',
      derived: 'Apple uses resting HR, GPS pace, HR during outdoor runs, age, sex, and weight. Estimate, not lab measure.',
      interpret: 'Useful for within-person trend tracking. Bias introduced when primary cardio is swimming rather than running.',
      action: 'If declining for more than 3 weeks while training load is stable, check sleep and recovery markers.'
    }
  },

  vo2Proxy: {
    label: 'VO2 Economy Proxy', unit: 'mL/kg/min', desiredDirection: 'down',
    explains: {
      shows: 'Oxygen cost of running at current zone 2 pace, estimated from pace and duration.',
      derived: 'VO2 = -4.6 + (0.182 x speed m/min) + (0.000104 x speed sq). Submaximal cost at recent run pace, not VO2max.',
      interpret: 'As economy improves this drifts down even as VO2max rises. Falling proxy alongside rising Apple VO2max is the ideal pattern.',
      action: 'If rising while pace is unchanged, check fatigue load and sleep.'
    }
  },

  ctl: {
    label: 'Fitness (CTL)', unit: 'TRIMP units', desiredDirection: 'up',
    explains: {
      shows: 'Chronic Training Load: exponential moving average of daily training impulse.',
      derived: 'Banister model with personalized tau1 = 27 days (default 42). Fitness builds and erodes faster than average for this individual.',
      interpret: 'Higher CTL means more accumulated training base. Rises and falls slowly.',
      action: 'Do not let CTL drop more than 10 units in a single week except during planned taper. HM taper window is 3 weeks.'
    }
  },

  atl: {
    label: 'Fatigue (ATL)', unit: 'TRIMP units', desiredDirection: 'neutral',
    explains: {
      shows: 'Acute Training Load: short-window exponential moving average of daily training impulse.',
      derived: 'Banister model with personalized tau2 = 18 days (default 7). Fatigue persists significantly longer than average.',
      interpret: 'Should spike after hard weeks and recover during rest. Chronically high ATL without recovery is a red flag.',
      action: 'If ATL stays above CTL for more than 2 weeks, introduce a recovery week.'
    }
  },

  tsb: {
    label: 'Form (TSB)', unit: '', desiredDirection: 'up',
    explains: {
      shows: 'Training Stress Balance: CTL minus ATL. Positive means fresher, negative means more fatigued.',
      derived: 'TSB = CTL minus ATL. Personalized danger zone is sustained TSB below -7 combined with 14-day rolling load above 700 units.',
      interpret: 'Negative TSB during build phases is expected and normal. The risk threshold is -7 sustained, not any negative value.',
      action: 'If TSB drops below -7 for more than 5 consecutive days, verify that recovery days are actually recovery.'
    }
  },

  acwr: {
    label: 'ACWR', unit: '', desiredDirection: 'neutral',
    explains: {
      shows: 'Acute to Chronic Workload Ratio: last 7 days of load divided by the 28-day average.',
      derived: 'ACWR = 7-day load / 28-day average load. Safe training zone is approximately 0.8 to 1.3.',
      interpret: 'Above 1.5 indicates a spike that increases injury risk. Below 0.8 for multiple weeks indicates detraining.',
      action: 'If ACWR exceeds 1.5, do not add volume the following week regardless of how you feel.'
    }
  },

  restingHR: {
    label: 'Resting HR', unit: 'bpm', desiredDirection: 'down',
    explains: {
      shows: 'Resting heart rate, typically the overnight minimum recorded by Apple Watch.',
      derived: 'Apple Health overnight minimum. Meaningful trend requires 7-day smoothing.',
      interpret: 'A rise of 5+ bpm above personal baseline sustained 3+ days often indicates incomplete recovery or illness onset.',
      action: 'If resting HR elevated and HRV suppressed simultaneously, treat the next session as zone 1 only.'
    }
  },

  hrv: {
    label: 'HRV', unit: 'ms', desiredDirection: 'up',
    explains: {
      shows: 'Heart rate variability SDNN metric from Apple Watch.',
      derived: 'Recorded during overnight sleep. Single-night values are noisy. Use 7-day trend.',
      interpret: 'Higher HRV indicates better recovery and parasympathetic dominance. Personal baseline matters more than population norms.',
      action: 'If HRV drops more than 20% below 30-day average for 3 consecutive days, reduce intensity for at least 2 days.'
    }
  },

  sleepHours: {
    label: 'Sleep Duration', unit: 'h', desiredDirection: 'up',
    explains: {
      shows: 'Total sleep duration from Sleep Cycle or Apple Health, last night.',
      derived: 'Total time asleep from logged sleep session. Target is 7.5 hours.',
      interpret: 'Chronic sleep below 6.5 hours suppresses HRV, elevates resting HR, and slows fat metabolism. Three consecutive nights is signal.',
      action: 'If below 6.5 hours for 3+ consecutive nights, reduce the next day planned intensity before cutting volume.'
    }
  },

  runCeiling: {
    label: 'Run Ceiling', unit: 'mi', desiredDirection: 'up',
    explains: {
      shows: 'Current maximum allowed single-run distance under the MTP protocol.',
      derived: 'Advances by 10% after three consecutive score-0 runs. Current ceiling 4.0 miles. Next milestone 4.4 miles. Left MTP joint.',
      interpret: 'This is a hard ceiling, not a target. Vary distances below the ceiling. Only test the ceiling when conditions are favorable.',
      action: 'Do not advance until three consecutive score-0 sessions are confirmed. Score 1 resets the counter.'
    }
  },

  fatMass: {
    label: 'Fat Mass', unit: 'lb', desiredDirection: 'down',
    explains: {
      shows: 'Absolute fat mass in pounds, from DEXA or projected.',
      derived: 'DEXA measured 41.3 lb at April 2026 scan. Projected at 1.7 lb/month between scans.',
      interpret: 'Phase 1 target requires approximately 9.1 more lb of fat loss, placing completion around mid-September 2026.',
      action: 'If pace drops below 1.0 lb/month for 6 consecutive weeks, review calorie balance and cardio volume.'
    }
  },

  operationalReadiness: {
    label: 'Operational Readiness', unit: '%', desiredDirection: 'up',
    explains: {
      shows: 'Composite readiness score combining injury penalties, TSB, sleep, and active OC items.',
      derived: 'Weighted composite from OC tab. Penalty floor from active injury items persists until OC score reaches 0 and episode closes.',
      interpret: 'Below 60% warrants session modification. Below 40% warrants rest or active recovery only. Above 80% is the performance window.',
      action: 'If readiness is below 60%, check which component is driving it before deciding whether to train.'
    }
  },

  tendonRisk: {
    label: 'Tendon Risk', unit: 'x capacity', desiredDirection: 'down',
    explains: {
      shows: 'Estimated load on the selected tendon group relative to current capacity, expressed as a multiple.',
      derived: 'Cumulative session load on tendon group divided by estimated current capacity. Capacity reduced by active OC items.',
      interpret: 'Values above 1.0x indicate load exceeds estimated capacity. Values between 0.7 and 1.0x are the training stimulus zone.',
      action: 'If above 1.0x, reduce load on that region at the next session. No heavy calf raises within 48 hours of a run day when MTP is active.'
    }
  }

}

export function getDesiredDirection(metricKey) {
  return METRIC_CONFIG[metricKey]?.desiredDirection ?? 'neutral'
}

export function getMetricExplain(metricKey) {
  return METRIC_CONFIG[metricKey]?.explains ?? null
}

export function getDirectionalColor(current, previous, desiredDirection) {
  if (current == null || previous == null || desiredDirection === 'neutral') return null
  const delta = Number(current) - Number(previous)
  if (Math.abs(delta) < 0.01) return null
  const improved = desiredDirection === 'up' ? delta > 0 : delta < 0
  return improved ? '#4ade80' : '#ef4444'
}
