import React, { useState, useEffect } from "react"

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

const [daily,setDaily] = useState([])
const [nutrition,setNutrition] = useState([])
const [injury,setInjury] = useState([])

useEffect(()=>{

async function loadData(){

try{

const d = await fetch("/data/fitness_daily.json").then(r=>r.json())
const n = await fetch("/data/nutrition_daily.json").then(r=>r.json())
const i = await fetch("/data/injury_daily.json").then(r=>r.json())

setDaily(d)
setNutrition(n)
setInjury(i)

}catch(err){

console.log("Data load error",err)

}

}

loadData()

},[])

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

{tab==="Overview" && (

<div>

<h3>Overview</h3>

<div>Total weight records: {daily.length}</div>
<div>Total nutrition days: {nutrition.length}</div>
<div>Total injury entries: {injury.length}</div>

</div>

)}

{tab==="Calories" && (

<div>

<h3>Calories</h3>

<div>Nutrition records loaded: {nutrition.length}</div>

</div>

)}

{tab==="Injury" && (

<div>

<h3>Injury Log</h3>

<div>Injury entries loaded: {injury.length}</div>

</div>

)}

</div>

</div>
)
}
