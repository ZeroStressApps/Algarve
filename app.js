import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/*
  PRIMERA VERSIÓN
  Cuando creemos el proyecto Firebase ALGARVE, sustituiremos este bloque por su configuración.
*/
const FIREBASE_CONFIG = null;

const PEOPLE = ["Carol","Graciela","Yanet"];
const STORAGE_KEY = "algarve-v1-data";
const days = [
  {id:"d1", label:"Vie 9", title:"🚗 Día 1 · Madrid → Algarve", text:"Día de viaje. Salida en coche desde Madrid rumbo al Algarve. Llegada, instalación en el Airbnb de Ferragudo y primera toma de contacto con la zona.", bullets:["🚗 Viaje en coche desde Madrid","🏡 Llegada y check-in en Casa LOOS Ferragudo","🛒 Comprar lo necesario para la estancia","🍷 Cena y primera noche en el Algarve"]},
  {id:"d2", label:"Sáb 10", title:"🌊 Día 2 · Algarve", text:"Día abierto para descubrir el Algarve. El plan concreto lo iremos completando aquí.", bullets:["🌞 Desayuno","📍 Planes y visitas por decidir","🍽️ Comida","🌙 Cena / noche"]},
  {id:"d3", label:"Dom 11", title:"⛵ Día 3 · Excursión", text:"Día reservado para la excursión de Airbnb: paseo en barco por la costa del Algarve, con salida desde Doca de São Francisco en Portimão y visita al fuerte de Santa Catarina y las cuevas de Benagil.", bullets:["⛵ Excursión 'Explora cuevas y la costa'","📍 Doca de São Francisco, Portimão","🕐 Duración aproximada: 1 h 30 min","🌊 Cuevas y costa del Algarve"]},
  {id:"d4", label:"Lun 12", title:"🚗 Día 4 · Regreso a Madrid", text:"Último desayuno, recoger el Airbnb y vuelta en coche a Madrid.", bullets:["☕ Desayuno","🧳 Check-out","🚗 Regreso a Madrid","❤️ Fin del viaje"]},
];

let state = loadLocal();
let db = null;
let unsubscribe = null;

function loadLocal(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    return {group:raw.group||[], individual:raw.individual||[], preparativos:raw.preparativos||""};
  }catch{return {group:[],individual:[],preparativos:""}}
}
function saveLocal(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

const money = n => `${Number(n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function setupTabs(){
  document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
    btn.classList.add("active"); document.getElementById(btn.dataset.tab).classList.add("active");
  });
}

function renderDays(){
  const buttons=document.getElementById("dayButtons"), content=document.getElementById("dayContent");
  buttons.innerHTML=days.map((d,i)=>`<button class="${i===0?"active":""}" data-day="${d.id}">${d.label}</button>`).join("");
  const show=id=>{
    const d=days.find(x=>x.id===id)||days[0];
    buttons.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.day===d.id));
    content.innerHTML=`<div class="day-card"><span class="tag">${d.label}</span><h3>${d.title}</h3><p>${esc(d.text)}</p><ul>${d.bullets.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`;
  };
  buttons.querySelectorAll("button").forEach(b=>b.onclick=()=>show(b.dataset.day));
  show(days[0].id);
}

function renderSelects(){
  ["groupPayer","individualPerson"].forEach(id=>{
    document.getElementById(id).innerHTML=PEOPLE.map(p=>`<option>${p}</option>`).join("");
  });
}

function renderExpenses(){
  const totals=Object.fromEntries(PEOPLE.map(p=>[p,0]));
  state.individual.forEach(x=>totals[x.person]+=Number(x.amount||0));
  state.group.forEach(x=>totals[x.payer]+=Number(x.amount||0));

  document.getElementById("individualSummary").innerHTML=PEOPLE.map(p=>`
    <div class="person-card">
      <div>${p}</div>
      <strong>${money(totals[p])}</strong>
      <div class="muted">Gastos personales: ${money(state.individual.filter(x=>x.person===p).reduce((a,x)=>a+Number(x.amount||0),0))}</div>
      <div class="muted">Pagado en grupales: ${money(state.group.filter(x=>x.payer===p).reduce((a,x)=>a+Number(x.amount||0),0))}</div>
      <div class="person-total">Total pagado: ${money(totals[p])}</div>
    </div>`).join("");

  const groupTotal=state.group.reduce((a,x)=>a+Number(x.amount||0),0);
  document.getElementById("groupTotal").textContent=money(groupTotal);
  document.getElementById("groupPerPerson").textContent=money(groupTotal/PEOPLE.length);

  document.getElementById("groupExpenseList").innerHTML = state.group.length
    ? state.group.map(x=>`<div class="expense-row"><div><strong>${esc(x.concept)}</strong><div class="muted">${esc(x.payer)} · ${money(x.amount)}</div></div><button class="delete" data-type="group" data-id="${x.id}">Eliminar</button></div>`).join("")
    : `<p class="muted">Todavía no hay gastos grupales.</p>`;

  document.getElementById("individualExpenseList").innerHTML = state.individual.length
    ? state.individual.map(x=>`<div class="expense-row"><div><strong>${esc(x.concept)}</strong><div class="muted">${esc(x.person)} · ${money(x.amount)}</div></div><button class="delete" data-type="individual" data-id="${x.id}">Eliminar</button></div>`).join("")
    : `<p class="muted">Todavía no hay gastos individuales.</p>`;

  document.querySelectorAll(".delete").forEach(btn=>btn.onclick=()=>removeExpense(btn.dataset.type,btn.dataset.id));

  const equalShare=groupTotal/PEOPLE.length;
  document.getElementById("settlement").innerHTML=PEOPLE.map(p=>{
    const paid=state.group.filter(x=>x.payer===p).reduce((a,x)=>a+Number(x.amount||0),0);
    const balance=paid-equalShare;
    return `<div class="balance-row"><strong>${p}</strong><span class="${balance>=0?"positive":"negative"}">${balance>=0?"+":"−"}${money(Math.abs(balance))}</span></div>`;
  }).join("");
}

async function addExpense(type, item){
  item.id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  if(type==="group") state.group.push(item); else state.individual.push(item);
  saveLocal(); renderExpenses();
  if(db){
    try{
      await addDoc(collection(db,"expenses"),{...item,type,createdAt:serverTimestamp()});
    }catch(e){console.error(e)}
  }
}

async function removeExpense(type,id){
  state[type]=state[type].filter(x=>x.id!==id);
  saveLocal(); renderExpenses();
  // In the first prototype deletions are local until Firebase is connected.
}

document.getElementById("addGroupExpense").onclick=async()=>{
  const concept=document.getElementById("groupConcept").value.trim();
  const payer=document.getElementById("groupPayer").value;
  const amount=Number(document.getElementById("groupAmount").value);
  if(!concept||!amount||amount<=0)return alert("Falta el concepto o el importe.");
  await addExpense("group",{concept,payer,amount});
  document.getElementById("groupConcept").value="";
  document.getElementById("groupAmount").value="";
};
document.getElementById("addIndividualExpense").onclick=async()=>{
  const person=document.getElementById("individualPerson").value;
  const concept=document.getElementById("individualConcept").value.trim();
  const amount=Number(document.getElementById("individualAmount").value);
  if(!concept||!amount||amount<=0)return alert("Falta el concepto o el importe.");
  await addExpense("individual",{person,concept,amount});
  document.getElementById("individualConcept").value="";
  document.getElementById("individualAmount").value="";
};

document.getElementById("preparativosArea").value=state.preparativos;
document.getElementById("preparativosArea").addEventListener("input",e=>{state.preparativos=e.target.value;saveLocal()});

function countdown(){
  const target=new Date("2026-10-09T08:00:00+02:00").getTime();
  const diff=target-Date.now();
  const el=document.getElementById("countdown");
  if(diff<=0){el.textContent="¡Ya estamos en el Algarve!";return}
  const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000);
  el.textContent=`Faltan ${d} días y ${h} h`;
}

async function initFirebase(){
  const status=document.getElementById("syncStatus");
  if(!FIREBASE_CONFIG){status.textContent="Modo local · Firebase se conectará al crear el proyecto ALGARVE";return}
  try{
    const app=initializeApp(FIREBASE_CONFIG);
    db=getFirestore(app);
    status.textContent="🟢 Sincronización Firebase activa";
    const q=query(collection(db,"expenses"),orderBy("createdAt","asc"));
    unsubscribe=onSnapshot(q,snap=>{
      const group=[], individual=[];
      snap.forEach(d=>{const x={id:d.id,...d.data()};(x.type==="group"?group:individual).push(x)});
      state.group=group; state.individual=individual; saveLocal(); renderExpenses();
    });
  }catch(e){console.error(e);status.textContent="Modo local · no se ha podido conectar con Firebase"}
}

setupTabs(); renderDays(); renderSelects(); renderExpenses(); countdown(); setInterval(countdown,60000); initFirebase();
