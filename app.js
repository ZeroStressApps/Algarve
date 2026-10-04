import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, where,
  serverTimestamp, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential
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
let unsubscribePreparativos = null;
let prepSaveTimer = null;

function loadLocal(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    return {group:raw.group||[], individual:raw.individual||[], preparativos:raw.preparativos||""};
  }catch{return {group:[],individual:[],preparativos:""}}
}
function saveLocal(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

const money = n => `${Number(n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

const DEFAULT_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="60" fill="#e7f4f3"/>
    <circle cx="60" cy="46" r="22" fill="#2aa9a1"/>
    <path d="M22 108c5-25 21-38 38-38s33 13 38 38" fill="#2aa9a1"/>
  </svg>`
);

const profileCache = {};

function personForEmail(email){
  const map = {
    "yanet.martinez0908@gmail.com":"Yanet",
    "carosanchezf2@gmail.com":"Carol",
    "ggagomunoz@gmail.com":"Graciela"
  };
  return map[String(email||"").toLowerCase()] || String(email||"").split("@")[0];
}

async function loadMyProfile(){
  if(!db || !currentUser) return;
  try{
    const snap = await getDoc(doc(db,"profiles",currentUser.uid));
    const data = snap.exists() ? snap.data() : {};
    profileCache[currentUser.uid] = {
      photo:data.photo || "",
      email:currentUser.email
    };
    refreshProfileUI();
  }catch(e){
    console.error("ERROR CARGANDO PERFIL:",e);
  }
}

async function saveMyProfilePhoto(photo){
  if(!db || !currentUser) return;
  await setDoc(doc(db,"profiles",currentUser.uid),{
    photo,
    email:currentUser.email,
    updatedAt:serverTimestamp()
  },{merge:true});
  profileCache[currentUser.uid] = {photo,email:currentUser.email};
}

function getProfilePhoto(uid){
  return profileCache[uid]?.photo || DEFAULT_PHOTO;
}

function ensureProfileUI(){
  const shell = document.getElementById("appShell");
  if(!shell || document.getElementById("profilePanel")) return;

  const panel = document.createElement("div");
  panel.id = "profilePanel";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0 18px;padding:12px;border:1px solid #d9ecea;border-radius:14px;background:#fff;">
      <img id="profilePhoto" src="${DEFAULT_PHOTO}" alt="Foto de perfil"
           style="width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid #2aa9a1;">
      <div style="flex:1;min-width:180px;">
        <strong id="profileName"></strong>
        <div class="muted" id="profileEmail"></div>
      </div>
      <label for="profilePhotoInput" style="cursor:pointer;padding:9px 12px;border-radius:10px;background:#2aa9a1;color:#fff;font-weight:700;">
        Cambiar foto
      </label>
      <input id="profilePhotoInput" type="file" accept="image/*" hidden>
      <button id="changePasswordButton" type="button"
              style="padding:9px 12px;border-radius:10px;border:1px solid #2aa9a1;background:#fff;color:#167c76;font-weight:700;">
        Cambiar contraseña
      </button>
    </div>
  `;
  shell.prepend(panel);

  document.getElementById("profilePhotoInput").addEventListener("change",handlePhotoChange);
  document.getElementById("changePasswordButton").addEventListener("click",changeMyPassword);
}

function refreshProfileUI(){
  if(!currentUser) return;
  ensureProfileUI();

  const img = document.getElementById("profilePhoto");
  const name = document.getElementById("profileName");
  const email = document.getElementById("profileEmail");

  if(img) img.src = getProfilePhoto(currentUser.uid);
  if(name) name.textContent = personForEmail(currentUser.email);
  if(email) email.textContent = currentUser.email;
}

async function handlePhotoChange(e){
  const file = e.target.files?.[0];
  if(!file || !currentUser) return;

  if(!file.type.startsWith("image/")){
    alert("Selecciona una imagen.");
    e.target.value = "";
    return;
  }

  if(file.size > 1500000){
    alert("La foto es demasiado grande. Elige una imagen de menos de 1,5 MB.");
    e.target.value = "";
    return;
  }

  try{
    const photo = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    await saveMyProfilePhoto(photo);
    refreshProfileUI();
    renderExpenses();
    alert("Foto de perfil actualizada.");
  }catch(err){
    console.error("ERROR GUARDANDO FOTO:",err);
    alert("No se ha podido guardar la foto.");
  }finally{
    e.target.value = "";
  }
}

async function changeMyPassword(){
  if(!currentUser) return;

  const currentPassword = prompt("Escribe tu contraseña actual:");
  if(currentPassword === null) return;

  const newPassword = prompt("Escribe la nueva contraseña (mínimo 6 caracteres):");
  if(newPassword === null) return;

  if(newPassword.length < 6){
    alert("La nueva contraseña debe tener al menos 6 caracteres.");
    return;
  }

  try{
    const credential = EmailAuthProvider.credential(currentUser.email,currentPassword);
    await reauthenticateWithCredential(currentUser,credential);
    await updatePassword(currentUser,newPassword);
    alert("Contraseña cambiada correctamente.");
  }catch(e){
    console.error("ERROR CAMBIANDO CONTRASEÑA:",e);
    const mensajes = {
      "auth/invalid-credential":"La contraseña actual no es correcta.",
      "auth/wrong-password":"La contraseña actual no es correcta.",
      "auth/weak-password":"La nueva contraseña es demasiado débil.",
      "auth/requires-recent-login":"Por seguridad, vuelve a iniciar sesión y después cambia la contraseña."
    };
    alert(mensajes[e.code] || `No se ha podido cambiar la contraseña: ${e.code || "error desconocido"}`);
  }
}

function ensurePasswordVisibilityUI(){
  const input = document.getElementById("loginPassword");
  if(!input || document.getElementById("toggleLoginPassword")) return;

  const button = document.createElement("button");
  button.id = "toggleLoginPassword";
  button.type = "button";
  button.textContent = "👁️";
  button.title = "Mostrar contraseña";
  button.setAttribute("aria-label","Mostrar u ocultar contraseña");
  button.style.cssText = "position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;font-size:18px;padding:4px;";

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:relative;";
  input.parentNode.insertBefore(wrapper,input);
  wrapper.appendChild(input);
  wrapper.appendChild(button);

  button.onclick = ()=>{
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "👁️" : "🙈";
    button.title = visible ? "Mostrar contraseña" : "Ocultar contraseña";
  };
}


function showApp(user){
  currentUser = user;
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("loggedUser").textContent = user.email;
  setMyIndividualPerson();
  ensureProfileUI();
  loadMyProfile();
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
  document.getElementById("groupPayer").innerHTML=PEOPLE.map(p=>`<option>${p}</option>`).join("");
  document.getElementById("individualPerson").innerHTML=PEOPLE.map(p=>`<option>${p}</option>`).join("");
}

function setMyIndividualPerson(){
  const select=document.getElementById("individualPerson");
  if(!select || !currentUser) return;
  const me=personForEmail(currentUser.email);
  select.value=me;
  select.disabled=true;
}

function renderExpenses(){
  // Los gastos individuales son PRIVADOS: cada usuaria solo ve los suyos.
  // Los gastos grupales sí son visibles para todas.
  const myEmail = String(currentUser?.email || "").toLowerCase();
  const myPerson = personForEmail(myEmail);
  const myIndividual = state.individual.filter(x =>
    String(x.createdBy || "").toLowerCase() === myEmail
  );

  const totals=Object.fromEntries(PEOPLE.map(p=>[p,0]));
  state.group.forEach(x=>totals[x.payer]+=Number(x.amount||0));
  myIndividual.forEach(x=>totals[myPerson]+=Number(x.amount||0));

  const myPersonalTotal = myIndividual.reduce((a,x)=>a+Number(x.amount||0),0);
  const myGroupPaid = state.group.filter(x=>x.payer===myPerson)
    .reduce((a,x)=>a+Number(x.amount||0),0);
  const myTotal = myPersonalTotal + myGroupPaid;

  document.getElementById("individualSummary").innerHTML = currentUser
    ? `
      <div class="person-card">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${getProfilePhoto(currentUser.uid)}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
          <span>${esc(myPerson)}</span>
        </div>
        <strong>${money(myTotal)}</strong>
        <div class="muted">Mis gastos personales: ${money(myPersonalTotal)}</div>
        <div class="muted">Pagado por mí en grupales: ${money(myGroupPaid)}</div>
        <div class="person-total">Total pagado por mí: ${money(myTotal)}</div>
      </div>`
    : `<p class="muted">Inicia sesión para ver tus gastos.</p>`;

  const groupTotal=state.group.reduce((a,x)=>a+Number(x.amount||0),0);
  document.getElementById("groupTotal").textContent=money(groupTotal);
  document.getElementById("groupPerPerson").textContent=money(groupTotal/PEOPLE.length);

  document.getElementById("groupExpenseList").innerHTML = state.group.length
    ? state.group.map(x=>`
      <div class="expense-row">
        <div>
          <strong>${esc(x.concept)}</strong>
          <div class="muted">${esc(x.payer)} · ${money(x.amount)}</div>
        </div>
        ${x.createdBy===currentUser?.email
          ? `<button class="delete" data-type="group" data-id="${x.id}">Eliminar</button>`
          : ""}
      </div>`).join("")
    : `<p class="muted">Todavía no hay gastos grupales.</p>`;

  document.getElementById("individualExpenseList").innerHTML = myIndividual.length
    ? myIndividual.map(x=>`
      <div class="expense-row">
        <div>
          <strong>${esc(x.concept)}</strong>
          <div class="muted">${money(x.amount)}</div>
        </div>
        <button class="delete" data-type="individual" data-id="${x.id}">Eliminar</button>
      </div>`).join("")
    : `<p class="muted">Todavía no tienes gastos individuales.</p>`;

  document.querySelectorAll(".delete").forEach(btn=>
    btn.onclick=()=>removeExpense(btn.dataset.type,btn.dataset.id)
  );

  const equalShare=groupTotal/PEOPLE.length;

  const balances=Object.fromEntries(PEOPLE.map(p=>{
    const paid=state.group.filter(x=>x.payer===p).reduce((a,x)=>a+Number(x.amount||0),0);
    return [p, paid-equalShare];
  }));

  const balanceRows=PEOPLE.map(p=>{
    const balance=balances[p];
    return `<div class="balance-row">
      <strong>${p}</strong>
      <span class="${balance>=0?"positive":"negative"}">
        ${balance>=0?"+":"−"}${money(Math.abs(balance))}
      </span>
    </div>`;
  }).join("");

  // Calcula quién tiene que pagar a quién para saldar los gastos grupales.
  // Se intenta hacer con el menor número de transferencias posible.
  const creditors=PEOPLE
    .map(p=>({person:p,amount:Math.max(0,balances[p])}))
    .filter(x=>x.amount>0.005)
    .sort((a,b)=>b.amount-a.amount);
  const debtors=PEOPLE
    .map(p=>({person:p,amount:Math.max(0,-balances[p])}))
    .filter(x=>x.amount>0.005)
    .sort((a,b)=>b.amount-a.amount);

  const transfers=[];
  let ci=0, di=0;
  while(ci<creditors.length && di<debtors.length){
    const amount=Math.min(creditors[ci].amount,debtors[di].amount);
    if(amount>0.005){
      transfers.push(`<div class="balance-row">
        <strong>${esc(debtors[di].person)}</strong>
        <span>debe <strong>${money(amount)}</strong> a <strong>${esc(creditors[ci].person)}</strong></span>
      </div>`);
    }
    creditors[ci].amount-=amount;
    debtors[di].amount-=amount;
    if(creditors[ci].amount<=0.005) ci++;
    if(debtors[di].amount<=0.005) di++;
  }

  const transfersHtml=transfers.length
    ? `<div style="margin-top:14px;"><strong>Quién debe a quién</strong>${transfers.join("")}</div>`
    : `<div class="muted" style="margin-top:14px;">No hay pagos pendientes. Estáis a mano.</div>`;

  document.getElementById("settlement").innerHTML=balanceRows+transfersHtml;
}

async function addExpense(type, item){
  if(!currentUser) return;
  const payload={...item,type,createdAt:serverTimestamp(),createdBy:currentUser.email};
  if(type === "individual") payload.person = personForEmail(currentUser.email);
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

async function loadMyPreparativos(){
  const area=document.getElementById("preparativosArea");
  if(!area || !db || !currentUser) return;

  if(unsubscribePreparativos){
    unsubscribePreparativos();
    unsubscribePreparativos=null;
  }

  try{
    const ref=doc(db,"preparativos",currentUser.uid);
    unsubscribePreparativos=onSnapshot(ref,snap=>{
      const text=snap.exists() ? String(snap.data().text || "") : "";
      area.value=text;
      state.preparativos=text;
      saveLocal();
    },err=>{
      console.error("ERROR SINCRONIZANDO PREPARATIVOS:",err);
    });
  }catch(e){
    console.error("ERROR CARGANDO PREPARATIVOS:",e);
  }
}

function setupPreparativos(){
  const area=document.getElementById("preparativosArea");
  if(!area || area.dataset.ready) return;
  area.dataset.ready="1";
  area.addEventListener("input",e=>{
    state.preparativos=e.target.value;
    saveLocal();
    clearTimeout(prepSaveTimer);
    prepSaveTimer=setTimeout(async()=>{
      if(!db || !currentUser) return;
      try{
        await setDoc(doc(db,"preparativos",currentUser.uid),{
          text:e.target.value,
          updatedAt:serverTimestamp(),
          updatedBy:currentUser.email
        },{merge:true});
      }catch(err){
        console.error("ERROR GUARDANDO PREPARATIVOS:",err);
        alert("No se han podido guardar tus preparativos.");
      }
    },500);
  });
}

setupPreparativos();

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

    onAuthStateChanged(auth,async user=>{
      if(!user){
        if(unsubscribe){unsubscribe();unsubscribe=null}
        if(unsubscribePreparativos){unsubscribePreparativos();unsubscribePreparativos=null}
        state.group=[];
        state.individual=[];
        state.preparativos="";
        const prepArea=document.getElementById("preparativosArea");
        if(prepArea) prepArea.value="";
        renderExpenses();
        showLogin();
        return;
      }
      // Nunca reutilizar en pantalla los gastos individuales del usuario anterior.
      state.individual=[];
      state.preparativos="";
      const prepArea=document.getElementById("preparativosArea");
      if(prepArea) prepArea.value="";
      showApp(user);
      renderExpenses();
      await loadMyPreparativos();
      status.textContent="🟢 Sincronización Firebase activa";
      if(unsubscribe) unsubscribe();

      // Dos consultas separadas para que Firestore nunca entregue a una usuaria
      // los gastos individuales de las demás.
      const qGroup=query(collection(db,"expenses"),where("type","==","group"));
      const qIndividual=query(
        collection(db,"expenses"),
        where("type","==","individual"),
        where("createdBy","==",user.email)
      );

      let groupReady=false, individualReady=false;
      let stopGroup=null, stopIndividual=null;
      const refresh=()=>{
        if(!groupReady || !individualReady) return;
        state.group.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        state.individual.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        saveLocal();
        renderExpenses();
      };

      stopGroup=onSnapshot(qGroup,snap=>{
        state.group=snap.docs.map(d=>({id:d.id,...d.data()}));
        groupReady=true;
        refresh();
      },err=>{
        console.error(err);
        status.textContent="🔴 Error al sincronizar gastos grupales";
      });

      stopIndividual=onSnapshot(qIndividual,snap=>{
        state.individual=snap.docs.map(d=>({id:d.id,...d.data()}));
        individualReady=true;
        refresh();
      },err=>{
        console.error(err);
        status.textContent="🔴 Error al sincronizar tus gastos individuales";
      });

      unsubscribe=()=>{
        if(stopGroup) stopGroup();
        if(stopIndividual) stopIndividual();
      };
    });
  }catch(e){
    console.error(e);
    status.textContent="🔴 No se ha podido conectar con Firebase";
    showLogin("No se ha podido conectar con Firebase.");
  }
}

ensurePasswordVisibilityUI();
setupTabs();
renderDays();
renderSelects();
renderExpenses();
countdown();
setInterval(countdown,60000);
initFirebase();
