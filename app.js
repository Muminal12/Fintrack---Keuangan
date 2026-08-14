const USERS_KEY="fintrack_users_v2",SESSION_KEY="fintrack_session_v2",KEY_PREFIX="fintrack_user_v2_";
const defaultUserData=()=>({budget:5000000,theme:"light",wallets:[{id:"cash",name:"Cash",balance:0}],transactions:[],goals:[]});
const getUsers=()=>JSON.parse(localStorage.getItem(USERS_KEY)||"[]");
let currentUser=null,db=null;
function loadSession(){const u=getUsers().find(x=>x.username===localStorage.getItem(SESSION_KEY));if(!u){return false}currentUser=u;db=JSON.parse(localStorage.getItem(KEY_PREFIX+u.username)||"null")||defaultUserData();return true}
function save(){if(currentUser)localStorage.setItem(KEY_PREFIX+currentUser.username,JSON.stringify(db))}
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
 $("#forgotBtn").onclick=()=>toast("Reset password online akan tersedia saat FinTrack memakai database/server.");
}
function authSetup(){setupAuthExtras();$$(".auth-tab").forEach(b=>b.onclick=()=>showAuth(b.dataset.auth));$("#loginForm").onsubmit=e=>{e.preventDefault();const u=$("#loginUsername").value.trim().toLowerCase(),p=$("#loginPassword").value,x=getUsers().find(x=>x.username===u);if(!x||x.password!==btoa(unescape(encodeURIComponent(p))))return toast("Username atau password salah");localStorage.setItem(SESSION_KEY,u);loadSession();showApp();toast("Selamat datang kembali 👋")};$("#registerForm").onsubmit=e=>{e.preventDefault();const name=$("#registerName").value.trim(),u=$("#registerUsername").value.trim().toLowerCase(),p=$("#registerPassword").value,p2=$("#registerPassword2").value;if(!/^[a-z0-9._-]{3,}$/.test(u))return toast("Username minimal 3 karakter");if(p.length<6)return toast("Password minimal 6 karakter");if(p!==p2)return toast("Password belum sama");const users=getUsers();if(users.some(x=>x.username===u))return toast("Username sudah digunakan");users.push({username:u,name,password:btoa(unescape(encodeURIComponent(p))),created:Date.now()});localStorage.setItem(USERS_KEY,JSON.stringify(users));localStorage.setItem(KEY_PREFIX+u,JSON.stringify(defaultUserData()));localStorage.setItem(SESSION_KEY,u);loadSession();showApp();toast("Akun berhasil dibuat 🎉")}}
function setup(){
 authSetup();
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
 $("#saveSettings").onclick=()=>{currentUser.name=$("#nameInput").value.trim()||"Teman";localStorage.setItem(USERS_KEY,JSON.stringify(getUsers().map(u=>u.username===currentUser.username?currentUser:u)));db.budget=+$("#budgetInput").value||5000000;save();render();toast("Pengaturan disimpan")};
$("#logoutBtn").onclick=()=>{localStorage.removeItem(SESSION_KEY);currentUser=null;db=null;showAuth("login");toast("Kamu sudah keluar")};
 $("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`fintrack-${today()}.json`;a.click();URL.revokeObjectURL(a.href)};
 $("#resetBtn").onclick=()=>{if(confirm("Hapus semua transaksi, target, dan pengaturan?")){db=defaultUserData();save();render();toast("Data akun direset")}};
 $("#nameInput").value=currentUser?.name||"";$("#budgetInput").value=db?.budget||5000000;fillCategories();if(currentUser)showApp();else showAuth("login");
}
function fillCategories(){const type=$("#transactionType").value;$("#category").innerHTML=(type==="income"?incomeCats:expenseCats).map(c=>`<option value="${c}">${icons[c]||"💰"} ${c}</option>`).join("")}
function showPage(id){$$(".page").forEach(p=>p.classList.remove("active"));$("#"+id).classList.add("active");$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===id));window.scrollTo({top:0,behavior:"smooth"})}
setup();
