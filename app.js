const KEY="fintrack_v1";
const defaults={name:"Teman",budget:5000000,theme:"light",wallets:[{id:"cash",name:"Cash",balance:0}],transactions:[],goals:[]};
let db=JSON.parse(localStorage.getItem(KEY)||"null")||structuredClone(defaults);
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const today=()=>new Date().toISOString().slice(0,10);
const save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const icons={Makanan:"🍜",Transportasi:"🚗",Belanja:"🛍️",Tagihan:"🧾",Pendidikan:"📚",Kesehatan:"💊",Hiburan:"🎮",Sedekah:"🤲",Rumah:"🏠",Cicilan:"💳",Gaji:"💼",Bonus:"🎁",Bisnis:"📦",Freelance:"💻",Lainnya:"💰"};
const expenseCats=["Makanan","Transportasi","Belanja","Tagihan","Pendidikan","Kesehatan","Hiburan","Sedekah","Rumah","Cicilan","Lainnya"];
const incomeCats=["Gaji","Bonus","Bisnis","Freelance","Lainnya"];

function monthTx(){const p=today().slice(0,7);return db.transactions.filter(t=>t.date.startsWith(p))}
function totals(){let ins=0,outs=0;db.transactions.forEach(t=>t.type==="income"?ins+=t.amount:outs+=t.amount);return{ins,outs,balance:ins-outs}}
function render(){
 document.body.classList.toggle("dark",db.theme==="dark");
 $("#greeting").textContent=`Halo, ${db.name||"Teman"} 👋`;
 const {ins,outs,balance}=totals(), mt=monthTx(), mi=mt.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0), me=mt.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
 $("#totalBalance").textContent=money(balance);$("#incomeTotal").textContent=money(ins);$("#expenseTotal").textContent=money(outs);
 $("#dashIncome").textContent=money(mi);$("#dashExpense").textContent=money(me);
 const gp=db.goals.reduce((a,g)=>a+(g.amount?Math.min(100,g.saved/g.amount*100):0),0)/(db.goals.length||1);
 $("#goalProgress").textContent=Math.round(gp)+"%";
 $("#budgetProgress").textContent=Math.min(999,Math.round((me/(db.budget||1))*100))+"%";
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
 let arr=[...db.transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.created-b.created).filter(t=>(type==="all"||t.type===type)&&(`${t.note} ${t.category} ${t.wallet}`).toLowerCase().includes(q));
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
function renderGoals(){
 $("#goalsList").innerHTML=db.goals.length?db.goals.map(g=>{const p=Math.min(100,g.saved/g.amount*100);return `<div class="goal"><div class="goal-head"><b>🎯 ${esc(g.name)}</b><b>${Math.round(p)}%</b></div><div class="progress"><div style="width:${p}%"></div></div><div style="font-size:12px;color:var(--muted)">${money(g.saved)} dari ${money(g.amount)}${g.date?" · target "+g.date:""}</div></div>`}).join(""):"<div class='card' style='text-align:center;color:var(--muted)'>Belum ada target tabungan.</div>";
}
function fillWallets(){ $("#wallet").innerHTML=db.wallets.map(w=>`<option value="${esc(w.name)}">${esc(w.name)}</option>`).join("") }
function openModal(id){$(id).classList.remove("hidden")}
function closeModals(){$$(".modal").forEach(x=>x.classList.add("hidden"))}
function toast(s){const t=$("#toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}
function setup(){
 $("#date").value=today();
 $("#addBtn").onclick=()=>openModal("#transactionModal");$("#fab").onclick=()=>openModal("#transactionModal");$("#goalBtn").onclick=()=>openModal("#goalModal");
 $$("[data-close]").forEach(b=>b.onclick=closeModals);
 $$("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 $$(".nav-item").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
 $("#themeBtn").onclick=()=>{db.theme=db.theme==="dark"?"light":"dark";save();render()};
 $("#searchInput").oninput=renderTransactions;$("#typeFilter").onchange=renderTransactions;
 $$(".type-switch button").forEach(b=>b.onclick=()=>{$$(".type-switch button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("#transactionType").value=b.dataset.type;fillCategories()});
 $("#transactionForm").onsubmit=e=>{e.preventDefault();const t={id:crypto.randomUUID(),created:Date.now(),type:$("#transactionType").value,amount:+$("#amount").value,category:$("#category").value,date:$("#date").value,wallet:$("#wallet").value,note:$("#note").value.trim()};db.transactions.push(t);save();e.target.reset();$("#date").value=today();closeModals();render();toast("Transaksi tersimpan ✓")};
 $("#goalForm").onsubmit=e=>{e.preventDefault();db.goals.push({id:crypto.randomUUID(),name:$("#goalName").value.trim(),amount:+$("#goalAmount").value,saved:+$("#goalSaved").value||0,date:$("#goalDate").value});save();e.target.reset();closeModals();render();toast("Target dibuat 🎯")};
 $("#saveSettings").onclick=()=>{db.name=$("#nameInput").value.trim()||"Teman";db.budget=+$("#budgetInput").value||5000000;save();render();toast("Pengaturan disimpan")};
 $("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`fintrack-${today()}.json`;a.click();URL.revokeObjectURL(a.href)};
 $("#resetBtn").onclick=()=>{if(confirm("Hapus semua transaksi, target, dan pengaturan?")){db=structuredClone(defaults);save();render();toast("Data direset")}};
 $("#nameInput").value=db.name;$("#budgetInput").value=db.budget;fillCategories();render();
}
function fillCategories(){const type=$("#transactionType").value;$("#category").innerHTML=(type==="income"?incomeCats:expenseCats).map(c=>`<option value="${c}">${icons[c]||"💰"} ${c}</option>`).join("")}
function showPage(id){$$(".page").forEach(p=>p.classList.remove("active"));$("#"+id).classList.add("active");$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===id));window.scrollTo({top:0,behavior:"smooth"})}
setup();
