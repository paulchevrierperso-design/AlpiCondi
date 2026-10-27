
(() => {
  "use strict";
  const STORAGE_KEY = "alpi.routes.v1";
  const els = Object.fromEntries(["importForm","routeUrl","status","preview","routes","empty","count","exportBtn","theme"].map(id=>[id,document.getElementById(id)]));
  let pending = null;
  const getRoutes=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return []}};
  const setRoutes=r=>localStorage.setItem(STORAGE_KEY,JSON.stringify(r));
  function parseCamptocampUrl(raw){
    let u; try{u=new URL(raw.trim())}catch{throw new Error("URL invalide.")}
    if(u.protocol!=="https:") throw new Error("L’URL doit utiliser HTTPS.");
    if(!["camptocamp.org","www.camptocamp.org"].includes(u.hostname.toLowerCase())) throw new Error("Le domaine doit être camptocamp.org.");
    const p=u.pathname.split("/").filter(Boolean);
    if(p[0]!=="routes"||!/^\d+$/.test(p[1]||"")) throw new Error("L’URL doit désigner une voie Camptocamp (/routes/ID).");
    const id=Number(p[1]); if(!Number.isSafeInteger(id)||id<=0) throw new Error("Identifiant Camptocamp invalide.");
    return {id,canonicalUrl:`https://www.camptocamp.org/routes/${id}`};
  }
  function text(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  async function fetchMetadata(ref){
    const proxy=(window.ALPI_PROXY_URL||"").replace(/\/$/,"");
    if(!proxy) return {name:`Voie Camptocamp ${ref.id}`,documentId:ref.id,canonicalUrl:ref.canonicalUrl,altitudeMin:null,altitudeMax:null,latitude:null,longitude:null,source:"URL uniquement",warning:"Le proxy de métadonnées n’est pas configuré. La voie peut être enregistrée, mais localisation et altitude restent à compléter."};
    const res=await fetch(`${proxy}/route?id=${encodeURIComponent(ref.id)}`,{headers:{Accept:"application/json"}});
    if(!res.ok) throw new Error(`Import impossible (${res.status}).`);
    const d=await res.json();
    return {name:d.name||`Voie Camptocamp ${ref.id}`,documentId:ref.id,canonicalUrl:ref.canonicalUrl,altitudeMin:Number.isFinite(d.altitudeMin)?d.altitudeMin:null,altitudeMax:Number.isFinite(d.altitudeMax)?d.altitudeMax:null,latitude:Number.isFinite(d.latitude)?d.latitude:null,longitude:Number.isFinite(d.longitude)?d.longitude:null,source:d.source||"Camptocamp",warning:d.warning||"Vérifiez que les coordonnées correspondent bien à la ligne et non au sommet ou au départ."};
  }
  function showPreview(d){pending=d;els.preview.classList.remove("hidden");els.preview.innerHTML=`<h3>${text(d.name)}</h3><dl><dt>ID Camptocamp</dt><dd>${d.documentId}</dd><dt>Altitude</dt><dd>${d.altitudeMin??"à confirmer"} – ${d.altitudeMax??"à confirmer"} m</dd><dt>Coordonnées</dt><dd>${d.latitude??"à confirmer"}, ${d.longitude??"à confirmer"}</dd><dt>Source</dt><dd>${text(d.source)}</dd></dl><p class="meta">${text(d.warning)}</p><button id="confirmImport" type="button">Ajouter à la surveillance</button>`;document.getElementById("confirmImport").addEventListener("click",confirmImport)}
  function confirmImport(){if(!pending)return;const r=getRoutes();if(r.some(x=>x.documentId===pending.documentId)){setStatus("Cette voie est déjà surveillée.",true);return}r.push({...pending,createdAt:new Date().toISOString(),status:(pending.latitude!==null&&pending.altitudeMax!==null)?"à valider":"incomplète"});setRoutes(r);pending=null;els.preview.classList.add("hidden");els.importForm.reset();setStatus("Voie ajoutée.",false);render()}
  function setStatus(msg,isError){els.status.textContent=msg;els.status.className=`status ${isError?"error":"success"}`}
  function render(){const r=getRoutes();els.count.textContent=`${r.length} voie${r.length>1?"s":""}`;els.empty.hidden=r.length>0;els.routes.innerHTML=r.map(x=>`<article class="card" data-id="${x.documentId}"><span class="badge">${text(x.status)}</span><h3>${text(x.name)}</h3><div class="meta">Camptocamp #${x.documentId}<br>Altitude : ${x.altitudeMin??"?"} – ${x.altitudeMax??"?"} m<br>Position : ${x.latitude??"?"}, ${x.longitude??"?"}</div><div class="card-actions"><a href="${text(x.canonicalUrl)}" target="_blank" rel="noopener noreferrer"><button type="button" class="secondary">Ouvrir</button></a><button type="button" class="delete" data-delete="${x.documentId}">Supprimer</button></div></article>`).join("")}
  els.importForm.addEventListener("submit",async e=>{e.preventDefault();els.preview.classList.add("hidden");setStatus("Lecture de l’URL…",false);try{const ref=parseCamptocampUrl(els.routeUrl.value);setStatus("Récupération des métadonnées…",false);showPreview(await fetchMetadata(ref));setStatus("Prévisualisation prête. Vérifiez les informations avant l’ajout.",false)}catch(err){setStatus(err.message||"Import impossible.",true)}});
  els.routes.addEventListener("click",e=>{const id=e.target.dataset.delete;if(!id)return;setRoutes(getRoutes().filter(x=>String(x.documentId)!==id));render()});
  els.exportBtn.addEventListener("click",()=>{const blob=new Blob([JSON.stringify(getRoutes(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="alpi-routes.json";a.click();URL.revokeObjectURL(a.href)});
  els.theme.addEventListener("click",()=>document.documentElement.classList.toggle("dark"));render();
})();
