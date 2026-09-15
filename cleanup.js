(() => {
"use strict";
const $ = s => document.querySelector(s);

const GRADE_KEY = "taskscreen.github.v12.activeGrade";
const activeGrade = localStorage.getItem(GRADE_KEY) || "first";
const KEY = `taskscreen.cleanup.v1.${activeGrade}`;
const DB_NAME = "TaskscreenMediaV1";
const STORE = "media";
const MEDIA_KEY = `${activeGrade}:cleanup-video`;

function defaults(){
  return {
    title:"CLEAN UP!",
    subtitle:"Clean your space • Return materials • Sit ready",
    readyTitle:"WHEN YOU'RE DONE",
    readyText:"Sit in your seat and show me you are ready.",
    timer:"5:00",
    videoMode:"empty",
    videoUrl:""
  };
}
function load(){
  try{return {...defaults(),...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch(e){return defaults()}
}
let state=load(), edit=false, objectUrl="", timer=null, remaining=0, running=false;
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
  })
}
async function mediaPut(file){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put({blob:file,name:file.name,mime:file.type},MEDIA_KEY);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
  })
}
async function mediaGet(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,"readonly").objectStore(STORE).get(MEDIA_KEY);
    req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)
  })
}
async function mediaDelete(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(MEDIA_KEY);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
  })
}
function youtubeEmbed(url){
  try{
    const u=new URL(url);let id="";
    if(u.hostname.includes("youtu.be"))id=u.pathname.slice(1).split("/")[0];
    if(u.hostname.includes("youtube.com")){
      if(u.pathname==="/watch")id=u.searchParams.get("v")||"";
      else if(u.pathname.startsWith("/shorts/"))id=u.pathname.split("/")[2]||"";
      else if(u.pathname.startsWith("/embed/"))id=u.pathname.split("/")[2]||"";
    }
    return id?`https://www.youtube.com/embed/${id}`:"";
  }catch(e){return""}
}
async function renderVideo(){
  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=""}
  const stage=$("#cleanupVideo");stage.innerHTML="";
  if(state.videoMode==="url"&&state.videoUrl){
    const yt=youtubeEmbed(state.videoUrl);
    if(yt){
      const f=document.createElement("iframe");f.src=yt;f.allowFullscreen=true;
      f.allow="autoplay; encrypted-media; picture-in-picture";stage.appendChild(f)
    }else{
      const v=document.createElement("video");v.src=state.videoUrl;v.controls=true;v.playsInline=true;stage.appendChild(v)
    }
  }else if(state.videoMode==="upload"){
    const rec=await mediaGet().catch(()=>null);
    if(rec?.blob){
      objectUrl=URL.createObjectURL(rec.blob);
      const v=document.createElement("video");v.src=objectUrl;v.controls=true;v.playsInline=true;stage.appendChild(v)
    }
  }
  if(!stage.children.length)stage.innerHTML='<div class="video-empty">ADD YOUR CLEAN UP VIDEO</div>';
}
function sync(){
  $("#cleanupTitle").textContent=state.title;
  $("#cleanupSubtitle").textContent=state.subtitle;
  $("#readyTitle").textContent=state.readyTitle;
  $("#readyText").textContent=state.readyText;
  $("#cleanupTimerInput").value=state.timer;
  $("#cleanupVideoUrl").value=state.videoUrl||"";
  $("#cleanupGrade").textContent=activeGrade==="first"?"1ST GRADE":"2ND GRADE";
  remaining=parseDuration(state.timer);
}
function setEdit(on){
  edit=on;document.body.classList.toggle("edit-mode",on);$("#cleanupEdit").textContent=on?"DONE":"EDIT";
  ["cleanupTitle","cleanupSubtitle","readyTitle","readyText"].forEach(id=>{$("#"+id).contentEditable=on?"true":"false"})
}
["cleanupTitle","cleanupSubtitle","readyTitle","readyText"].forEach(id=>{
  $("#"+id).addEventListener("input",()=>{
    if(!edit)return;
    const map={cleanupTitle:"title",cleanupSubtitle:"subtitle",readyTitle:"readyTitle",readyText:"readyText"};
    state[map[id]]=$("#"+id).textContent.trim();save()
  })
});
$("#cleanupEdit").onclick=()=>setEdit(!edit);
$("#cleanupVideoFile").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  await mediaPut(f);state.videoMode="upload";state.videoUrl="";save();renderVideo()
});
$("#useCleanupUrl").onclick=async()=>{
  const url=$("#cleanupVideoUrl").value.trim();if(!url)return;
  await mediaDelete().catch(()=>{});state.videoMode="url";state.videoUrl=url;save();renderVideo()
};
$("#clearCleanupVideo").onclick=async()=>{
  await mediaDelete().catch(()=>{});state.videoMode="empty";state.videoUrl="";$("#cleanupVideoUrl").value="";save();renderVideo()
};
function parseDuration(v){
  const raw=String(v||"").trim();if(!raw)return 0;
  if(/^\d+$/.test(raw))return Number(raw)*60;
  const p=raw.split(":").map(Number);if(p.some(Number.isNaN))return 0;
  if(p.length===2)return Math.max(0,p[0]*60+p[1]);
  if(p.length===3)return Math.max(0,p[0]*3600+p[1]*60+p[2]);
  return 0
}
function fmt(s){s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?`${h}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`:`${m}:${String(x).padStart(2,"0")}`}
function stop(){clearInterval(timer);timer=null;running=false}
$("#cleanupTimerInput").addEventListener("input",()=>{stop();state.timer=$("#cleanupTimerInput").value;remaining=parseDuration(state.timer);save()});
$("#cleanupStart").onclick=()=>{if(running)return;if(remaining<=0)remaining=parseDuration($("#cleanupTimerInput").value);if(remaining<=0)return;running=true;timer=setInterval(()=>{remaining--;$("#cleanupTimerInput").value=fmt(remaining);if(remaining<=0)stop()},1000)};
$("#cleanupPause").onclick=stop;
$("#cleanupReset").onclick=()=>{stop();$("#cleanupTimerInput").value=state.timer;remaining=parseDuration(state.timer)};
sync();setEdit(false);renderVideo();
})();