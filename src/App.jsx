import React, { useState } from "react"

const tabs = [
"Overview",
"Body Comp",
"Training",
"Forecast",
"Schedule",
"Log",
"Calories",
"Injury"
]

export default function App(){

const [tab,setTab] = useState("Overview")

return (

<div style={{
background:"#07080e",
color:"#ced2f0",
minHeight:"100vh",
fontFamily:"Arial",
padding:"25px"
}}>

<h2>ANDRÉS FITNESS ARCHIVE</h2>

<div style={{display:"flex",gap:"8px",marginBottom:"20px"}}>
{tabs.map(t=>(
<button
key={t}
onClick={()=>setTab(t)}
style={{
padding:"8px 12px",
background:tab===t?"#252640":"#0d0e1c",
border:"1px solid #1a1b2e",
borderRadius:"8px",
color:"#ced2f0"
}}
>
{t}
</button>
))}
</div>

<div>

{tab==="Overview" && <div>Overview dashboard coming next</div>}

{tab==="Calories" && <div>Calorie intake tracking</div>}

{tab==="Injury" && <div>Injury tracking and recovery curves</div>}

</div>

</div>
)
}
