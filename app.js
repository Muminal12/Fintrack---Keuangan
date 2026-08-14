const USERS_KEY="fintrack_users_v2",SESSION_KEY="fintrack_session_v2",KEY_PREFIX="fintrack_user_v2_";
const defaultUserData=()=>({budget:0,theme:"light",wallets:[{id:"cash",name:"Cash",balance:0}],transactions:[],goals:[]});
const getUsers=()=>JSON.parse(localStorage.getItem(USERS_KEY)||"[]");
let currentUser=null,db=null;
function loadSession(){const u=getUsers().find(x=>x.username===localStorage.getItem(SESSION_KEY));if(!u){return false}currentUser=u;db=JSON.parse(localStorage.getItem(KEY_PREFIX+u.username)||"null")||defaultUserData();return true}
function save(){
  if(!currentUser||!db) return false;
  localStorage.setItem(KEY_PREFIX+currentUser.username,JSON.stringify(db));
  return true;
}
loadSession();
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const today=()=>new Date().toISOString().slice(0,10);

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const icons={Tabungan:"🏦",Makanan:"🍜",Transportasi:"🚗",Belanja:"🛍️",Tagihan:"🧾",Pendidikan:"📚",Kesehatan:"💊",Hiburan:"🎮",Sedekah:"🤲",Rumah:"🏠",Cicilan:"💳",Gaji:"💼",Bonus:"🎁",Bisnis:"📦",Freelance:"💻",Lainnya:"💰"};
const expenseCats=["Tabungan","Makanan","Transportasi","Belanja","Tagihan","Pendidikan","Kesehatan","Hiburan","Sedekah","Rumah","Cicilan","Lainnya"];
const incomeCats=["Gaji","Bonus","Bisnis","Freelance","Lainnya"];

function monthTx(){const p=today().slice(0,7);return db.transactions.filter(t=>t.date.startsWith(p))}
function totals(){let ins=0,outs=0;db.transactions.forEach(t=>t.type==="income"?ins+=t.amount:outs+=t.amount);return{ins,outs,balance:ins-outs}}
function render(){if(!currentUser||!db)return;
 document.body.classList.toggle("dark",db.theme==="dark");
 $("#greeting").textContent=`Halo, ${currentUser.name||"Teman"} 👋`;
 const {ins,outs,balance}=totals(), mt=monthTx(), mi=mt.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0), me=mt.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
 $("#totalBalance").textContent=money(balance);$("#incomeTotal").textContent=money(ins);$("#expenseTotal").textContent=money(outs);
 $("#dashIncome").textContent=money(mi);$("#dashExpense").textContent=money(me);
 const gp=db.goals.reduce((a,g)=>a+(g.amount?Math.min(100,g.saved/g.amount*100):0),0)/(db.goals.length||1);
 $("#goalProgress").textContent=Math.round(gp)+"%";
 $("#budgetProgress").textContent=Math.min(999,Math.round((me/(db.budget||1))*100))+"%";
 const budget=Math.max(0,db.budget||0),remain=Math.max(0,budget-me),budgetPct=budget?Math.min(100,me/budget*100):0;
 $("#budgetAmountLabel").textContent=money(budget);$("#budgetPercentLabel").textContent=Math.round(budgetPct)+"%";$("#budgetSpentLabel").textContent="Terpakai "+money(me);$("#budgetRemainLabel").textContent="Sisa "+money(remain);$("#budgetBar").style.width=budgetPct+"%";
 renderCategoryChart(mt); renderTransactions(); renderAnalytics(mt); renderGoals(); fillWallets();
}
function renderCategoryChart(mt){
 const map={};mt.filter(t=>t.type==="expense").forEach(t=>map[t.category]=(map[t.category]||0)+t.amount);
 const arr=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,7), max=Math.max(...arr.map(x=>x[1]),1);
 $("#categoryChart").innerHTML=arr.length?arr.map(([k,v])=>`<div class="bar" title="${esc(k)}: ${money(v)}" style="height:${Math.max(8,v/max*100)}%"></div>`).join(""):"<div style='color:var(--muted);font-size:13px'>Belum ada pengeluaran bulan ini.</div>";
 $("#categoryLegend").innerHTML=arr.map(([k,v])=>`<span>${icons[k]||"💰"} ${esc(k)} · ${money(v)}</span>`).join("");
}
function txHTML(t){
 return `<div class="transaction"><div class="tx-icon">${icons[t.category]||"💰"}</div><div class="tx-main"><b>${esc(t.note||t.category)}</b><small>${esc(t.category)} · ${t.date} · ${esc(t.wallet||"Cash")}</small></div><div class="tx-amount ${t.type}">${t.type==="income"?"+":"-"}${money(t.amount)}</div></div>`;
}
function renderTransactions(){
 const q=($("#searchInput")?.value||"").toLowerCase(), type=$("#typeFilter")?.value||"all";
 let arr=[...db.transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created).filter(t=>(type==="all"||t.type===type)&&(`${t.note} ${t.category} ${t.wallet}`).toLowerCase().includes(q));
 $("#allTransactions").innerHTML=arr.length?arr.map(txHTML).join(""):"<div class='card' style='text-align:center;color:var(--muted)'>Belum ada transaksi.</div>";
 $("#recentTransactions").innerHTML=[...db.transactions].sort((a,b)=>b.created-a.created).slice(0,5).map(txHTML).join("")||"<div class='card' style='color:var(--muted)'>Belum ada transaksi. Yuk catat transaksi pertama.</div>";
}
function renderAnalytics(mt){
 const expenses=mt.filter(t=>t.type==="expense"), total=expenses.reduce((a,t)=>a+t.amount,0), days=new Date().getDate();
 $("#analyticsExpense").textContent=money(total);$("#dailyAverage").textContent=money(total/Math.max(days,1));
 const map={};expenses.forEach(t=>map[t.category]=(map[t.category]||0)+t.amount);const arr=Object.entries(map).sort((a,b)=>b[1]-a[1]), max=Math.max(...arr.map(x=>x[1]),1);
 $("#analyticsCategories").innerHTML=arr.length?arr.map(([k,v])=>`<div class="cat-row"><span>${icons[k]||"💰"} ${esc(k)}</span><div class="track"><div class="fill" style="width:${v/max*100}%"></div></div><b>${money(v)}</b></div>`).join(""):"<div class='card' style='color:var(--muted)'>Belum ada data.</div>";
 let text=total>db.budget?`⚠️ Pengeluaran bulan ini sudah ${Math.round(total/db.budget*100)}% dari budget.`:`✨ Pengeluaran bulan ini masih ${Math.max(0,Math.round((1-total/(db.budget||1))*100))}% dari budget tersisa.`;
 if(arr[0]) text+=` Kategori terbesar adalah <b>${esc(arr[0][0])}</b> sebesar ${money(arr[0][1])}.`;
 $("#insight").innerHTML=text;
}
function renderGoals(){const list=$("#goalsList");if(!db.goals.length){list.innerHTML="<div class='card empty-state'>🎯 Belum ada target.<br><br>Buat target seperti <b>Dana Darurat</b>, <b>Umroh</b>, <b>Laptop</b>, atau <b>Liburan</b>. Setelah dibuat, tekan <b>Tambah tabungan</b> setiap kali menabung.</div>";return}list.innerHTML=db.goals.map(g=>{const p=Math.min(100,g.saved/g.amount*100),r=Math.max(0,g.amount-g.saved),done=p>=100;let m="";if(g.date&&!done){const n=new Date(),t=new Date(g.date+"T00:00:00"),months=Math.max(1,(t.getFullYear()-n.getFullYear())*12+t.getMonth()-n.getMonth()+1);m=` · perlu ${money(r/months)}/bulan`}return `<div class="goal"><div class="goal-head"><b>🎯 ${esc(g.name)}</b><b>${Math.round(p)}%</b></div><div class="progress"><div style="width:${p}%"></div></div><div class="goal-meta"><span>${money(g.saved)} terkumpul</span><span>Target ${money(g.amount)}</span></div><div class="goal-remaining ${done?"goal-complete":""}">${done?"🎉 Target tercapai!":"Kurang "+money(r)+m}</div><div class="goal-actions">${done?"":"<button class='save-goal-btn' data-save-goal='"+g.id+"'>＋ Tambah tabungan</button>"}<button class='goal-delete' data-delete-goal='"+g.id+"'>Hapus</button></div></div>`}).join("");$$("[data-save-goal]").forEach(b=>b.onclick=()=>openSavingModal(b.dataset.saveGoal));$$("[data-delete-goal]").forEach(b=>b.onclick=()=>deleteGoal(b.dataset.deleteGoal))}
function openSavingModal(id){const g=db.goals.find(x=>x.id===id);if(!g)return;$("#savingGoalId").value=id;$("#savingGoalName").value=g.name;$("#savingAmount").value="";$("#savingNote").value="";openModal("#saveGoalModal")}
function deleteGoal(id){const g=db.goals.find(x=>x.id===id);if(g&&confirm(`Hapus target "${g.name}"?`)){db.goals=db.goals.filter(x=>x.id!==id);save();render();toast("Target dihapus")}}
function fillWallets(){ $("#wallet").innerHTML=db.wallets.map(w=>`<option value="${esc(w.name)}">${esc(w.name)}</option>`).join("") }
function openModal(id){$(id).classList.remove("hidden")}
function closeModals(){$$(".modal").forEach(x=>x.classList.add("hidden"))}
function toast(s){const t=$("#toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}
function showAuth(mode="login"){$("#authPage").classList.remove("hidden");$("#app").querySelector("main").classList.add("hidden");$(".topbar").classList.add("hidden");$(".bottom-nav").classList.add("hidden");$("#fab").classList.add("hidden");$$(".auth-tab").forEach(t=>t.classList.toggle("active",t.dataset.auth===mode));$("#loginForm").classList.toggle("hidden",mode!=="login");$("#registerForm").classList.toggle("hidden",mode!=="register")}
function showApp(){$("#authPage").classList.add("hidden");$("#app").querySelector("main").classList.remove("hidden");$(".topbar").classList.remove("hidden");$(".bottom-nav").classList.remove("hidden");$("#fab").classList.remove("hidden");render()}
function setupAuthExtras(){
 $$('[data-auth-jump]').forEach(b=>b.onclick=()=>showAuth(b.dataset.authJump));
 $$('[data-toggle-password]').forEach(b=>b.onclick=()=>{const input=$("#"+b.dataset.togglePassword);input.type=input.type==="password"?"text":"password";b.textContent=input.type==="password"?"◉":"◌"});
 const forgot=$("#forgotBtn"); if(forgot) forgot.onclick=()=>toast("Reset password online akan tersedia saat FinTrack memakai database/server.");
}
function authSetup(){setupAuthExtras();$$(".auth-tab").forEach(b=>b.onclick=()=>showAuth(b.dataset.auth));$("#loginForm").onsubmit=e=>{e.preventDefault();const u=$("#loginUsername").value.trim().toLowerCase(),p=$("#loginPassword").value,x=getUsers().find(x=>x.username===u);if(!x||x.password!==btoa(unescape(encodeURIComponent(p))))return toast("Username atau password salah");localStorage.setItem(SESSION_KEY,u);loadSession();showApp();toast("Selamat datang kembali 👋")};$("#registerForm").onsubmit=e=>{e.preventDefault();const name=$("#registerName").value.trim(),u=$("#registerUsername").value.trim().toLowerCase(),p=$("#registerPassword").value,p2=$("#registerPassword2").value;if(!/^[a-z0-9._-]{3,}$/.test(u))return toast("Username minimal 3 karakter");if(p.length<6)return toast("Password minimal 6 karakter");if(p!==p2)return toast("Password belum sama");const users=getUsers();if(users.some(x=>x.username===u))return toast("Username sudah digunakan");users.push({username:u,name,password:btoa(unescape(encodeURIComponent(p))),created:Date.now()});localStorage.setItem(USERS_KEY,JSON.stringify(users));localStorage.setItem(KEY_PREFIX+u,JSON.stringify(defaultUserData()));localStorage.removeItem(SESSION_KEY);currentUser=null;db=null;$("#loginUsername").value=u;$("#loginPassword").value="";showAuth("login");toast("Akun berhasil dibuat. Silakan login 🔐")}}

function downloadPDF(){
  if(!window.jspdf||!window.jspdf.jsPDF){toast("Library PDF belum termuat. Coba lagi sebentar.");return}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const W=210, M=15;
  const now=new Date();
  const monthName=now.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  const tx=db.transactions||[];
  const monthKey=t=>String(t.date||"").slice(0,7);
  const currentKey=today().slice(0,7);
  const current=tx.filter(t=>monthKey(t)===currentKey);
  const income=current.filter(t=>t.type==="income").reduce((a,t)=>a+Number(t.amount||0),0);
  const expense=current.filter(t=>t.type==="expense").reduce((a,t)=>a+Number(t.amount||0),0);
  const saving=current.filter(t=>t.type==="expense"&&t.category==="Tabungan").reduce((a,t)=>a+Number(t.amount||0),0);
  const net=income-expense;
  const categories={};
  current.filter(t=>t.type==="expense").forEach(t=>{categories[t.category]=(categories[t.category]||0)+Number(t.amount||0)});
  const topCats=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const pct=(v,total)=>total?Math.round(v/total*100):0;
  const moneyPDF=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const line=(y)=>{doc.setDrawColor(220,224,232);doc.line(M,y,W-M,y)};
  const header=()=>{
    doc.setFillColor(20,20,32);doc.roundedRect(M,12,W-2*M,28,5,5,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(20);doc.text("FINTRACK",M+7,25);
    doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("LAPORAN KEUANGAN PRIBADI",M+7,33);
    doc.setFontSize(9);doc.text(currentUser?.name||"Pengguna",W-M-7,25,{align:"right"});
    doc.text(`Periode ${monthName}`,W-M-7,33,{align:"right"});
  };
  const card=(x,y,w,label,value,accent)=>{
    doc.setFillColor(247,248,252);doc.roundedRect(x,y,w,25,4,4,"F");
    doc.setTextColor(105,110,125);doc.setFontSize(8);doc.setFont("helvetica","bold");doc.text(label.toUpperCase(),x+5,y+8);
    doc.setTextColor(...accent);doc.setFontSize(12);doc.text(value,x+5,y+18);
  };
  header();
  doc.setTextColor(30,32,42);doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text("Ringkasan bulan ini",M,51);
  card(M,56,42,"Pemasukan",moneyPDF(income),[25,135,95]);
  card(M+45,56,42,"Pengeluaran",moneyPDF(expense),[215,70,80]);
  card(M+90,56,42,"Tabungan",moneyPDF(saving),[90,85,210]);
  card(M+135,56,45,"Arus bersih",moneyPDF(net),net>=0?[25,135,95]:[215,70,80]);
  doc.setTextColor(70,74,90);doc.setFontSize(9);doc.setFont("helvetica","normal");
  doc.text(`Budget bulanan: ${moneyPDF(db.budget||0)}   •   Terpakai: ${moneyPDF(expense)}   •   ${pct(expense,db.budget||0)}%`,M,91);
  line(96);
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(30,32,42);doc.text("Pengeluaran berdasarkan kategori",M,106);
  let y=114;
  if(!topCats.length){doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(120,124,138);doc.text("Belum ada pengeluaran pada periode ini.",M,y);y+=10}
  else topCats.forEach(([cat,val],i)=>{
    const barW=100*(val/(topCats[0][1]||1));
    doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(50,54,68);doc.text(cat,M,y+4);
    doc.setFillColor(231,232,240);doc.roundedRect(M+38,y,100,5,2.5,2.5,"F");doc.setFillColor(92,82,210);doc.roundedRect(M+38,y,barW,5,2.5,2.5,"F");
    doc.setFont("helvetica","normal");doc.text(moneyPDF(val),W-M,y+4,{align:"right"});y+=11;
  });
  y+=4;line(y);y+=10;
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(30,32,42);doc.text("Target tabungan",M,y);y+=7;
  const goals=(db.goals||[]).slice(0,4);
  if(!goals.length){doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(120,124,138);doc.text("Belum ada target tabungan.",M,y);y+=10}
  goals.forEach(g=>{const p=Math.min(100,(Number(g.saved||0)/Number(g.amount||1))*100);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(50,54,68);doc.text(g.name,M,y+4);doc.setFillColor(231,232,240);doc.roundedRect(M+45,y,80,5,2.5,2.5,"F");doc.setFillColor(25,170,145);doc.roundedRect(M+45,y,80*p/100,5,2.5,2.5,"F");doc.setFont("helvetica","normal");doc.text(`${Math.round(p)}% • ${moneyPDF(g.saved)} / ${moneyPDF(g.amount)}`,W-M,y+4,{align:"right"});y+=10});
  if(y>250){doc.addPage();header();y=50}
  y+=5;line(y);y+=9;
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(30,32,42);doc.text("Riwayat transaksi",M,y);y+=7;
  const rows=current.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.created||0)-Number(a.created||0)).slice(0,18);
  doc.setFillColor(242,243,247);doc.rect(M,y,W-2*M,7,"F");doc.setFontSize(7.5);doc.setTextColor(70,74,90);doc.setFont("helvetica","bold");doc.text("TANGGAL",M+3,y+5);doc.text("KATEGORI",M+30,y+5);doc.text("CATATAN",M+75,y+5);doc.text("JENIS",M+137,y+5);doc.text("NOMINAL",W-M-3,y+5,{align:"right"});y+=9;
  doc.setFont("helvetica","normal");
  rows.forEach(t=>{if(y>282){doc.addPage();header();y=50}doc.setTextColor(60,64,78);doc.setFontSize(7.2);doc.text(String(t.date||"").split("-").reverse().join("/"),M+3,y);doc.text(String(t.category||"-").slice(0,22),M+30,y);doc.text(String(t.note||"-").slice(0,28),M+75,y);doc.text(t.type==="income"?"Masuk":"Keluar",M+137,y);doc.text((t.type==="income"?"+":"-")+moneyPDF(t.amount).replace("Rp ","Rp "),W-M-3,y,{align:"right"});y+=7;doc.setDrawColor(238,239,243);doc.line(M,y-3,W-M,y-3)});
  const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(130,134,148);doc.text("FinTrack • Laporan pribadi",M,291);doc.text(`Halaman ${i} / ${pages}`,W-M,291,{align:"right"})}
  doc.save(`FinTrack-Laporan-${currentKey}.pdf`);toast("Laporan PDF berhasil dibuat 📄")
}

function setup(){
 authSetup();
 if($("#pdfBtn")) $("#pdfBtn").onclick=downloadPDF;
 $("#date").value=today();
 $("#addBtn").onclick=()=>openModal("#transactionModal");$("#fab").onclick=()=>openModal("#transactionModal");$("#goalBtn").onclick=()=>openModal("#goalModal");
 $$("[data-close]").forEach(b=>b.onclick=closeModals);
 $$("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 $$(".nav-item").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 $("#themeBtn").onclick=()=>{db.theme=db.theme==="dark"?"light":"dark";save();render()};
 $("#searchInput").oninput=renderTransactions;$("#typeFilter").onchange=renderTransactions;
 $$(".type-switch button").forEach(b=>b.onclick=()=>{$$(".type-switch button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("#transactionType").value=b.dataset.type;fillCategories()});
 $("#transactionForm").onsubmit=e=>{e.preventDefault();const t={id:crypto.randomUUID(),created:Date.now(),type:$("#transactionType").value,amount:+$("#amount").value,category:$("#category").value,date:$("#date").value,wallet:$("#wallet").value,note:$("#note").value.trim()};db.transactions.push(t);save();e.target.reset();$("#date").value=today();closeModals();render();toast("Transaksi tersimpan ✓")};
 $("#goalForm").onsubmit=e=>{e.preventDefault();const amount=+$("#goalAmount").value,saved=+$("#goalSaved").value||0;if(saved>amount)return toast("Setoran awal melebihi target");db.goals.push({id:crypto.randomUUID(),name:$("#goalName").value.trim(),amount,saved,date:$("#goalDate").value});save();e.target.reset();closeModals();render();toast("Target tabungan dibuat 🎯")};
$("#saveGoalForm").onsubmit=e=>{e.preventDefault();const g=db.goals.find(x=>x.id===$("#savingGoalId").value),n=+$("#savingAmount").value;if(!g||n<=0)return;if(g.saved+n>g.amount)return toast("Setoran melebihi target");g.saved+=n;db.transactions.push({id:crypto.randomUUID(),created:Date.now(),type:"expense",amount:n,category:"Tabungan",date:today(),wallet:"Cash",note:`Tabungan: ${g.name}`});save();e.target.reset();closeModals();render();toast("Tabungan bertambah 💰")};

 const saveSettingsBtn=$("#saveSettings");
 if(saveSettingsBtn){
   saveSettingsBtn.addEventListener("click",function(e){
     e.preventDefault();
     if(!currentUser){ toast("Silakan login terlebih dahulu 🔐"); return; }
     if(!db) db=defaultUserData();
     const raw=$("#budgetInput").value.trim();
     const budget=raw===""?0:Number(raw);
     if(!Number.isFinite(budget)||budget<0){ toast("Nominal budget tidak valid"); return; }
     db.budget=budget;
     if(!save()){ toast("Data gagal disimpan"); return; }
     $("#nameInput").value=currentUser.name||"";
     $("#usernameDisplay").textContent="@"+currentUser.username;
     render();
     toast("Pengaturan berhasil disimpan ✓");
   });
 }
$("#logoutBtn").onclick=()=>{localStorage.removeItem(SESSION_KEY);currentUser=null;db=null;showAuth("login");toast("Kamu sudah keluar")};
 $("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`fintrack-${today()}.json`;a.click();URL.revokeObjectURL(a.href)};

 const resetBtn=$("#resetBtn");
 if(resetBtn) resetBtn.addEventListener("click",function(e){
   e.preventDefault();
   if(!currentUser) return toast("Silakan login terlebih dahulu 🔐");
   if(confirm("Hapus semua transaksi, target, budget, dompet dan target tabungan akun ini? Data akun login tetap dipertahankan.")){
     db=defaultUserData();
     save();
     $("#nameInput").value=currentUser.name||"";
     $("#budgetInput").value="";
     render();
     toast("Semua data keuangan berhasil direset ✓");
   }
 });
 $("#nameInput").value=currentUser?.name||"";$("#nameInput").readOnly=true;$("#usernameDisplay").textContent=currentUser?"@"+currentUser.username:"";$("#budgetInput").value=(db&&db.budget>0)?db.budget:"";fillCategories();if(currentUser)showApp();else showAuth("login");
}
function fillCategories(){const type=$("#transactionType").value;$("#category").innerHTML=(type==="income"?incomeCats:expenseCats).map(c=>`<option value="${c}">${icons[c]||"💰"} ${c}</option>`).join("")}
function showPage(id){$$(".page").forEach(p=>p.classList.remove("active"));$("#"+id).classList.add("active");$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===id));window.scrollTo({top:0,behavior:"smooth"})}
setup();

document.addEventListener("click",e=>{const b=e.target.closest("[data-eye]");if(!b)return;const el=document.getElementById(b.dataset.eye);if(el)el.type=el.type==="password"?"text":"password"});

// FinTrack v14: universal tap feedback (visual only)
document.addEventListener("pointerdown", function(e){
  const el=e.target.closest("button,a,[role='button'],.nav-item,.tool,.action-card,.card.clickable,.fab");
  if(!el || el.disabled) return;
  el.classList.remove("tap-pop"); void el.offsetWidth; el.classList.add("tap-pop");
  const r=document.createElement("span"); r.className="click-ripple";
  const rect=el.getBoundingClientRect();
  r.style.left=(e.clientX-rect.left)+"px"; r.style.top=(e.clientY-rect.top)+"px";
  el.appendChild(r);
  setTimeout(()=>r.remove(),600);
  setTimeout(()=>el.classList.remove("tap-pop"),220);
}, {passive:true});
