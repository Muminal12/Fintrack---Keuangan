/* FinTrack V13 auth hardening: independent registration handler */
(function(){
 function qs(s){return document.querySelector(s)}
 function enc(p){return btoa(unescape(encodeURIComponent(p)))}
 function users(){try{return JSON.parse(localStorage.getItem("fintrack_users_v2")||"[]")}catch(e){return []}}
 function showLogin(){
   const auth=qs("#authPage"), app=qs("#app");
   if(auth) auth.classList.remove("hidden");
   if(app){const m=app.querySelector("main"),t=app.querySelector(".topbar"),n=app.querySelector(".bottom-nav"),f=qs("#fab"); if(m)m.classList.add("hidden");if(t)t.classList.add("hidden");if(n)n.classList.add("hidden");if(f)f.classList.add("hidden");}
   qs("#loginForm")?.classList.remove("hidden"); qs("#registerForm")?.classList.add("hidden");
   document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth==="login"));
 }
 function toast(msg){ if(window.toast)return window.toast(msg); let t=qs("#ftToast");if(!t){t=document.createElement("div");t.id="ftToast";document.body.appendChild(t)}t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
 function bind(){
   document.querySelectorAll(".auth-tab[data-auth='register']").forEach(b=>b.addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();qs("#loginForm")?.classList.add("hidden");qs("#registerForm")?.classList.remove("hidden");document.querySelectorAll(".auth-tab").forEach(x=>x.classList.toggle("active",x===b));},true));
   const form=qs("#registerForm"); if(!form)return;
   form.addEventListener("submit",function(e){
     e.preventDefault(); e.stopImmediatePropagation();
     const name=qs("#registerName")?.value.trim()||"", u=(qs("#registerUsername")?.value.trim()||"").toLowerCase(), p=qs("#registerPassword")?.value||"", p2=qs("#registerPassword2")?.value||"";
     if(!name)return toast("Nama lengkap wajib diisi");
     if(!/^[a-z0-9._-]{3,}$/.test(u))return toast("Username minimal 3 karakter");
     if(p.length<6)return toast("Password minimal 6 karakter");
     if(p!==p2)return toast("Password belum sama");
     const us=users(); if(us.some(x=>x.username===u))return toast("Username sudah digunakan");
     us.push({username:u,name,password:enc(p),created:Date.now()});
     localStorage.setItem("fintrack_users_v2",JSON.stringify(us));
     localStorage.setItem("fintrack_user_v2_"+u,JSON.stringify({budget:0,theme:"light",wallets:[{id:"cash",name:"Cash",balance:0}],transactions:[],goals:[]}));
     localStorage.removeItem("fintrack_session_v2");
     const lu=qs("#loginUsername"),lp=qs("#loginPassword"); if(lu)lu.value=u;if(lp)lp.value="";
     showLogin(); toast("Akun berhasil dibuat. Silakan login 🔐");
   },true);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);else bind();
})();
