// scheduleData.js
// Program data for the LIFT Schedule tab.
// Primary: Kinesiology class (through April 30 2026)
// Backup: YMCA Mon-Sun (activate by setting PROGRAM_META.active = "ymca")

export const PROGRAM_META = {
  active: "kinesiology",
  kinesiology_end: "2026-04-30",
  ymca_start: "2026-05-01",
}

export const CARDIO = {
  Mon: { mod: "run", badge: "run", type: "Short easy run", dMin: 20, dMax: 25, intensity: "Easy (Zone 2)", dist: "1.5–2 miles", wt: 92, rationale: "Upper body day — legs fresh. Zone 2 preserves recovery capacity for Tuesday legs session.", goal: "10K aerobic base", cnote: "Substitute 25 min easy bike if MTP symptomatic." },
  Tue: { mod: "bike", badge: "bike", type: "Easy spin — active recovery", dMin: 25, dMax: 35, intensity: "Easy, high cadence (80–95 RPM)", dist: "Time-based", wt: 72, rationale: "Leg day: running contraindicated. High-cadence bike flush clears metabolic waste without eccentric load.", goal: "Aerobic base + triathlon cycling", cnote: "Stationary or Technogym. No hill simulation. Avoid rowing (MTP dorsiflexion)." },
  Wed: { mod: "run", badge: "run", type: "Medium run — primary volume day", dMin: 35, dMax: 50, intensity: "Easy to easy-moderate (Zone 2)", dist: "2.5–3.5 mi | Bike 45–60 min as substitute", wt: 92, rationale: "No RT today. Primary volume session of the week. Run if legs recovered; bike if MTP or soreness present.", goal: "10K → half-marathon volume build", cnote: "Run has priority for 10K progression. Bike is a legitimate substitute, not a downgrade." },
  Thu: { mod: "swim", badge: "swim", type: "Technique + easy aerobic", dMin: 25, dMax: 35, intensity: "Easy", dist: "300–500 yards", wt: 66, rationale: "Back/Bi day loads the pulling chain. Swimming reinforces these patterns in a non-compressive environment.", goal: "Triathlon swim — technique phase", cnote: "Drills first: catch-up, fingertip drag, side kick. Then 150–200 yd easy continuous." },
  Fri: { mod: "bike", badge: "bike", type: "Light recovery session", dMin: 20, dMax: 30, intensity: "Easy", dist: "5–7 mi | Swim 200–300 yd as alternative", wt: 72, rationale: "Hips/Upper RT today. Volume covered earlier. Short cardio maintains frequency without adding fatigue.", goal: "Triathlon base — session frequency", cnote: "20 min is enough if fatigue elevated. Swim is also acceptable today." },
  Sat: { mod: "run", badge: "run", type: "Longer run — progression session", dMin: 35, dMax: 45, intensity: "Easy to moderate (Zone 2–3)", dist: "2.5–3.5 miles", wt: 92, rationale: "No RT. Saturday is the primary run progression session driving the 10K → half-marathon distance build.", goal: "10K → half-marathon distance build", cnote: "Walk breaks fine. Time on feet matters more than pace. Keep conversational throughout." },
  Sun: { mod: "swim", badge: "swim", type: "Easy aerobic swim (optional)", dMin: 20, dMax: 30, intensity: "Easy", dist: "200–400 yards", wt: 66, rationale: "Recovery day. Non-impact aerobic stimulus maintains swim frequency without structural load.", goal: "Triathlon swim base — frequency", cnote: "Full rest acceptable if fatigue or soreness elevated." },
}

export const PROG = {
  Mon: {
    stretch: [
      { n: "Chest opener (doorframe)", d: "30 sec each side — hands at shoulder height, step through" },
      { n: "Cross-body shoulder stretch", d: "20 sec each side — pull arm across at shoulder level" },
      { n: "Overhead tricep stretch", d: "20 sec each side — elbow behind head, gentle downward pressure" },
      { n: "Neck rolls", d: "5 slow rotations each direction" },
    ],
    warmup: [
      { n: "Cable shoulder ER / IR", d: "2×10 | 10 lb" },
      { n: "Banded X's", d: "2×8 each side" },
      { n: "Arm circles", d: "2×30 sec each direction" },
    ],
    exercises: [
      { id: "chest_press", n: "Chest press", fi: "shoulder", variants: {
        machine: { n: "Technogym chest press", sets: "3", reps: "6", load: "110 lb", note: "Add load when 3×8 done clean" },
        db:      { n: "DB flat press", sets: "3", reps: "8–12", load: "TBD", note: "Neutral grip if shoulder sensitive" },
        friendly:{ n: "Cable fly (light)", sets: "3", reps: "10–12", load: "Light", note: "Short ROM, chest activation, minimal impingement" },
      }},
      { id: "tricep_pull", n: "Tricep pulldowns", fi: "shoulder", variants: {
        machine: { n: "Cable tricep pulldown", sets: "3", reps: "6", load: "25 lb", note: "Elbows at sides throughout" },
        db:      { n: "DB overhead tricep ext", sets: "3", reps: "8–12", load: "30 lb", note: "Smooth lockout, elbows stable" },
        friendly:{ n: "Rope pushdown", sets: "3", reps: "12–15", load: "Light", note: "Elbow hinge only — no shoulder movement" },
      }},
      { id: "incline_press", n: "Incline chest press", fi: "shoulder", variants: {
        machine: { n: "Smith incline press", sets: "3", reps: "6", load: "90 lb", note: "Low incline (15–30°) if shoulder sensitive" },
        db:      { n: "DB incline press", sets: "3", reps: "8–12", load: "TBD", note: "Low incline angle" },
        friendly:{ n: "Landmine press", sets: "2", reps: "10–12", load: "Light", note: "Neutral grip arc — less impingement than overhead" },
      }},
      { id: "mach_fly", n: "Machine flys", fi: "shoulder", variants: {
        machine: { n: "Pec deck", sets: "3", reps: "6", load: "30 lb", note: "Squeeze at peak, controlled return" },
        db:      { n: "DB flat fly", sets: "3", reps: "10–12", load: "Light", note: "Slight elbow bend, feel the stretch" },
        friendly:{ n: "Cable crossover (low anchor)", sets: "2", reps: "12–15", load: "Light", note: "Upward arc reduces shoulder impingement" },
      }},
    ],
    core: [
      { n: "Pushup plank w/ shoulder touch", d: "2×10 each side — no hip rotation" },
      { n: "Pallof press", d: "2×10 | Cable 40 lb — anti-rotation, brace through the rep" },
    ],
  },

  Tue: {
    stretch: [
      { n: "Hip flexor (half-kneel)", d: "30 sec each side — tall posture, posterior pelvic tilt" },
      { n: "Quad stretch (standing)", d: "20 sec each side" },
      { n: "Ankle circles", d: "10 slow rotations each direction" },
      { n: "Calf / Achilles (wall)", d: "30 sec each side — knee straight then bent (soleus)" },
    ],
    warmup: [
      { n: "Stationary bike", d: "5–10 min | Light → moderate — blood flow, not effort" },
      { n: "Standing calf raises (off step)", d: "2×8 | Full ROM, slow lower" },
      { n: "Body weight squat", d: "2×8 | Add band at knees if form solid" },
      { n: "Ankle (L) inversion + dorsiflexion", d: "2×10 | Band-assisted — TOE/ANKLE protocol" },
      { n: "Towel scrunches (L)", d: "5 sets — intrinsic foot activation" },
    ],
    exercises: [
      { id: "hip_thrust_smith", n: "Hip thrust (Smith machine)", fi: "toe", variants: {
        machine: { n: "Smith machine hip thrust", sets: "4", reps: "10", load: "Set 1: 115 lb | Sets 2-4: 155 lb", note: "Pause at top, ribs down, chin tucked. Drive through heels." },
        db:      { n: "DB glute bridge (floor)", sets: "4", reps: "10–12", load: "TBD", note: "DB on hip crease, same pause-at-top cue" },
        friendly:{ n: "Single-leg glute bridge (floor)", sets: "3", reps: "10", load: "BW", note: "No additional ankle or foot load" },
      }},
      { id: "leg_press", n: "Leg press", fi: "toe", variants: {
        machine: { n: "Technogym leg press", sets: "3", reps: "10", load: "200 lb", note: "Heels down, do not lock knees at top" },
        db:      { n: "Goblet squat", sets: "3", reps: "10–12", load: "25 lb", note: "Elbows inside knees, heels down" },
        friendly:{ n: "Leg press (high foot, reduced depth)", sets: "3", reps: "10", load: "150–175 lb", note: "High foot position reduces MTP dorsiflexion demand" },
      }},
      { id: "leg_curl", n: "Leg curl machine", fi: "toe", variants: {
        machine: { n: "Seated / lying leg curl", sets: "3", reps: "8", load: "100 lb", note: "Slow eccentric — 3 sec down" },
        db:      { n: "Swiss ball hamstring curl", sets: "3", reps: "8–10", load: "BW", note: "Bridge up, curl ball in, extend slowly" },
        friendly:{ n: "Seated leg curl (machine)", sets: "3", reps: "8–10", load: "80–90 lb", note: "Seated version reduces ankle dorsiflexion demand vs lying" },
      }},
      { id: "leg_ext", n: "Leg extension machine", fi: "toe", variants: {
        machine: { n: "Technogym leg extension", sets: "3", reps: "8", load: "100 lb", note: "Control at top, do not slam. Reduce load if MTP symptomatic at catch position." },
        db:      { n: "Terminal knee extension (band)", sets: "3", reps: "12–15", load: "Light band", note: "VMO focus with minimal ankle demand" },
        friendly:{ n: "Short-arc quad (SAQ)", sets: "3", reps: "12–15", load: "Light", note: "Last 30° of extension only — avoids full dorsiflexion position" },
      }},
    ],
    core: [
      { n: "Marches w/ band", d: "3×10 each leg — hip flexor drive, pelvis stable" },
      { n: "Dead bugs w/ band", d: "2×15 — band around knees, lumbar pressed to floor, opposite arm/leg extension" },
    ],
  },

  Wed: {
    stretch: [
      { n: "Hip flexor (half-kneel)", d: "30 sec each side" },
      { n: "Figure 4 / piriformis (supine)", d: "30 sec each side" },
      { n: "Thoracic rotation (seated)", d: "5 slow rotations each direction" },
      { n: "Hamstring stretch", d: "6 reps — PNF or static 30 sec" },
    ],
    warmup: [
      { n: "Standing calf raises", d: "2×10 — controlled" },
      { n: "Light bike", d: "5–10 min | No resistance — loosen legs" },
    ],
    exercises: [],
    core: [],
  },

  Thu: {
    stretch: [
      { n: "Lat stretch (doorframe or bar)", d: "30 sec each side — scapula back and down" },
      { n: "Bicep stretch (wall, palm flat)", d: "20 sec each side" },
      { n: "Thoracic rotation (seated or foam roller)", d: "5 each direction" },
      { n: "Chest opener (clasped hands behind back)", d: "20 sec — opens anterior shoulder" },
    ],
    warmup: [
      { n: "Wall slides", d: "8 reps — pause at top, elbows tracking the wall" },
      { n: "Scap pushups (off bench)", d: "2×10 — protraction / retraction only" },
      { n: "Face pulls w/ band", d: "2×10 | Light band" },
      { n: "Pull aparts w/ band", d: "2×10 — arms straight, squeeze at end range" },
    ],
    exercises: [
      { id: "cable_row", n: "Cable row (mid)", fi: "shoulder", variants: {
        machine: { n: "Technogym seated row", sets: "3", reps: "6", load: "100 lb", note: "Scapula toward back pockets — retract before pulling" },
        db:      { n: "Chest-supported DB row", sets: "3", reps: "8–12", load: "TBD", note: "Chest on incline bench, neutral grip" },
        friendly:{ n: "Single-arm cable row (low)", sets: "3", reps: "10–12", load: "Light", note: "Lower pulley, neutral grip, controlled rotation" },
      }},
      { id: "lat_pull", n: "Lat pulldown", fi: "shoulder", variants: {
        machine: { n: "Technogym lat pulldown", sets: "3", reps: "6", load: "100 lb", note: "Chest up, elbows to ribs — do not shrug" },
        db:      { n: "Single-arm cable pulldown", sets: "3", reps: "8–12", load: "TBD", note: "Unilateral — better scapular control" },
        friendly:{ n: "Straight-arm pulldown", sets: "3", reps: "10–12", load: "40 lb", note: "Arms straight, drive elbow toward hip — less shoulder impingement" },
      }},
      { id: "bicep_db", n: "Bicep curls (DB / BB)", fi: "shoulder", variants: {
        machine: { n: "BB curl (palms up)", sets: "3", reps: "8", load: "50 lb", note: "No sway, full elbow extension at bottom" },
        db:      { n: "DB curl (alternating)", sets: "3", reps: "8–12", load: "25 lb", note: "Supinate at top" },
        friendly:{ n: "Cable curl (low pulley)", sets: "3", reps: "10–12", load: "Light", note: "Constant tension, elbows stable at sides" },
      }},
      { id: "cable_d2", n: "Cable D2 flexion", fi: "shoulder", variants: {
        machine: { n: "Cable D2 (unsheathing sword)", sets: "3", reps: "8", load: "TBD", note: "Hip to opposite shoulder diagonal — rotator cuff and scapular health" },
        db:      { n: "DB D2 diagonal pattern", sets: "3", reps: "10", load: "Light", note: "Same diagonal without cable" },
        friendly:{ n: "Band D2 flexion", sets: "3", reps: "10", load: "Light band", note: "Lightest load option if shoulder irritated" },
      }},
      { id: "bicep_rope", n: "Bicep curls — cable / rope (neutral grip)", fi: "shoulder", variants: {
        machine: { n: "Cable curl w/ rope (neutral)", sets: "3", reps: "8", load: "35 lb", note: "Hammer-style — targets brachialis and brachioradialis" },
        db:      { n: "Hammer curl (DB)", sets: "3", reps: "10–12", load: "TBD", note: "Same neutral grip pattern" },
        friendly:{ n: "Band hammer curl", sets: "3", reps: "12–15", load: "Light band", note: "" },
      }},
    ],
    core: [
      { n: "Straight arm pulldowns", d: "3×8 | 40 lb — arms straight, core braced, no arch" },
      { n: "DB suitcase carry", d: "2 laps each arm (~30 ft) | 60 lb — anti-lateral-flexion" },
    ],
  },

  Fri: {
    stretch: [
      { n: "Hip flexor (half-kneel)", d: "30 sec each side" },
      { n: "Figure 4 / piriformis (supine)", d: "30 sec each side" },
      { n: "Cross-body shoulder stretch", d: "20 sec each side" },
      { n: "Rotator cuff ER stretch (door or wall)", d: "20 sec each side" },
    ],
    warmup: [
      { n: "Light bike", d: "5 min | No resistance" },
      { n: "Hip circles (standing)", d: "10 each direction" },
      { n: "Glute bridges (BW)", d: "2×10 — pause at top, ribs down" },
      { n: "Band pull-aparts", d: "1×10 — shoulder prep" },
    ],
    exercises: [
      { id: "hip_thrust", n: "Hip thrust / bridge", fi: "toe", variants: {
        machine: { n: "Hip thrust machine or Smith", sets: "3", reps: "10–12", load: "TBD", note: "Pause at top, ribs down, chin tucked" },
        db:      { n: "DB glute bridge (floor)", sets: "3", reps: "12–15", load: "TBD", note: "DB on hip crease, drive through heel" },
        friendly:{ n: "Single-leg glute bridge (floor)", sets: "3", reps: "10", load: "BW", note: "No additional ankle or foot load" },
      }},
      { id: "shoulder_press_light", n: "Shoulder press (light)", fi: "shoulder", variants: {
        machine: { n: "Technogym shoulder press", sets: "2", reps: "8–12", load: "Keep easy", note: "Light session — keep effort moderate" },
        db:      { n: "DB shoulder press", sets: "2", reps: "8–12", load: "Light–mod", note: "Neutral grip if neck feels tight" },
        friendly:{ n: "Landmine press (standing)", sets: "2", reps: "10–12", load: "Light", note: "Lower arc reduces impingement" },
      }},
      { id: "pec_fly", n: "Pec fly / cable fly", fi: "shoulder", variants: {
        machine: { n: "Pec deck / cable fly", sets: "2", reps: "10–12", load: "TBD", note: "Short ROM, chest activation only" },
        db:      { n: "DB fly (light, flat)", sets: "2", reps: "10–12", load: "Light", note: "" },
        friendly:{ n: "Cable crossover (low anchor)", sets: "2", reps: "12–15", load: "Light", note: "Upward arc — less shoulder impingement" },
      }},
      { id: "face_pull_fri", n: "Light row / face pull", fi: "shoulder", variants: {
        machine: { n: "Cable row or face pull", sets: "2", reps: "12–15", load: "TBD", note: "Posture and shoulder health — keep effort low" },
        db:      { n: "Band row", sets: "2", reps: "12–15", load: "Light band", note: "" },
        friendly:{ n: "Band face pull", sets: "2", reps: "12–15", load: "Light band", note: "Elbows high — rear delt and rotator cuff" },
      }},
    ],
    core: [
      { n: "Russian twists", d: "3×30 sec — light DB or BW" },
      { n: "Hollow body / dead bug", d: "3×30 sec — lumbar pressed to floor throughout" },
      { n: "Suitcase carry", d: "2 laps each arm — anti-lateral-flexion focus" },
    ],
  },

  Sat: {
    stretch: [
      { n: "Leg swings (front / back)", d: "10 each side — dynamic, hip flexors" },
      { n: "Leg swings (lateral)", d: "10 each side" },
      { n: "Arm circles", d: "10 each direction — shoulder prep for arm swing" },
      { n: "Hip circles (standing)", d: "10 each direction" },
    ],
    warmup: [
      { n: "Standing calf raises", d: "2×10" },
      { n: "Walking lunges", d: "8 each leg" },
      { n: "Half-mile walk", d: "Quarter mile light, quarter mile brisk" },
    ],
    exercises: [],
    core: [],
  },

  Sun: {
    stretch: [
      { n: "Neck side stretch", d: "20 sec each side" },
      { n: "Cross-body shoulder stretch", d: "20 sec each side" },
      { n: "Seated hip stretch (figure 4)", d: "30 sec each side" },
      { n: "Calf / Achilles (wall)", d: "30 sec each side" },
    ],
    warmup: [],
    exercises: [],
    core: [],
  },
}
