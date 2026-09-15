(() => {
"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const TABLES = [
  {key:"pink", color:"#F3237C", soft:"#FFD5E7"},
  {key:"orange", color:"#F47607", soft:"#FFE0C6"},
  {key:"yellow", color:"#FAB910", soft:"#FFF3AD"},
  {key:"green", color:"#56A328", soft:"#D9EFCF"},
  {key:"blue", color:"#22B8F4", soft:"#D5F0FE"},
  {key:"purple", color:"#7618CF", soft:"#E7DCF6"}
];

const STORAGE_PREFIX = "taskscreen.github.v12.";
let activeGrade = localStorage.getItem(STORAGE_PREFIX + "activeGrade") || "first";
let state = null;
let editMode = false;
let activeTable = null;
let calledTables = new Set();
let audioCtx = null;
let taskObjectUrl = "";

function defaultState() {
  return {
    titles:{
      objective:"OBJECTIVE",
      voice:"VOICE LEVEL",
      timer:"CLASS ENDS",
      task:"TASK OF THE DAY",
      reminders:"REMINDERS",
      bathroom:"BATHROOM + WATER"
    },
    objective:"",
    taskSub:"",
    voiceLevel:2,
    voiceLabels:["SILENT","WHISPER","TABLE TALK","PARTNER TALK","PRESENTER"],
    timer:{
      endTime:"",
      endLabel:"END TIME",
      countLabels:"HOURS   MINUTES   SECONDS"
    },
    reminders:[
      {text:"",done:false},
      {text:"",done:false},
      {text:"",done:false}
    ],
    bathroom:{
      doorbellText:"RING THE DOORBELL TO RETURN",
      tableLabels:{
        pink:"PINK", orange:"ORANGE", yellow:"YELLOW",
        green:"GREEN", blue:"BLUE", purple:"PURPLE"
      }
    },
    task:{
      mode:"empty",
      text:"",
      url:"",
      urlKind:""
    },
    fontAdjust:{
      objective:{title:0,text:0},
      voice:{title:0,text:0},
      timer:{title:0,text:0},
      task:{title:0,text:0},
      reminders:{title:0,text:0},
      bathroom:{title:0,text:0}
    }
  };
}

function deepMerge(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra : base;
  if (!base || typeof base !== "object") return extra === undefined ? base : extra;
  const out = {...base};
  if (extra && typeof extra === "object") {
    for (const [k,v] of Object.entries(extra)) {
      out[k] = (k in base && base[k] && typeof base[k] === "object" && !Array.isArray(base[k]))
        ? deepMerge(base[k], v)
        : v;
    }
  }
  return out;
}

function loadState(grade) {
  let parsed = {};
  try { parsed = JSON.parse(localStorage.getItem(STORAGE_PREFIX + grade) || "{}"); } catch(e) {}
  return deepMerge(defaultState(), parsed);
}

let saveTimer = null;
function saveState() {
  localStorage.setItem(STORAGE_PREFIX + activeGrade, JSON.stringify(state));
  const status = $("#saveStatus");
  status.textContent = "SAVING";
  status.classList.add("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    status.textContent = "SAVED";
    status.classList.remove("saving");
  }, 350);
}

function getPath(obj, path) {
  return path.split(".").reduce((a,k) => a?.[k], obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  keys.slice(0,-1).forEach(k => { if(!cur[k] || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; });
  cur[keys.at(-1)] = value;
}

function escapeHtmlAttr(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* IndexedDB for uploaded image/GIF/video */
const DB_NAME = "TaskscreenMediaV1";
const STORE = "media";
function openDb() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function mediaPut(grade, record) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(record, grade);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function mediaGet(grade) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const req = db.transaction(STORE,"readonly").objectStore(STORE).get(grade);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function mediaDelete(grade) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(grade);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* Editable text */
function syncEditableText() {
  $$("[data-edit-key]").forEach(el => {
    const path = el.dataset.editKey;
    const value = getPath(state, path) ?? "";
    if (el.textContent !== String(value)) el.textContent = value;
  });
  $("#taskSub").dataset.placeholder = "Type what students need to do...";
}
$$("[data-edit-key]").forEach(el => {
  el.addEventListener("input", () => {
    if(!editMode) return;
    setPath(state, el.dataset.editKey, el.textContent.trim());
    saveState();
  });
});

/* Edit mode */
function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle("edit-mode", on);
  $("#editToggle").textContent = on ? "DONE" : "EDIT";

  $$("[data-edit-key]").forEach(el => {
    el.contentEditable = on ? "true" : "false";
    el.spellcheck = false;
  });

  const voiceLabel = $("#voiceLabel");
  voiceLabel.contentEditable = on ? "true" : "false";
  voiceLabel.spellcheck = false;

  $$("[data-table-label]").forEach(span => {
    span.contentEditable = on ? "true" : "false";
    span.spellcheck = false;
  });

  $("#objectiveInput").readOnly = !on;
  renderReminders();

  if(on && navigator.storage?.persist) {
    navigator.storage.persist().catch(()=>{});
  }
}
$("#editToggle").addEventListener("click", () => setEditMode(!editMode));

/* Grade profiles */
async function switchGrade(grade) {
  if(!["first","second"].includes(grade)) return;
  activeGrade = grade;
  localStorage.setItem(STORAGE_PREFIX + "activeGrade", grade);
  state = loadState(grade);
  $$(".grade-btn").forEach(b => b.classList.toggle("active", b.dataset.grade === grade));
  resetBathroom();
  await renderAll();
}
$$(".grade-btn").forEach(btn => btn.addEventListener("click", () => switchGrade(btn.dataset.grade)));

/* Objective */
$("#objectiveInput").addEventListener("input", e => {
  state.objective = e.target.value;
  saveState();
});

/* Voice */
function renderVoice() {
  $$(".voice-btn").forEach(btn => btn.classList.toggle("active", Number(btn.dataset.level) === Number(state.voiceLevel)));
  $("#voiceLabel").textContent = state.voiceLabels[state.voiceLevel] || "";
}
$$(".voice-btn").forEach(btn => btn.addEventListener("click", () => {
  state.voiceLevel = Number(btn.dataset.level);
  renderVoice();
  saveState();
}));
$("#voiceLabel").addEventListener("input", () => {
  if(!editMode) return;
  state.voiceLabels[state.voiceLevel] = $("#voiceLabel").textContent.trim();
  saveState();
});

/* Timer */
const endTimeInput = $("#endTimeInput");
const endTimeDisplay = $("#endTimeDisplay");
endTimeInput.addEventListener("input", () => {
  state.timer.endTime = endTimeInput.value;
  saveState();
  updateCountdown();
});
endTimeDisplay.addEventListener("click", () => {
  endTimeInput.style.display = "block";
  endTimeDisplay.style.display = "none";
  endTimeInput.focus();
  try { endTimeInput.showPicker(); } catch(e) {}
});
endTimeInput.addEventListener("change", () => {
  if(!editMode) {
    endTimeInput.style.display = "none";
    endTimeDisplay.style.display = "block";
  }
});
endTimeInput.addEventListener("blur", () => {
  if(!editMode) setTimeout(() => {
    endTimeInput.style.display = "none";
    endTimeDisplay.style.display = "block";
  }, 100);
});
function formatTime(v) {
  if(!v) return "--:--";
  const [h,m] = v.split(":").map(Number);
  const d = new Date();
  d.setHours(h,m,0,0);
  return d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
}
function updateCountdown() {
  const v = state?.timer?.endTime || "";
  endTimeDisplay.textContent = formatTime(v);
  if(!v) { $("#countdown").textContent = "--:--:--"; return; }
  const [h,m] = v.split(":").map(Number);
  const now = new Date();
  const end = new Date();
  end.setHours(h,m,0,0);
  let diff = end - now;
  if(diff <= 0) { $("#countdown").textContent = "CLASS OVER"; return; }
  const hh = Math.floor(diff / 3600000);
  diff %= 3600000;
  const mm = Math.floor(diff / 60000);
  const ss = Math.floor((diff % 60000) / 1000);
  $("#countdown").textContent = [hh,mm,ss].map(n => String(n).padStart(2,"0")).join(":");
}
setInterval(updateCountdown,1000);

/* Reminders */
function renderReminders() {
  const list = $("#reminderList");
  list.innerHTML = "";
  state.reminders.forEach((r,i) => {
    const row = document.createElement("div");
    row.className = "reminder-row";
    row.innerHTML = `
      <input class="reminder-check" type="checkbox" ${r.done ? "checked" : ""} aria-label="Reminder complete">
      <input class="reminder-text" type="text" value="${escapeHtmlAttr(r.text)}" placeholder="Type a reminder..." ${editMode ? "" : "readonly"}>
      <button class="reminder-remove" type="button" aria-label="Remove reminder">×</button>`;
    const check = row.querySelector(".reminder-check");
    const input = row.querySelector(".reminder-text");
    const remove = row.querySelector(".reminder-remove");
    check.addEventListener("change", () => { state.reminders[i].done = check.checked; saveState(); });
    input.addEventListener("input", () => { state.reminders[i].text = input.value; saveState(); });
    remove.addEventListener("click", () => { state.reminders.splice(i,1); saveState(); renderReminders(); });
    list.appendChild(row);
  });
  applyPanelFont("reminders");
}
$("#addReminderBtn").addEventListener("click", () => {
  state.reminders.push({text:"",done:false});
  saveState();
  renderReminders();
});

/* Task */
const taskPreview = $("#taskPreview");
const taskTextInput = $("#taskTextInput");
const imageUrlInput = $("#imageUrlInput");
const videoUrlInput = $("#videoUrlInput");

function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = "";
    if(u.hostname.includes("youtu.be")) id = u.pathname.slice(1).split("/")[0];
    if(u.hostname.includes("youtube.com")) {
      if(u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if(u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
      else if(u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
    }
    return id ? `https://www.youtube.com/embed/${id}` : "";
  } catch(e) { return ""; }
}
function setTaskEditorMode(mode) {
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $$(".task-control").forEach(c => c.classList.toggle("active", c.dataset.control === mode));
}
$$(".mode-btn").forEach(btn => btn.addEventListener("click", () => setTaskEditorMode(btn.dataset.mode)));

async function clearTaskMedia() {
  if(taskObjectUrl) { URL.revokeObjectURL(taskObjectUrl); taskObjectUrl = ""; }
  await mediaDelete(activeGrade).catch(()=>{});
}
async function renderTask() {
  if(taskObjectUrl) { URL.revokeObjectURL(taskObjectUrl); taskObjectUrl = ""; }
  taskPreview.innerHTML = "";
  taskTextInput.value = state.task.text || "";
  imageUrlInput.value = state.task.mode === "image-url" ? state.task.url || "" : "";
  videoUrlInput.value = state.task.mode === "video-url" ? state.task.url || "" : "";

  if(state.task.mode === "text" && state.task.text) {
    const d = document.createElement("div");
    d.className = "task-text-preview";
    d.textContent = state.task.text;
    taskPreview.appendChild(d);
  } else if(state.task.mode === "image-url" && state.task.url) {
    const img = document.createElement("img");
    img.src = state.task.url;
    img.alt = "Task of the day";
    taskPreview.appendChild(img);
  } else if(state.task.mode === "video-url" && state.task.url) {
    const yt = youtubeEmbed(state.task.url);
    if(yt) {
      const iframe = document.createElement("iframe");
      iframe.src = yt;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      taskPreview.appendChild(iframe);
    } else {
      const v = document.createElement("video");
      v.src = state.task.url;
      v.controls = true;
      v.playsInline = true;
      taskPreview.appendChild(v);
    }
  } else if(state.task.mode === "upload-image" || state.task.mode === "upload-video") {
    const media = await mediaGet(activeGrade).catch(()=>null);
    if(media?.blob) {
      taskObjectUrl = URL.createObjectURL(media.blob);
      if(state.task.mode === "upload-image") {
        const img = document.createElement("img");
        img.src = taskObjectUrl;
        img.alt = "Task of the day";
        taskPreview.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = taskObjectUrl;
        v.controls = true;
        v.playsInline = true;
        taskPreview.appendChild(v);
      }
    }
  }

  if(!taskPreview.children.length) {
    taskPreview.innerHTML = `<div class="task-empty">
      <svg class="empty-image-icon" viewBox="0 0 120 100" aria-hidden="true"><rect x="12" y="10" width="96" height="80" rx="10" fill="#fff" stroke="#2c91ce" stroke-width="6"/><circle cx="81" cy="34" r="10" fill="#FFD31B"/><path d="M24 77 48 51l17 17 12-12 21 21z" fill="#56A328"/><path d="M24 77 48 51l17 17" fill="none" stroke="#3e9bd6" stroke-width="4" stroke-linejoin="round"/></svg>
      Add a picture, video, GIF, or text here.</div>`;
  }
  setTaskEditorMode(state.task.mode.startsWith("image") || state.task.mode === "upload-image" ? "image" :
                    state.task.mode.startsWith("video") || state.task.mode === "upload-video" ? "video" : "text");
  applyPanelFont("task");
}
taskTextInput.addEventListener("input", async () => {
  await clearTaskMedia();
  state.task = {mode:"text", text:taskTextInput.value, url:"", urlKind:""};
  saveState();
  renderTask();
});
$("#imageFileInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  await mediaPut(activeGrade, {blob:file, kind:"image", name:file.name, mime:file.type});
  state.task = {mode:"upload-image", text:"", url:"", urlKind:""};
  saveState();
  renderTask();
});
$("#videoFileInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if(!file) return;
  await mediaPut(activeGrade, {blob:file, kind:"video", name:file.name, mime:file.type});
  state.task = {mode:"upload-video", text:"", url:"", urlKind:""};
  saveState();
  renderTask();
});
$("#useImageUrlBtn").addEventListener("click", async () => {
  const url = imageUrlInput.value.trim();
  if(!url) return;
  await clearTaskMedia();
  state.task = {mode:"image-url", text:"", url, urlKind:"image"};
  saveState();
  renderTask();
});
$("#useVideoUrlBtn").addEventListener("click", async () => {
  const url = videoUrlInput.value.trim();
  if(!url) return;
  await clearTaskMedia();
  state.task = {mode:"video-url", text:"", url, urlKind:"video"};
  saveState();
  renderTask();
});
$("#clearTaskBtn").addEventListener("click", async () => {
  await clearTaskMedia();
  state.task = {mode:"empty", text:"", url:"", urlKind:""};
  saveState();
  renderTask();
});

/* Bathroom */
function tableLabel(key) {
  return state.bathroom.tableLabels[key] || key.toUpperCase();
}
function renderTableLabels() {
  $$("[data-table-label]").forEach(span => {
    span.textContent = tableLabel(span.dataset.tableLabel);
  });
}
function resetBathroom() {
  activeTable = null;
  calledTables = new Set();
  const panel = $("#bathroomPanel");
  panel.style.background = "var(--bath-neutral)";
  const current = $("#bathroomCurrent");
  current.textContent = "";
  current.classList.add("is-empty");
  current.classList.remove("flash");
  $$(".table-btn").forEach(btn => btn.classList.remove("active","called"));
}
function audio() {
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(ctx,freq,start,dur,gainLevel=.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq,start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(gainLevel,start+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,start+dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(start); osc.stop(start+dur);
}
function attention() {
  const ctx = audio();
  const base = ctx.currentTime + .02;
  for(let r=0;r<3;r++) {
    const t = base + r*.86;
    tone(ctx,1046.5,t,.21,.21);
    tone(ctx,784,t+.24,.38,.18);
  }
}
function renderBathroomButtons() {
  $$(".table-btn").forEach(btn => {
    const key = btn.dataset.key;
    btn.classList.toggle("active", key === activeTable);
    btn.classList.toggle("called", calledTables.has(key) && key !== activeTable);
  });
}
function activateTable(key, sound=true) {
  if(editMode) return;
  const t = TABLES.find(x => x.key === key);
  if(!t) return;
  const changed = activeTable !== key;
  if(changed && activeTable) calledTables.add(activeTable);
  activeTable = key;

  $("#bathroomPanel").style.background = t.color;
  const current = $("#bathroomCurrent");
  current.textContent = `${tableLabel(key)} TABLE`;
  current.classList.remove("is-empty");
  current.classList.add("flash");
  renderBathroomButtons();
  if(changed && sound) attention();
}
$$(".table-btn").forEach(btn => btn.addEventListener("click", e => {
  if(editMode) return;
  activateTable(btn.dataset.key,true);
}));
$$("[data-table-label]").forEach(span => span.addEventListener("input", e => {
  if(!editMode) return;
  const key = span.dataset.tableLabel;
  state.bathroom.tableLabels[key] = span.textContent.trim().replace(/\s+TABLE$/i,"") || key.toUpperCase();
  saveState();
}));
$("#bathNextBtn").addEventListener("click", () => {
  if(editMode) return;
  if(!activeTable) { activateTable(TABLES[0].key,true); return; }
  let i = TABLES.findIndex(t => t.key === activeTable);
  i = (i+1) % TABLES.length;
  activateTable(TABLES[i].key,true);
});
$("#bathResetBtn").addEventListener("click", resetBathroom);

/* Font controls */
const FONT_MAP = {
  objective:{title:[".objective .panel-title"], text:["#objectiveInput"]},
  voice:{title:[".voice .panel-title"], text:[".voice-btn","#voiceLabel"]},
  timer:{title:[".timer .panel-title"], text:[".end-label","#endTimeInput","#endTimeDisplay","#countdown",".count-labels"]},
  task:{title:[".task .panel-title"], text:["#taskSub",".task-text-preview",".task-empty"]},
  reminders:{title:[".reminders .panel-title"], text:[".reminder-text"]},
  bathroom:{title:[".bathroom .panel-title"], text:["#bathroomCurrent",".doorbell-text",".table-btn"]}
};
function elementsFor(panel, part) {
  return (FONT_MAP[panel]?.[part] || []).flatMap(sel => $$(sel));
}
function applyPanelFont(panel) {
  ["title","text"].forEach(part => {
    const delta = Number(state.fontAdjust?.[panel]?.[part] || 0);
    elementsFor(panel,part).forEach(el => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize) || 16;
      el.style.fontSize = Math.max(8, base + delta) + "px";
    });
  });
}
function applyAllFonts() {
  Object.keys(FONT_MAP).forEach(applyPanelFont);
}
$$(".panel-tools button").forEach(btn => btn.addEventListener("click", e => {
  e.stopPropagation();
  const panel = btn.closest(".panel").dataset.panel;
  const part = btn.dataset.fontPart;
  const delta = Number(btn.dataset.fontDelta);
  state.fontAdjust[panel][part] = Math.max(-18, Math.min(34, Number(state.fontAdjust[panel][part] || 0) + delta));
  saveState();
  applyPanelFont(panel);
}));

/* Full render */
async function renderAll() {
  syncEditableText();
  $("#objectiveInput").value = state.objective || "";
  $("#endTimeInput").value = state.timer.endTime || "";
  renderVoice();
  renderReminders();
  renderTableLabels();
  await renderTask();
  updateCountdown();
  applyAllFonts();
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyAllFonts,120);
});

state = loadState(activeGrade);
setEditMode(false);
switchGrade(activeGrade);
})();