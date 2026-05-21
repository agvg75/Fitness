export const EXERCISE_LIBRARY = [
  {
    id: "run",
    name: "Running",
    scheduleIds: [],
    days: ["Wed", "Thu", "Sun"],
    primaryStress: "impact",
    loads: [
      { region: "Toe L", tissueType: "jointStatus", score: 3 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 2 },
      { region: "Calf L", tissueType: "tendonStatus", score: 2 },
      { region: "Calf R", tissueType: "tendonStatus", score: 2 },
      { region: "Ankle R", tissueType: "tendonStatus", score: 1 },
      { region: "Knee L", tissueType: "tendonStatus", score: 2 },
      { region: "Knee R", tissueType: "tendonStatus", score: 2 },
      { region: "Hip L", tissueType: "muscleStatus", score: 1 },
      { region: "Hip R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["cycling_stationary", "swim_freestyle"],
    mtp_safe: false,
    notes: "Primary MTP stressor. Cyclic forefoot impact load at every footstrike. Full substitute with swimming or stationary cycling when Toe L OC is active.",
  },
  {
    id: "cycling_stationary",
    name: "Cycling (Stationary / Spin)",
    scheduleIds: [],
    days: ["Mon", "Thu"],
    primaryStress: "cyclic",
    loads: [
      { region: "Knee L", tissueType: "tendonStatus", score: 2 },
      { region: "Knee R", tissueType: "tendonStatus", score: 2 },
      { region: "Calf L", tissueType: "muscleStatus", score: 2 },
      { region: "Calf R", tissueType: "muscleStatus", score: 2 },
      { region: "Quad L", tissueType: "muscleStatus", score: 2 },
      { region: "Quad R", tissueType: "muscleStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: ["swim_freestyle"],
    mtp_safe: true,
    notes: "Forefoot pedal contact exists but no impact. Score 1 on Toe L is incidental. Preferred running substitute when MTP active.",
  },
  {
    id: "swim_freestyle",
    name: "Swimming (Freestyle, No Backstroke)",
    scheduleIds: [],
    days: ["Tue", "Fri", "Sat"],
    primaryStress: "cyclic",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
      { region: "Upper Back", tissueType: "muscleStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["cycling_stationary"],
    mtp_safe: true,
    notes: "Primary rotator cuff cyclic stressor. Pull buoy eliminates wall push-off. Zero MTP load. Incompatible with Shoulder tendonStatus OC score >= 3.",
  },
  {
    id: "chest_press_machine",
    name: "Chest Press (Machine / Technogym)",
    scheduleIds: ["m1"],
    days: ["Mon"],
    primaryStress: "peak",
    loads: [
      { region: "Chest", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: ["incline_chest_press", "cable_crossover"],
    mtp_safe: true,
    notes: "Heavy peak tension. Triceps and anterior shoulder load secondary. Elbow score 2 because pressing loads distal triceps tendon.",
  },
  {
    id: "incline_chest_press",
    name: "Incline Chest Press (Smith Machine)",
    scheduleIds: ["m2"],
    days: ["Mon"],
    primaryStress: "peak",
    loads: [
      { region: "Chest", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: ["cable_crossover", "machine_flys"],
    mtp_safe: true,
    notes: "More anterior deltoid involvement than flat press. Shoulder demand slightly higher than chest press machine.",
  },
  {
    id: "machine_flys",
    name: "Machine Flys / Cable Flys",
    scheduleIds: ["m3"],
    days: ["Mon"],
    primaryStress: "eccentric",
    loads: [
      { region: "Chest", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: ["cable_crossover"],
    mtp_safe: true,
    notes: "Pec isolation under eccentric stretch. Pec minor insertion stressed at full open position.",
  },
  {
    id: "lateral_raise",
    name: "Lateral Raise (Cable / DB)",
    scheduleIds: ["m4"],
    days: ["Mon"],
    primaryStress: "cyclic",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: ["rear_delt_fly", "face_pull_er"],
    mtp_safe: true,
    notes: "Supraspinatus is the primary mover in shoulder abduction. Highest single-exercise shoulder tendon load in the program at high rep volume.",
  },
  {
    id: "rear_delt_fly",
    name: "Rear Delt Fly (Reverse Pec Deck / Incline DB)",
    scheduleIds: ["m5"],
    days: ["Mon"],
    primaryStress: "cyclic",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Upper Back", tissueType: "muscleStatus", score: 2 },
    ],
    substitutes: ["face_pull_er"],
    mtp_safe: true,
    notes: "Posterior cuff and rear delt. Lower tendon stress than lateral raise. Safe at most shoulder OC states.",
  },
  {
    id: "face_pull_er",
    name: "Face Pull / External Rotation",
    scheduleIds: ["m6", "w3", "face_pull_fri"],
    days: ["Mon", "Wed", "Thu", "Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Rotator cuff health maintenance. Loaded ER stimulus. Thursday loaded version is therapeutic intent. Maintain indefinitely regardless of other OC items.",
  },
  {
    id: "triceps_pulldown",
    name: "Triceps Pulldown / Pushdown (Cable)",
    scheduleIds: ["m7"],
    days: ["Mon", "Wed"],
    primaryStress: "cyclic",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: ["triceps_overhead"],
    mtp_safe: true,
    notes: "Lateral head emphasis. High rep cyclic elbow extension. Cumulates with bicep curl volume when both appear in same session.",
  },
  {
    id: "triceps_overhead",
    name: "Triceps Overhead (Cable / DB)",
    scheduleIds: ["m8"],
    days: ["Mon"],
    primaryStress: "eccentric",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["triceps_pulldown"],
    mtp_safe: true,
    notes: "Long head under eccentric stretch at full arm extension. Higher elbow tendon load per rep than pushdown.",
  },
  {
    id: "pushup_plank_shoulder_touch",
    name: "Pushup Plank w/ Shoulder Touch",
    scheduleIds: ["m9"],
    days: ["Mon"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["plank", "deadbugs"],
    mtp_safe: true,
    notes: "Anti-rotation core with shoulder stabilizer load. Low elbow tendon stress. Substitute plank when shoulder OC active.",
  },
  {
    id: "pallof_press",
    name: "Pallof Press (Cable, Split Stance)",
    scheduleIds: ["m10", "f7"],
    days: ["Mon", "Fri"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 1 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["plank", "suitcase_carry"],
    mtp_safe: true,
    notes: "Anti-rotation isometric. Minimal limb load. Safe across nearly all injury states.",
  },
  {
    id: "hip_thrust",
    name: "Hip Thrust (Smith Machine, Heavy)",
    scheduleIds: ["t1"],
    days: ["Tue"],
    primaryStress: "peak",
    loads: [
      { region: "Glute L", tissueType: "muscleStatus", score: 3 },
      { region: "Glute R", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring L", tissueType: "muscleStatus", score: 1 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 1 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: ["hip_thrust_volume", "hip_abduction"],
    mtp_safe: true,
    notes: "Foot drive against platform creates incidental forefoot load (score 1). Monitor MTP response across sessions.",
  },
  {
    id: "leg_press_heel_drive",
    name: "Leg Press (Heel Drive Protocol)",
    scheduleIds: ["t2", "leg_press"],
    days: ["Tue"],
    primaryStress: "cyclic",
    loads: [
      { region: "Quad L", tissueType: "muscleStatus", score: 3 },
      { region: "Quad R", tissueType: "muscleStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 2 },
      { region: "Knee R", tissueType: "tendonStatus", score: 2 },
      { region: "Glute L", tissueType: "muscleStatus", score: 2 },
      { region: "Glute R", tissueType: "muscleStatus", score: 2 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["cycling_stationary"],
    mtp_safe: true,
    notes: "Heel drive cues reduce forefoot load to score 1. Patellar tendon stress moderate at 15-rep endurance protocol. Preferred leg press variant when Toe L OC active.",
  },
  {
    id: "kb_rdl",
    name: "KB RDL / Trap Bar Deadlift",
    scheduleIds: ["t3"],
    days: ["Tue"],
    primaryStress: "eccentric",
    loads: [
      { region: "Hamstring L", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 3 },
      { region: "Glute L", tissueType: "muscleStatus", score: 2 },
      { region: "Glute R", tissueType: "muscleStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["romanian_deadlift", "hamstring_eccentric_curl"],
    mtp_safe: true,
    notes: "Hamstring eccentric emphasis. Low MTP load. Safe with most lower body OC items except lumbar.",
  },
  {
    id: "lateral_band_walk",
    name: "Lateral Band Walk",
    scheduleIds: ["t4"],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Hip L", tissueType: "tendonStatus", score: 3 },
      { region: "Hip R", tissueType: "tendonStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
      { region: "Toe L", tissueType: "jointStatus", score: 2 },
    ],
    substitutes: ["hip_abduction", "hip_drive_marches"],
    mtp_safe: false,
    notes: "Lateral forefoot loading during sideways movement. Score 2 on Toe L. Flag when MTP OC is active. Hip abduction machine is the preferred seated substitute.",
  },
  {
    id: "hip_drive_marches",
    name: "Hip Drive Marches (Band)",
    scheduleIds: ["t5"],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Hip L", tissueType: "muscleStatus", score: 2 },
      { region: "Hip R", tissueType: "muscleStatus", score: 2 },
      { region: "Core/Abs", tissueType: "muscleStatus", score: 2 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: ["hip_abduction"],
    mtp_safe: true,
    notes: "Pelvic stabilization in standing. Minimal forefoot load in stationary position. Score 1 on Toe L.",
  },
  {
    id: "leg_extension",
    name: "Leg Extension (Machine)",
    scheduleIds: ["t6", "leg_ext"],
    days: ["Tue"],
    primaryStress: "cyclic",
    loads: [
      { region: "Quad L", tissueType: "muscleStatus", score: 3 },
      { region: "Quad R", tissueType: "muscleStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 3 },
      { region: "Knee R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: ["tke_patellar"],
    mtp_safe: true,
    notes: "Highest direct patellar tendon load in the program. Full terminal extension under cyclic load. Flag if Knee tendonStatus OC is active.",
  },
  {
    id: "plank",
    name: "Plank (3 × 60 sec)",
    scheduleIds: ["t7"],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 1 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["deadbugs", "pallof_press"],
    mtp_safe: true,
    notes: "Anti-extension isometric. Broad applicability. Safe across most injury states.",
  },
  {
    id: "deadbugs",
    name: "90/90 Deadbugs",
    scheduleIds: ["t8"],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Hip L", tissueType: "muscleStatus", score: 1 },
      { region: "Hip R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["plank", "pallof_press"],
    mtp_safe: true,
    notes: "Anti-extension with hip flexor involvement. Supine position. Zero lower limb load.",
  },
  {
    id: "cable_row_single_arm",
    name: "Cable Row (mid) — Single Arm",
    scheduleIds: ["th1", "cable_row"],
    days: ["Thu"],
    primaryStress: "peak",
    loads: [
      { region: "Upper Back", tissueType: "muscleStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["inverted_row", "lat_pulldown"],
    mtp_safe: true,
    notes: "Heavy pulling. Elbow flexor load is secondary but cumulates with direct bicep work later in session.",
  },
  {
    id: "lat_pulldown",
    name: "Lat Pulldown",
    scheduleIds: ["th2", "lat_pull"],
    days: ["Thu"],
    primaryStress: "peak",
    loads: [
      { region: "Upper Back", tissueType: "muscleStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["cable_row_single_arm", "inverted_row"],
    mtp_safe: true,
    notes: "Lat primary. Shoulder ER at top creates rotator cuff stabilization demand (score 1).",
  },
  {
    id: "straight_arm_pulldown",
    name: "Straight Arm Pulldowns",
    scheduleIds: ["th3"],
    days: ["Thu"],
    primaryStress: "isometric",
    loads: [
      { region: "Upper Back", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 1 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["lat_pulldown"],
    mtp_safe: true,
    notes: "Arms straight — elbow flexor load near zero. Pure lat isolation. Compatible with elbow tendon OC as a substitute for other pulling exercises.",
  },
  {
    id: "inverted_row",
    name: "Inverted Row",
    scheduleIds: ["th4"],
    days: ["Thu"],
    primaryStress: "peak",
    loads: [
      { region: "Upper Back", tissueType: "muscleStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Core/Abs", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 1 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["lat_pulldown", "straight_arm_pulldown"],
    mtp_safe: true,
    notes: "Bodyweight row. Core anti-sag demand. Lower absolute elbow tendon load than weighted row.",
  },
  {
    id: "bicep_curl_heavy",
    name: "Biceps Curl",
    scheduleIds: ["th5", "bicep_db"],
    days: ["Thu"],
    primaryStress: "peak",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 3 },
      { region: "Forearm L", tissueType: "tendonStatus", score: 1 },
      { region: "Forearm R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["hammer_curl", "cable_d2_flexion"],
    mtp_safe: true,
    notes: "Highest per-rep elbow flexor tendon load in the program. Accumulates with cable row and lat pulldown in the same session.",
  },
  {
    id: "chinups",
    name: "Chin-ups",
    scheduleIds: ["th10", "chinups"],
    days: ["Mon", "Thu"],
    primaryStress: "cyclic",
    loads: [
      { region: "Upper Back", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Bodyweight vertical pull. Logged as Chin-ups in schedule sessions.",
  },
  {
    id: "bicep_curl_reverse",
    name: "reverse biceps",
    scheduleIds: ["bicep_curl_reverse"],
    days: ["Mon"],
    primaryStress: "cyclic",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Wrist L", tissueType: "tendonStatus", score: 1 },
      { region: "Wrist R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Reverse-grip biceps curl logged from wt-log sessions.",
  },
  {
    id: "cable_d2_flexion",
    name: "Cable D2 Flexion",
    scheduleIds: ["th6", "cable_d2"],
    days: ["Thu"],
    primaryStress: "cyclic",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 2 },
    ],
    substitutes: ["hammer_curl"],
    mtp_safe: true,
    notes: "Diagonal PNF-derived movement. Lower elbow tendon load than supinated curl.",
  },
  {
    id: "bicep_curl_neutral",
    name: "Biceps Curl (Cable Rope, Neutral Grip)",
    scheduleIds: ["th7", "bicep_rope"],
    days: ["Thu"],
    primaryStress: "peak",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: ["hammer_curl", "straight_arm_pulldown"],
    mtp_safe: true,
    notes: "Brachialis emphasis (neutral grip). Cumulates with supinated curl in the same session. Monitor elbow tendon response across Thursday sessions.",
  },
  {
    id: "hammer_curl",
    name: "Hammer Curl",
    scheduleIds: ["th8"],
    days: ["Thu"],
    primaryStress: "cyclic",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Forearm L", tissueType: "tendonStatus", score: 2 },
      { region: "Forearm R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: ["cable_d2_flexion"],
    mtp_safe: true,
    notes: "Brachioradialis and forearm extensor involvement. Moderate elbow load.",
  },
  {
    id: "suitcase_carry",
    name: "Suitcase Carry",
    scheduleIds: ["th9"],
    days: ["Thu"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder L", tissueType: "muscleStatus", score: 1 },
      { region: "Shoulder R", tissueType: "muscleStatus", score: 1 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: ["pallof_press", "plank"],
    mtp_safe: true,
    notes: "Lateral anti-flexion core with walking. Forefoot load is walking-only incidental (score 1). Elbow flexors minimal at grip.",
  },
  {
    id: "cable_crossover",
    name: "Cable Crossover (Chest Volume)",
    scheduleIds: ["f0", "pec_fly"],
    days: ["Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Chest", tissueType: "muscleStatus", score: 3 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["machine_flys", "chest_press_machine"],
    mtp_safe: true,
    notes: "Volume chest frequency. Lower absolute load than Monday press. Shoulder and elbow demand score 1.",
  },
  {
    id: "hip_abduction",
    name: "Hip Abduction (Machine)",
    scheduleIds: ["f1"],
    days: ["Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Hip L", tissueType: "muscleStatus", score: 3 },
      { region: "Hip R", tissueType: "muscleStatus", score: 3 },
      { region: "IT Band L", tissueType: "tendonStatus", score: 1 },
      { region: "IT Band R", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["hip_drive_marches"],
    mtp_safe: true,
    notes: "Seated machine. No forefoot load. Preferred substitute for lateral band walk when Toe L OC is active.",
  },
  {
    id: "hip_adduction",
    name: "Hip Adduction (Machine)",
    scheduleIds: ["f2"],
    days: ["Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Hip L", tissueType: "muscleStatus", score: 3 },
      { region: "Hip R", tissueType: "muscleStatus", score: 3 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Seated machine. Groin and adductor focus. No forefoot or knee tendon load. Broadly safe.",
  },
  {
    id: "kb_swing",
    name: "KB Swing",
    scheduleIds: ["f3"],
    days: ["Fri"],
    primaryStress: "peak",
    loads: [
      { region: "Glute L", tissueType: "muscleStatus", score: 3 },
      { region: "Glute R", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring L", tissueType: "muscleStatus", score: 2 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Toe L", tissueType: "jointStatus", score: 2 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["hip_thrust_volume", "romanian_deadlift"],
    mtp_safe: false,
    notes: "Explosive forefoot drive at hip hinge bottom. Score 2 on Toe L — flag when MTP OC active. Replace with seated or supported glute exercises.",
  },
  {
    id: "hip_thrust_volume",
    name: "Hip Thrust (Smith Machine, Volume)",
    scheduleIds: ["f4", "hip_thrust"],
    days: ["Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Glute L", tissueType: "muscleStatus", score: 3 },
      { region: "Glute R", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring L", tissueType: "muscleStatus", score: 1 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 1 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: ["hip_abduction", "hip_adduction"],
    mtp_safe: true,
    notes: "Volume version of Tuesday hip thrust. Same pattern, lighter load. Toe L score 1 (incidental foot drive).",
  },
  {
    id: "romanian_deadlift",
    name: "Romanian Deadlift (DB / Barbell)",
    scheduleIds: ["f5"],
    days: ["Fri"],
    primaryStress: "eccentric",
    loads: [
      { region: "Hamstring L", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 3 },
      { region: "Glute L", tissueType: "muscleStatus", score: 2 },
      { region: "Glute R", tissueType: "muscleStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
    ],
    substitutes: ["kb_rdl", "hamstring_eccentric_curl"],
    mtp_safe: true,
    notes: "Hamstring eccentric with lumbar stabilization demand. No direct lower limb impact load.",
  },
  {
    id: "hamstring_eccentric_curl",
    name: "Hamstring Eccentric Curl (Leg Curl, 4s Eccentric)",
    scheduleIds: ["f6", "leg_curl"],
    days: ["Fri"],
    primaryStress: "eccentric",
    loads: [
      { region: "Hamstring L", tissueType: "muscleStatus", score: 3 },
      { region: "Hamstring R", tissueType: "muscleStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: ["kb_rdl", "romanian_deadlift"],
    mtp_safe: true,
    notes: "4-second eccentric protocol. Highest hamstring tendon stimulus in the program. Safe for MTP and most lower body OC states.",
  },
  {
    id: "shoulder_clock_band",
    name: "Shoulder Clock w/ Band",
    scheduleIds: ["f8", "shoulder_press_light"],
    days: ["Fri"],
    primaryStress: "cyclic",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
    ],
    substitutes: ["face_pull_er"],
    mtp_safe: true,
    notes: "Full range shoulder health maintenance. Low absolute load. Compatible with most shoulder OC states except score >= 3.",
  },
  {
    id: "russian_twists",
    name: "Russian Twists",
    scheduleIds: ["f9"],
    days: ["Fri"],
    primaryStress: "isometric",
    loads: [
      { region: "Core/Abs", tissueType: "muscleStatus", score: 3 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
    ],
    substitutes: ["plank", "pallof_press"],
    mtp_safe: true,
    notes: "Rotational core. Light lumbar demand. Safe across most injury states.",
  },
  {
    id: "eccentric_calf_raise",
    name: "Eccentric Calf Raise (Alfredson Protocol)",
    scheduleIds: [],
    days: ["Tue", "Fri"],
    primaryStress: "eccentric",
    loads: [
      { region: "Calf L", tissueType: "tendonStatus", score: 3 },
      { region: "Calf R", tissueType: "tendonStatus", score: 3 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 2 },
      { region: "Ankle R", tissueType: "tendonStatus", score: 2 },
      { region: "Toe L", tissueType: "jointStatus", score: 1 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Therapeutic Achilles loading. Friday version always Level 1 regardless of Tuesday progression. Do not substitute.",
  },
  {
    id: "tibialis_raise",
    name: "Tibialis Raise (Wall Shin Raise)",
    scheduleIds: [],
    days: ["Tue", "Fri"],
    primaryStress: "isometric",
    loads: [
      { region: "Shin L", tissueType: "muscleStatus", score: 3 },
      { region: "Shin R", tissueType: "muscleStatus", score: 3 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Anterior chain running prehab. No Achilles, knee, or MTP load. Safe across all lower limb OC states.",
  },
  {
    id: "tke_patellar",
    name: "Terminal Knee Extension (TKE, Band)",
    scheduleIds: [],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Knee L", tissueType: "tendonStatus", score: 3 },
      { region: "Knee R", tissueType: "tendonStatus", score: 3 },
      { region: "Quad L", tissueType: "muscleStatus", score: 2 },
      { region: "Quad R", tissueType: "muscleStatus", score: 2 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Direct patellar tendon isometric therapeutic loading. Small ROM. Do not substitute.",
  },
  {
    id: "mtp_balance",
    name: "MTP Weight-Bearing Balance",
    scheduleIds: [],
    days: ["Tue"],
    primaryStress: "isometric",
    loads: [
      { region: "Toe L", tissueType: "jointStatus", score: 3 },
      { region: "Ankle L", tissueType: "tendonStatus", score: 1 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Therapeutic loading for the MTP joint. It loads the injured tissue on purpose as part of the protocol. Do not flag or substitute even when Toe L OC is active.",
  },
  {
    id: "eccentric_lateral_raise",
    name: "Eccentric Lateral Raise (Supraspinatus Protocol)",
    scheduleIds: [],
    days: ["Thu"],
    primaryStress: "eccentric",
    loads: [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Therapeutic supraspinatus eccentric loading. Do not substitute. Loads the tissue on purpose.",
  },
  {
    id: "eccentric_bicep_curl",
    name: "Eccentric Biceps Curl (Elbow Tendon Protocol)",
    scheduleIds: [],
    days: ["Thu"],
    primaryStress: "eccentric",
    loads: [
      { region: "Elbow L", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Elbow flexor tendon eccentric loading protocol. Do not substitute. Therapeutic intent.",
  },
  {
    id: "hip_flexor_isometric",
    name: "Hip Flexor Isometric Hold",
    scheduleIds: [],
    days: ["Fri"],
    primaryStress: "isometric",
    loads: [
      { region: "Hip L", tissueType: "tendonStatus", score: 3 },
      { region: "Hip R", tissueType: "tendonStatus", score: 3 },
    ],
    substitutes: [],
    mtp_safe: true,
    notes: "Hip flexor tendon prehab for running. Therapeutic intent. Do not substitute.",
  },
]

const fd = (secondary_tissues, trigger, trigger_threshold, warning_text, common_injuries = []) => ({
  secondary_tissues,
  trigger,
  trigger_threshold,
  common_injuries,
  warning_text,
})

const EXERCISE_LIBRARY_V2_METADATA = {
  run: { running_chain: true, form_decay: null },
  cycling_stationary: { running_chain: true, form_decay: null },
  swim_freestyle: { running_chain: false, form_decay: null },
  chest_press_machine: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. Under fatigue, elbows flare beyond 90 degrees, transferring load from the pec to the anterior shoulder capsule and supraspinatus. Elbows stay within 45 to 75 degrees of the torso throughout.",
    ["Anterior shoulder capsule strain", "Supraspinatus impingement", "Triceps long head tendon irritation"]
  ) },
  incline_chest_press: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Incline angle increases supraspinatus impingement risk. Under fatigue, the shoulder rolls forward at the top. Keep chest up and retract scapulae throughout.",
    ["Supraspinatus impingement", "Long head biceps tendon irritation", "Acromioclavicular joint stress"]
  ) },
  machine_flys: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Fly movements are high risk for pectoral tendon tears under load. Maintain a soft elbow bend throughout. Stop the range 10 to 15 degrees before the shoulder feels stretched, especially under fatigue.",
    ["Pectoralis major tendon strain", "Anterior capsule stretch injury", "Bicipital tendon strain"]
  ) },
  lateral_raise: { running_chain: false, form_decay: null },
  rear_delt_fly: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 15, window_days: 7 },
    "Under fatigue, reverse fly produces internal rotation compensation at end range. Keep thumbs pointing up throughout to maintain external rotation.",
    ["Posterior rotator cuff irritation", "Rhomboid strain"]
  ) },
  face_pull_er: { running_chain: false, form_decay: null },
  triceps_pulldown: { running_chain: false, form_decay: fd(
    [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Wrist L", tissueType: "tendonStatus", score: 1 },
      { region: "Wrist R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. Under fatigue, cable pushdowns shift demand to elbow and wrist extensors. Keep the wrist neutral and stop before elbow flare appears.",
    ["Distal triceps tendon irritation", "Lateral epicondyle stress"]
  ) },
  triceps_overhead: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Overhead position places the triceps long head tendon under maximum stretch-under-load. Elbows must stay parallel and pointing forward. Any flare transfers load to the posterior capsule and lateral elbow.",
    ["Triceps long head tendon irritation", "Posterior shoulder capsule strain", "Lateral epicondyle stress"]
  ) },
  pushup_plank_shoulder_touch: { running_chain: true, form_decay: null },
  pallof_press: { running_chain: true, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 15, window_days: 7 },
    "Pallof press is an anti-rotation exercise. Any rotation defeats the purpose and shifts load to lumbar rotators. If rotation appears under the current load, reduce weight, not reps.",
    ["Anterior shoulder impingement", "Lumbar rotation strain"]
  ) },
  hip_thrust: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Under fatigue, hip thrust produces lumbar hyperextension at the top. Drive through the heels, engage glutes before pushing, and stop at neutral spine, not maximum hip extension.",
    ["Lumbar hyperextension injury", "Hamstring proximal strain", "Hamstring distal strain"]
  ) },
  leg_press_heel_drive: { running_chain: true, form_decay: fd(
    [
      { region: "Knee L", tissueType: "tendonStatus", score: 3 },
      { region: "Knee R", tissueType: "tendonStatus", score: 3 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 3 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 2 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 2 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week and running volume also rising. Under fatigue, hips posteriorly tilt at depth, loading lumbar discs. Valgus knee collapse also appears. Keep heels flat and stop depth at 90 degrees hip flexion.",
    ["Patellar tendinopathy", "Lumbar disc compression", "Medial knee ligament stress", "MTP dorsiflexion load"]
  ) },
  kb_rdl: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. RDL is the highest lumbar spine loading pattern in the library under fatigue. Neutral spine is non-negotiable. Stop the descent when the lower back rounds.",
    ["Lumbar strain", "Proximal hamstring tendinopathy", "Sciatic nerve irritation"]
  ) },
  lateral_band_walk: { running_chain: true, form_decay: fd(
    [
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 1 },
    ],
    "set_volume_ramp",
    { set_increase: 1 },
    "Under heavy band tension or high volume, lateral walks produce knee valgus and ankle eversion instead of true hip abduction. If you see knees tracking inward, reduce band resistance before adding volume.",
    ["IT band friction at the lateral knee", "Peroneal tendon strain"]
  ) },
  hip_drive_marches: { running_chain: true, form_decay: null },
  leg_extension: { running_chain: true, form_decay: fd(
    [
      { region: "Knee L", tissueType: "tendonStatus", score: 3 },
      { region: "Knee R", tissueType: "tendonStatus", score: 3 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 1 },
    ],
    "combined",
    { load_increase_pct: 10, rep_range_exceeded: 3 },
    "Leg extension produces high patellar tendon force per rep, especially in the last 30 degrees of extension. Any anterior knee discomfort during or after this exercise is a direct signal to reduce load immediately.",
    ["Patellar tendinopathy", "Patellofemoral pain syndrome", "Tibialis anterior tendon stress"]
  ) },
  plank: { running_chain: true, form_decay: null },
  deadbugs: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Hip L", tissueType: "tendonStatus", score: 1 },
      { region: "Hip R", tissueType: "tendonStatus", score: 1 },
    ],
    "rep_range_exceeded",
    { excess_reps: 5 },
    "Dead bugs are only safe if the lower back stays pressed to the floor throughout. The moment the back lifts, the hip flexors are doing the work instead of the deep anterior core. Stop the set.",
    ["Lumbar strain", "Hip flexor tendon irritation"]
  ) },
  cable_row_single_arm: { running_chain: false, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load jumped more than 10% this week. Under fatigue, single-arm rows recruit lumbar rotation and bicipital structures as compensators. Confirm scapular retraction is leading the pull, not elbow drive.",
    ["Lumbar strain", "Bicipital tendon irritation", "Rhomboid strain"]
  ) },
  lat_pulldown: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load increased this week. Under fatigue, lat pulldown recruits the supraspinatus and creates forward head drift. Confirm scapular depression before initiating the pull.",
    ["Supraspinatus impingement", "Bicipital tendon irritation", "Lumbar hyperextension strain"]
  ) },
  straight_arm_pulldown: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. When fatigued, the elbows flex to compensate, shifting load from the lats to the anterior shoulder capsule and triceps long head. Keep arms locked.",
    ["Anterior shoulder capsule strain", "Triceps long head tendon irritation", "Posterior rotator cuff irritation"]
  ) },
  inverted_row: { running_chain: false, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
    ],
    "rep_range_exceeded",
    { excess_reps: 3 },
    "Reps exceeded prescription. Under fatigue, hips drop and the lower back takes compensatory load. Maintain rigid plank alignment throughout all reps.",
    ["Lumbar sagging strain", "Bicipital tendon load"]
  ) },
  bicep_curl_heavy: { running_chain: false, form_decay: fd(
    [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder L", tissueType: "tendonStatus", score: 1 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. Under fatigue, biceps curls recruit shoulder momentum and wrist flexors as substitutes, placing medial elbow tendon and anterior shoulder at risk. Full supination, no swing.",
    ["Distal biceps tendon strain", "Medial epicondylitis", "Anterior shoulder impingement", "Bicipital groove irritation"]
  ) },
  bicep_curl_neutral: { running_chain: false, form_decay: fd(
    [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Wrist L", tissueType: "tendonStatus", score: 1 },
      { region: "Wrist R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. Hammer curls under fatigue shift demand to brachioradialis and wrist extensors. Lateral elbow is the primary at-risk structure. Strict neutral grip throughout.",
    ["Radial tunnel syndrome", "Lateral epicondylitis", "Distal brachialis tendon irritation"]
  ) },
  cable_d2_flexion: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 2 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "D2 flexion requires precise diagonal path control. Under fatigue, the arc collapses inward and the rotator cuff substitutes for the prime movers. Reduce load before arc deviation appears.",
    ["Anterior shoulder impingement", "Rotator cuff strain", "Bicipital tendon irritation"]
  ) },
  hammer_curl: { running_chain: false, form_decay: fd(
    [
      { region: "Elbow L", tissueType: "tendonStatus", score: 2 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 2 },
      { region: "Wrist L", tissueType: "tendonStatus", score: 1 },
      { region: "Wrist R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. Hammer curls under fatigue shift demand to brachioradialis and wrist extensors. Lateral elbow is the primary at-risk structure. Strict neutral grip throughout.",
    ["Radial tunnel syndrome", "Lateral epicondylitis", "Distal brachialis tendon irritation"]
  ) },
  suitcase_carry: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Unilateral suitcase carry at high load is meaningful core demand. Under fatigue, the torso laterally flexes toward the weight, defeating the exercise intent and loading the lumbar QL. Stop if you cannot maintain vertical torso.",
    ["Lumbar QL strain", "Shoulder depression strain", "Ankle inversion sprain"]
  ) },
  cable_crossover: { running_chain: false, form_decay: fd(
    [
      { region: "Shoulder L", tissueType: "tendonStatus", score: 3 },
      { region: "Shoulder R", tissueType: "tendonStatus", score: 3 },
      { region: "Elbow L", tissueType: "tendonStatus", score: 1 },
      { region: "Elbow R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Fly movements are high risk for pectoral tendon tears under load. Maintain a soft elbow bend throughout. Stop the range 10 to 15 degrees before the shoulder feels stretched, especially under fatigue.",
    ["Pectoralis major tendon strain", "Anterior capsule stretch injury", "Bicipital tendon strain"]
  ) },
  hip_abduction: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 15, window_days: 7 },
    "Under fatigue, the torso laterally flexes toward the working leg, substituting trunk lateral flexion for true hip abduction. This pattern loads the IT band rather than gluteus medius. Keep torso vertical.",
    ["IT band friction syndrome", "Lateral lumbar strain", "Greater trochanteric bursitis"]
  ) },
  hip_adduction: { running_chain: true, form_decay: null },
  kb_swing: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 3 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 2 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 2 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Under fatigue, kettlebell swings shift from hip snap to lumbar extension and forefoot drive. Keep the hinge crisp and stop the set when the bell path drops.",
    ["Lumbar strain", "Hamstring strain", "Forefoot overload"]
  ) },
  hip_thrust_volume: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "AnkleFoot L", tissueType: "tendonStatus", score: 1 },
      { region: "AnkleFoot R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Under fatigue, hip thrust produces lumbar hyperextension at the top. Drive through the heels, engage glutes before pushing, and stop at neutral spine, not maximum hip extension.",
    ["Lumbar hyperextension injury", "Hamstring strain"]
  ) },
  romanian_deadlift: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 3 },
      { region: "Knee L", tissueType: "tendonStatus", score: 1 },
      { region: "Knee R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Load up this week. RDL is the highest lumbar spine loading exercise in the library under fatigue. Neutral spine is non-negotiable. Stop the descent when the lower back rounds.",
    ["Lumbar strain", "Proximal hamstring tendinopathy", "Sciatic nerve irritation"]
  ) },
  hamstring_eccentric_curl: { running_chain: true, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 1 },
      { region: "Knee L", tissueType: "tendonStatus", score: 2 },
      { region: "Knee R", tissueType: "tendonStatus", score: 2 },
    ],
    "set_volume_ramp",
    { set_increase: 1 },
    "Eccentric hamstring load is therapeutic but dose-sensitive. Adding a set without a deload creates rapid accumulation that exceeds tendon adaptation rate. Hamstring strains from eccentric curls are slow to resolve.",
    ["Biceps femoris strain", "Popliteal pain", "Proximal hamstring tendon irritation"]
  ) },
  shoulder_clock_band: { running_chain: false, form_decay: null },
  russian_twists: { running_chain: false, form_decay: fd(
    [
      { region: "Lower Back", tissueType: "muscleStatus", score: 2 },
      { region: "Hip L", tissueType: "tendonStatus", score: 1 },
      { region: "Hip R", tissueType: "tendonStatus", score: 1 },
    ],
    "load_ramp",
    { load_increase_pct: 10, window_days: 7 },
    "Under load or fatigue, Russian twists produce lumbar rotation at end range. This is a high-risk position for disc tissue. Control the rotation and do not allow momentum to carry past 45 degrees per side.",
    ["Lumbar disc stress", "Hip flexor strain"]
  ) },
  eccentric_calf_raise: { running_chain: true, form_decay: null },
  tibialis_raise: { running_chain: true, form_decay: null },
  tke_patellar: { running_chain: true, form_decay: null },
  mtp_balance: { running_chain: true, form_decay: null },
  eccentric_lateral_raise: { running_chain: false, form_decay: null },
  eccentric_bicep_curl: { running_chain: false, form_decay: null },
  hip_flexor_isometric: { running_chain: true, form_decay: null },
}

for (const entry of EXERCISE_LIBRARY) {
  const metadata = EXERCISE_LIBRARY_V2_METADATA[entry.id]
  entry.running_chain = Boolean(metadata?.running_chain)
  entry.form_decay = Array.isArray(entry.substitutes) && entry.substitutes.length === 0
    ? null
    : metadata?.form_decay ?? null
}

// REFERENCE_LOADS: default working load per exercise id from SCH_PLAN schMk defaults.
// Used as denominator in modifier calculation. Update when baseline loads change.
const REFERENCE_LOADS = {
  chest_press_machine: 110,
  incline_chest_press: 90,
  machine_flys: 30,
  lateral_raise: 7,
  rear_delt_fly: 7,
  face_pull_er: 20,
  triceps_pulldown: 35,
  triceps_overhead: 30,
  pallof_press: 40,
  hip_thrust: 135,
  leg_press_heel_drive: 160,
  kb_rdl: 50,
  leg_extension: 80,
  lat_pulldown: 120,
  cable_row_single_arm: 67,
  straight_arm_pulldown: 40,
  bicep_curl_heavy: 75,
  bicep_curl_neutral: 60,
  hammer_curl: 20,
  cable_crossover: 30,
  hip_abduction: 120,
  hip_adduction: 80,
  kb_swing: 25,
  hip_thrust_volume: 100,
  romanian_deadlift: 50,
  hamstring_eccentric_curl: 80,
  suitcase_carry: 60,
}

// REFERENCE_VOLUME: default sets × reps per exercise for a typical session.
const REFERENCE_VOLUME = {
  chest_press_machine: 18,
  incline_chest_press: 18,
  machine_flys: 18,
  lateral_raise: 36,
  rear_delt_fly: 36,
  face_pull_er: 28,
  triceps_pulldown: 30,
  triceps_overhead: 16,
  pallof_press: 20,
  hip_thrust: 26,
  leg_press_heel_drive: 45,
  kb_rdl: 30,
  leg_extension: 36,
  lat_pulldown: 21,
  cable_row_single_arm: 18,
  straight_arm_pulldown: 24,
  bicep_curl_heavy: 15,
  bicep_curl_neutral: 18,
  hammer_curl: 22,
  cable_crossover: 42,
  hip_abduction: 24,
  hip_adduction: 24,
  kb_swing: 30,
  hip_thrust_volume: 33,
  romanian_deadlift: 33,
  hamstring_eccentric_curl: 27,
  suitcase_carry: 4,
}

/**
 * computeExecutionModifier
 * Returns a multiplier (0.5 to 2.0) that scales the library base load score
 * based on actual logged weight and volume versus reference values.
 *
 * @param {string} exerciseId  - matches EXERCISE_LIBRARY id
 * @param {Array}  sets        - array of logged set objects: [{r, w}] where r=reps, w=weight
 * @returns {number}           - modifier clamped to [0.5, 2.0]
 */
export function computeExecutionModifier(exerciseId, sets) {
  if (!sets || sets.length === 0) return 1.0

  const refLoad = REFERENCE_LOADS[exerciseId]
  const refVolume = REFERENCE_VOLUME[exerciseId]

  const parsedSets = sets
    .map(s => ({
      reps: Math.max(1, parseFloat(s.r) || 0),
      weight: Math.max(0, parseFloat(s.w) || 0),
    }))
    .filter(s => s.reps > 0)

  if (parsedSets.length === 0) return 1.0

  const avgWeight = parsedSets.reduce((sum, s) => sum + s.weight, 0) / parsedSets.length
  const totalReps = parsedSets.reduce((sum, s) => sum + s.reps, 0)

  const weightMod = refLoad && avgWeight > 0
    ? avgWeight / refLoad
    : 1.0

  // Treat volume as neutral when only a single set is logged; partial logging
  // should not suppress otherwise valid heavy-load flags.
  const volumeMod = refVolume && totalReps > 0 && parsedSets.length > 1
    ? totalReps / refVolume
    : 1.0

  const combined = (weightMod * 0.65) + (volumeMod * 0.35)

  return Math.min(2.0, Math.max(0.5, combined))
}

const EXERCISE_LIBRARY_BY_KEY = new Map()
for (const entry of EXERCISE_LIBRARY) {
  EXERCISE_LIBRARY_BY_KEY.set(entry.id, entry)
  for (const scheduleId of entry.scheduleIds) {
    EXERCISE_LIBRARY_BY_KEY.set(scheduleId, entry)
  }
}

function getExerciseEntry(exerciseId) {
  return EXERCISE_LIBRARY_BY_KEY.get(exerciseId) || null
}

function parseFirstNumber(value) {
  const match = String(value ?? "").replace(",", "").match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function parseSetsValue(value, fallback = 0) {
  const parsed = parseInt(String(value ?? "").match(/\d+/)?.[0] || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseRepsValue(value) {
  const nums = String(value ?? "").match(/\d+(\.\d+)?/g)
  if (!nums?.length) return 0
  return Math.max(...nums.map(Number).filter(Number.isFinite))
}

function parseLoadValue(value) {
  const raw = String(value ?? "").trim().toUpperCase()
  if (!raw || raw === "BW" || raw === "BODYWEIGHT") return 0
  return parseFirstNumber(raw)
}

function toLoggedSets(actual = {}, prescribed = {}) {
  const setCount = parseSetsValue(actual.sets, parseSetsValue(prescribed.sets, 1))
  const reps = actual.reps ?? prescribed.reps ?? ""
  const load = actual.load ?? prescribed.load ?? ""
  return Array.from({ length: Math.max(1, setCount) }, () => ({ r: reps, w: load }))
}

function getExerciseMetric(loggedExercise) {
  const actual = loggedExercise?.actual || {}
  const prescribed = loggedExercise?.prescribed || {}
  return {
    sets: parseSetsValue(actual.sets, parseSetsValue(prescribed.sets, 0)),
    reps: parseRepsValue(actual.reps),
    prescribedReps: parseRepsValue(prescribed.reps),
    load: parseLoadValue(actual.load),
    prescribedLoad: parseLoadValue(prescribed.load),
  }
}

function getExerciseDateMs(sessionEntry) {
  const raw = sessionEntry?.logged_at || sessionEntry?.dateTime || sessionEntry?.date
  const ms = raw ? new Date(raw).getTime() : NaN
  return Number.isFinite(ms) ? ms : 0
}

function findPriorExerciseLogs(exerciseId, priorSessions = [], currentDateMs = Date.now(), windowDays = 14) {
  const entry = getExerciseEntry(exerciseId)
  const keys = new Set([exerciseId, entry?.id, ...(entry?.scheduleIds || [])].filter(Boolean).map(String))
  const minMs = currentDateMs - (windowDays * 24 * 60 * 60 * 1000)

  return (Array.isArray(priorSessions) ? priorSessions : [])
    .filter(sessionEntry => {
      const ms = getExerciseDateMs(sessionEntry)
      return ms > 0 && ms < currentDateMs && ms >= minMs
    })
    .flatMap(sessionEntry =>
      (Array.isArray(sessionEntry?.exercises) ? sessionEntry.exercises : [])
        .filter(ex => keys.has(String(ex?.exercise_id)))
        .map(ex => ({ ...ex, _sessionDateMs: getExerciseDateMs(sessionEntry), _sessionId: sessionEntry?.session_id || sessionEntry?.id || null }))
    )
    .sort((a, b) => b._sessionDateMs - a._sessionDateMs)
}

function hasConsecutiveHighExecutionModifier(exerciseId, loggedExercise, priorLogs) {
  const current = computeExecutionModifier(exerciseId, toLoggedSets(loggedExercise?.actual, loggedExercise?.prescribed))
  const previous = priorLogs?.[0]
  if (!previous) return false
  const prior = computeExecutionModifier(exerciseId, toLoggedSets(previous.actual, previous.prescribed))
  return current > 1.4 && prior > 1.4
}

function didPrimaryFormDecayTriggerFire(formDecay, currentMetric, previousMetric) {
  if (!formDecay) return false
  const threshold = formDecay.trigger_threshold || {}
  const loadThreshold = Number(threshold.load_increase_pct ?? 10)
  const excessRepsThreshold = Number(threshold.excess_reps ?? threshold.rep_range_exceeded ?? 3)
  const setIncreaseThreshold = Number(threshold.set_increase ?? 1)

  const loadRamp = currentMetric.load > 0 && previousMetric?.load > 0
    ? ((currentMetric.load - previousMetric.load) / previousMetric.load) * 100 > loadThreshold
    : false
  const repsExceeded = currentMetric.prescribedReps > 0
    ? currentMetric.reps - currentMetric.prescribedReps >= excessRepsThreshold
    : false
  const setRamp = previousMetric?.sets > 0
    ? currentMetric.sets - previousMetric.sets >= setIncreaseThreshold
    : false

  if (formDecay.trigger === "load_ramp") return loadRamp
  if (formDecay.trigger === "rep_range_exceeded") return repsExceeded
  if (formDecay.trigger === "set_volume_ramp") return setRamp
  if (formDecay.trigger === "combined") return [loadRamp, repsExceeded, setRamp].filter(Boolean).length >= 2
  return false
}

export function evaluateFormDecayAlert(loggedExercise, priorSessions = [], loggedAt = Date.now()) {
  const entry = EXERCISE_LIBRARY.find(entry => loggedExercise?.exercise_name?.toLowerCase() === entry.name.toLowerCase())
  const formDecay = entry?.form_decay
  if (!entry || !formDecay) return null

  const loggedAtMs = Number.isFinite(Number(loggedAt)) ? Number(loggedAt) : new Date(loggedAt).getTime()
  const windowDays = Number(formDecay.trigger_threshold?.window_days || 14)
  const priorLogs = findPriorExerciseLogs(entry.id, priorSessions, Number.isFinite(loggedAtMs) ? loggedAtMs : Date.now(), windowDays)
  const currentMetric = getExerciseMetric(loggedExercise)
  const previousMetric = priorLogs.length ? getExerciseMetric(priorLogs[0]) : null
  const primaryFired = didPrimaryFormDecayTriggerFire(formDecay, currentMetric, previousMetric)
  const modifierFired = hasConsecutiveHighExecutionModifier(entry.id, loggedExercise, priorLogs)

  if (!primaryFired && !modifierFired) return null

  return {
    exerciseId: loggedExercise.exercise_id,
    libraryExerciseId: entry.id,
    exerciseName: loggedExercise.exercise_name || entry.name,
    trigger: modifierFired && !primaryFired ? "execution_modifier" : formDecay.trigger,
    secondary_tissues: formDecay.secondary_tissues,
    warning_text: formDecay.warning_text,
    common_injuries: formDecay.common_injuries || [],
  }
}

export function flagExercisesForOcItems(dayExercises, activeOcItems, executionData = {}) {
  if (!activeOcItems?.length || !dayExercises?.length) return []

  const flags = []

  for (const ex of dayExercises) {
    const entry = getExerciseEntry(ex.id)
    if (!entry) continue
    if (!Array.isArray(entry.substitutes) || entry.substitutes.length === 0) continue

    const loggedSets = executionData[ex.id] || executionData[entry.id] || []
    const modifier = computeExecutionModifier(entry.id, loggedSets)

    for (const ocItem of activeOcItems) {
      if ((ocItem.currentScore || 0) < 1) continue

      const matchedLoads = entry.loads
        .map(load => ({
          ...load,
          effectiveLoadScore: load.score * modifier,
        }))
        .filter(
        load =>
          load.region === ocItem.location &&
          load.tissueType === ocItem.key &&
          load.effectiveLoadScore >= 2
      )

      if (matchedLoads.length === 0) continue

      const effectiveLoadScore = Math.max(...matchedLoads.map(load => load.effectiveLoadScore))
      const loadScore = Math.round(effectiveLoadScore)
      const severity =
        ocItem.currentScore >= 2 && effectiveLoadScore >= 3 ? "high" : "moderate"

      flags.push({
        exerciseId: ex.id,
        exerciseName: entry.name,
        libraryExerciseId: entry.id,
        ocItemLabel: ocItem.label,
        ocLocation: ocItem.location,
        ocKey: ocItem.key,
        ocScore: ocItem.currentScore,
        loadScore,
        modifier: Number(modifier.toFixed(2)),
        severity,
        substitutes: entry.substitutes
          .map(substituteId => getExerciseEntry(substituteId)?.name)
          .filter(Boolean),
        substituteIds: entry.substitutes,
      })
    }
  }

  return flags
}

export function isMtpSafe(exerciseId) {
  const entry = getExerciseEntry(exerciseId)
  if (!entry) return true
  return entry.mtp_safe
}

export function isRunningChainExercise(exerciseId) {
  const entry = getExerciseEntry(exerciseId)
  return Boolean(entry?.running_chain)
}

/**
 * getExerciseProfile
 * Returns the full library entry for a given exercise id, or null if not found.
 * Used by the substitution UI to show load profile comparison.
 */
export function getExerciseProfile(exerciseId) {
  return getExerciseEntry(exerciseId)
}
