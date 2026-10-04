import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyApTllgL_8Gazh0rWB8m3NYqHzlwxnLPow",
  authDomain: "algarve-70138.firebaseapp.com",
  projectId: "algarve-70138",
  storageBucket: "algarve-70138.firebasestorage.app",
  messagingSenderId: "970057765652",
  appId: "1:970057765652:web:a963c6955ec1d728a1a801"
};

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
let auth = null;
let currentUser = null;
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

function showApp(user){
  currentUser = user;
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("loggedUser").textContent = user.email;
}
function showLogin(message=""){
  currentUser = null;
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("loginError").textContent = message;
}
async function login(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const button = document.getElementById("loginButton");
  if(!email || !password){
    document.getElementById("loginError").textContent = "Introduce el correo y la contraseña.";
    return;
  }
  button.disabled = true;
  button.textContent = "Entrando…";
  try{
    await signInWithEmailAndPassword(auth,email,password);
  }catch(e){
    console.error("ERROR FIREBASE LOGIN:", e);

    const mensajes = {
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
      "auth/user-not-found": "El usuario no existe en Firebase.",
      "auth/wrong-password": "La contraseña es incorrecta.",
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
      "auth/network-request-failed": "Error de conexión con Firebase.",
      "auth/api-key-not-valid": "La clave de Firebase no es válida.",
      "auth/operation-not-allowed": "El acceso por correo y contraseña no está habilitado en Firebase."
    };

    document.getElementById("loginError").textContent =
      mensajes[e.code] || `Error Firebase: ${e.code || "desconocido"}`;
  }finally{
    button.disabled = false;
    button.textContent = "Entrar";
  }
}

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
  if(!currentUser) return;
  const payload={...item,type,createdAt:serverTimestamp(),createdBy:currentUser.email};
  try{
    await addDoc(collection(db,"expenses"),payload);
  }catch(e){
    console.error(e);
    alert("No se ha podido guardar el gasto en Firebase.");
  }
}

async function removeExpense(type,id){
  if(!currentUser || !id) return;
  try{
    await deleteDoc(doc(db,"expenses",id));
  }catch(e){
    console.error(e);
    alert("No se ha podido eliminar el gasto.");
  }
}

document.getElementById("loginButton").onclick=login;
document.getElementById("loginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
document.getElementById("logoutButton").onclick=()=>signOut(auth);

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
  try{
    const app=initializeApp(FIREBASE_CONFIG);
    db=getFirestore(app);
    auth=getAuth(app);

    onAuthStateChanged(auth,user=>{
      if(!user){
        if(unsubscribe){unsubscribe();unsubscribe=null}
        showLogin();
        return;
      }
      showApp(user);
      status.textContent="🟢 Sincronización Firebase activa";
      const q=query(collection(db,"expenses"),orderBy("createdAt","asc"));
      if(unsubscribe) unsubscribe();
      unsubscribe=onSnapshot(q,snap=>{
        const group=[], individual=[];
        snap.forEach(d=>{
          const x={id:d.id,...d.data()};
          (x.type==="group"?group:individual).push(x);
        });
        state.group=group;
        state.individual=individual;
        saveLocal();
        renderExpenses();
      },err=>{
        console.error(err);
        status.textContent="🔴 Error al sincronizar gastos";
      });
    });
  }catch(e){
    console.error(e);
    status.textContent="🔴 No se ha podido conectar con Firebase";
    showLogin("No se ha podido conectar con Firebase.");
  }
}

setupTabs();
renderDays();
renderSelects();
renderExpenses();
countdown();
setInterval(countdown,60000);
initFirebase();
