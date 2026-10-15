/* RESQNET browser prototype.
   Local-first UI + multilingual browser speech APIs. This is not a real mesh transport. */
(() => {
  "use strict";
  const STORAGE_KEY = "resqnet.data.v1";
  const LANGUAGES = [
    ["English (India)","en-IN"],["English (US)","en-US"],["தமிழ் — Tamil","ta-IN"],["हिन्दी — Hindi","hi-IN"],
    ["తెలుగు — Telugu","te-IN"],["ಕನ್ನಡ — Kannada","kn-IN"],["മലയാളം — Malayalam","ml-IN"],["বাংলা — Bengali","bn-IN"],
    ["मराठी — Marathi","mr-IN"],["ગુજરાતી — Gujarati","gu-IN"],["ਪੰਜਾਬੀ — Punjabi","pa-IN"],["اردو — Urdu","ur-PK"],
    ["සිංහල — Sinhala","si-LK"],["Nepali","ne-NP"],["Odia","or-IN"],["Assamese","as-IN"],
    ["Spanish","es-ES"],["French","fr-FR"],["German","de-DE"],["Português — Portuguese","pt-PT"],
    ["Arabic","ar-SA"],["Chinese (Mandarin)","zh-CN"],["Japanese","ja-JP"],["Korean","ko-KR"],
    ["Indonesian","id-ID"],["Thai","th-TH"],["Vietnamese","vi-VN"],["Russian","ru-RU"],
    ["Italian","it-IT"],["Turkish","tr-TR"],["Dutch","nl-NL"],["Swahili","sw-KE"]
  ];
  const TYPES = ["SOS","MEDICAL","RESCUE","HAZARD","FOOD","WATER","SHELTER","OFFER","GENERAL"];
  const REQUEST_TYPES = ["MEDICAL","RESCUE","FOOD","WATER","SHELTER","GENERAL"];
  const DEFAULT_VOLUNTEERS = [
    {id:"vol-1", type:"Volunteer", name:"Asha Kumar", location:"Koramangala, Bengaluru", skills:"Medical support, food delivery", availability:"Available today", phone:"+91 98400 0001", x:58, y:42},
    {id:"vol-2", type:"Volunteer", name:"Rafi Ahmed", location:"Mylapore, Chennai", skills:"Rescue coordination, first aid", availability:"Available in 2 hours", phone:"+91 97800 0002", x:46, y:68},
    {id:"vol-3", type:"Volunteer", name:"Priya Nair", location:"Kochi, Kerala", skills:"Shelter coordination, child care", availability:"Available now", phone:"+91 94400 0003", x:72, y:76},
    {id:"vol-4", type:"Volunteer", name:"Sanjay Iyer", location:"HSR Layout, Bengaluru", skills:"Water supply, transport", availability:"Available now", phone:"+91 98300 0004", x:63, y:48},
    {id:"vol-5", type:"Volunteer", name:"Meera Das", location:"Thiruvananthapuram, Kerala", skills:"Shelter care, community support", availability:"Available in 1 hour", phone:"+91 94900 0005", x:80, y:72}
  ];
  const DEFAULT_RESCUE_TEAMS = [
    {id:"team-1", type:"Rescue team", name:"City Rescue Unit 1", location:"Jayanagar, Bengaluru", skills:"Flood rescue, ambulance support", availability:"Live on site", phone:"+91 98500 1001", x:56, y:44},
    {id:"team-2", type:"Rescue team", name:"Coastal Emergency Squad", location:"Velachery, Chennai", skills:"Evacuation, structural triage", availability:"Mobile", phone:"+91 97800 1002", x:49, y:66},
    {id:"team-3", type:"Rescue team", name:"Kerala Rapid Response", location:"Fort Kochi, Kerala", skills:"Medical evacuation, debris clearance", availability:"On alert", phone:"+91 94400 1003", x:74, y:77},
    {id:"team-4", type:"Rescue team", name:"Green Valley Rescue", location:"Whitefield, Bengaluru", skills:"Power outage response, transport", availability:"Available in 30 min", phone:"+91 98000 1004", x:66, y:51}
  ];
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const CHAT_API_BASE_KEY = "resqnet.chatApiBase.v1";
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const now = () => new Date().toISOString();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtTime = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Unknown time" : d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); };
  const typePriority = type => ({SOS:1,MEDICAL:2,RESCUE:2,HAZARD:3,FOOD:4,WATER:4,SHELTER:4,OFFER:5,GENERAL:6}[type] || 6);
  let data = loadData();
  let modalMode = "request";
  let activeTarget = null;
  let recognition = null;
  let isDemo = false;
  let chatHistory = [];
  let chatApiBaseUrl = localStorage.getItem(CHAT_API_BASE_KEY) || "";

  function chatApiUrl(path) {
    return `${chatApiBaseUrl.replace(/\/+$/, "")}${path}`;
  }
  function setupChatApiSettings() {
    const form = $("#chatApiForm");
    const input = $("#chatApiUrl");
    const status = $("#chatApiSettingStatus");
    input.value = chatApiBaseUrl;
    status.textContent = chatApiBaseUrl ? `Using ${chatApiBaseUrl}` : "Using this app's server.";
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = input.value.trim().replace(/\/+$/, "");
      if (value) {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Use HTTPS for a remote server.");
        } catch (error) {
          status.textContent = error.message || "Enter a valid server URL.";
          return;
        }
      }
      chatApiBaseUrl = value;
      if (value) localStorage.setItem(CHAT_API_BASE_KEY, value);
      else localStorage.removeItem(CHAT_API_BASE_KEY);
      status.textContent = value ? `Using ${value}` : "Using this app's server.";
      updateChatStatus();
      toast("AI chat server setting saved on this device.", "success");
    });
  }
  async function getCurrentPosition(options) {
    const geolocation = window.Capacitor?.Plugins?.Geolocation;
    if (geolocation) {
      let permissions = await geolocation.checkPermissions();
      if (permissions.location !== "granted" && permissions.coarseLocation !== "granted") permissions = await geolocation.requestPermissions();
      if (permissions.location !== "granted" && permissions.coarseLocation !== "granted") throw new Error("Location permission was denied.");
      return geolocation.getCurrentPosition(options);
    }
    if (!navigator.geolocation) throw new Error("GPS is not available in this browser.");
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {profile:{name:"",area:""},language:"en-IN",messages:[],requests:[],offers:[],alerts:[],volunteers:DEFAULT_VOLUNTEERS,rescueTeams:DEFAULT_RESCUE_TEAMS,...saved};
    } catch {
      return {profile:{name:"",area:""},language:"en-IN",messages:[],requests:[],offers:[],alerts:[],volunteers:DEFAULT_VOLUNTEERS,rescueTeams:DEFAULT_RESCUE_TEAMS};
    }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { toast("Could not save data. Browser storage may be full.", "error"); }
    updateCounts();
  }
  function toast(message, kind="") {
    const el=document.createElement("div"); el.className=`toast ${kind}`; el.textContent=message;
    $("#toastRegion").append(el); setTimeout(()=>el.remove(),3800);
  }
  function updateCounts() {
    $("#savedCount").textContent=data.messages.length;
    $("#pendingCount").textContent=data.messages.filter(m=>!["ACKNOWLEDGED","DELIVERED"].includes(m.status)).length;
    $("#alertNavCount").textContent=data.alerts.length;
  }
  function setView(view) {
    $$(".page-view").forEach(p=>p.classList.toggle("hidden",p.dataset.page!==view));
    $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    const labels={overview:"Overview",alerts:"Emergency alerts",requests:"Community requests",offers:"Resource offers",volunteers:"Volunteer portal",messages:"Messages",devices:"Nearby devices",settings:"Settings & privacy"};
    $("#crumb").textContent=labels[view]||"Overview";
    $("#sidebar").classList.remove("open");
    renderAll();
  }
  function emptyState(title,desc) { return `<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(desc)}</p></div>`; }
  function tagFor(type) {
    const cls=["SOS","MEDICAL","RESCUE","HAZARD"].includes(type)?"tag-red":type==="OFFER"?"tag-green":"tag-amber";
    return `<span class="tag ${cls}">${esc(type||"GENERAL")}</span>`;
  }
  function iconFor(type) { return ({SOS:"!",MEDICAL:"+",RESCUE:"↗",HAZARD:"⚑",FOOD:"◉",WATER:"≈",SHELTER:"⌂",OFFER:"♡",GENERAL:"•"})[type]||"•"; }
  function renderActivity(items, target, emptyTitle, emptyText) {
    const el=$(target);
    if(!items.length){el.innerHTML=emptyState(emptyTitle,emptyText);return;}
    el.innerHTML=[...items].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8).map(m=>`
      <div class="activity-row"><div class="activity-icon ${["SOS","MEDICAL","RESCUE"].includes(m.type)?"red":m.type==="OFFER"?"green":"amber"}">${iconFor(m.type)}</div>
      <div class="activity-copy"><strong>${esc(m.title)}</strong><p>${esc(m.details||m.type)} · ${esc(m.sender||"Local user")}</p></div>
      <div class="activity-meta">${tagFor(m.type)}<small>${fmtTime(m.createdAt)}</small></div></div>`).join("");
  }
  function renderEntries(items,target,emptyTitle,emptyText,kind) {
    const el=$(target);
    if(!items.length){el.innerHTML=emptyState(emptyTitle,emptyText);return;}
    el.innerHTML=[...items].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(m=>`
      <div class="entry-row"><div class="activity-icon ${kind==="offer"?"green":["SOS","MEDICAL","RESCUE"].includes(m.type)?"red":"amber"}">${iconFor(m.type)}</div>
      <div class="activity-copy"><strong>${esc(m.title)}</strong><p>${esc(m.details||"No extra details provided.")}</p><p>${esc(m.sender||"Local user")} · ${esc(m.location||"Location not provided")} · ${fmtTime(m.createdAt)}</p></div>
      <div class="activity-meta">${tagFor(m.type)}<small>${esc(m.status||"SAVED LOCALLY")}</small></div>
      <div class="row-actions"><button class="small-button" data-speak="${esc(m.id)}">Read aloud</button><button class="small-button" data-delete="${esc(m.id)}" data-kind="${kind}">Delete</button></div></div>`).join("");
  }
  function renderAlerts() {
    const filter=$("#alertFilter")?.value||"all";
    const items=data.alerts.filter(a=>filter==="all"||a.type===filter);
    $("#alertSummary").textContent=`${items.length} alert${items.length===1?"":"s"} · stored locally`;
    renderEntries(items,"#alertsList","No alerts yet","Emergency alerts created on this device will appear here.","alert");
  }
  function renderMessages() {
    const items=[...data.messages].sort((a,b)=>typePriority(a.type)-typePriority(b.type)||new Date(b.createdAt)-new Date(a.createdAt));
    const el=$("#messagesList");
    if(!items.length){el.innerHTML=emptyState("No messages yet","Compose a message or create an alert. It will be stored on this device.");return;}
    el.innerHTML=items.map(m=>`<div class="entry-row"><div class="activity-icon ${m.type==="SOS"?"red":"blue"}">${iconFor(m.type)}</div><div class="activity-copy"><strong>${esc(m.title)}</strong><p>${esc(m.details||"No details")} · ${esc(m.sender||"Local user")}</p><p>${esc(m.location||"Location not provided")} · Priority ${typePriority(m.type)} · ${fmtTime(m.createdAt)}</p></div><div class="activity-meta">${tagFor(m.type)}<small>${esc(m.status)}</small></div><div class="row-actions"><button class="small-button" data-speak="${esc(m.id)}">Read aloud</button><button class="small-button" data-delete="${esc(m.id)}" data-kind="message">Delete</button></div></div>`).join("");
  }
  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function hasGpsCoordinates(item) {
    return Number.isFinite(Number(item.coordinates?.latitude)) && Number.isFinite(Number(item.coordinates?.longitude));
  }
  function formatCoordinates(coordinates) {
    return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
  }
  function distanceInKm(first, second) {
    const radians = degrees => degrees * Math.PI / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }
  function getNearbyVolunteers(locationText) {
    const volunteers = Array.isArray(data.volunteers) && data.volunteers.length ? data.volunteers : DEFAULT_VOLUNTEERS;
    const rescueTeams = Array.isArray(data.rescueTeams) && data.rescueTeams.length ? data.rescueTeams : DEFAULT_RESCUE_TEAMS;
    const target = normalizeText(locationText || data.profile.area || "Koramangala");
    const combined = [...volunteers.map(v => ({...v, kind:"Volunteer"})), ...rescueTeams.map(t => ({...t, kind:"Rescue team"}))];
    const base = combined.map(item => {
      const itemText = normalizeText(`${item.location} ${item.name}`);
      const score = target ? (itemText.includes(target) ? 40 : 0) + (target.split(" ").filter(Boolean).filter(token => itemText.includes(token)).length * 12) : 0;
      const dx = (Number(item.x) || 50) - (target.includes("chennai") ? 46 : target.includes("kochi") || target.includes("kerala") ? 72 : target.includes("bengaluru") || target.includes("koramangala") || target.includes("hsr") ? 60 : 50);
      const dy = (Number(item.y) || 50) - (target.includes("chennai") ? 68 : target.includes("kochi") || target.includes("kerala") ? 74 : target.includes("bengaluru") || target.includes("koramangala") || target.includes("hsr") ? 45 : 50);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gpsDistance = hasGpsCoordinates(item) && hasGpsCoordinates(data.profile) ? distanceInKm(item.coordinates, data.profile.coordinates) : null;
      return {...item, gpsDistance, score: score + Math.max(0, 80 - dist * 1.2)};
    });
    return base.sort((a, b) => {
      if (hasGpsCoordinates(data.profile)) {
        if (a.gpsDistance !== null && b.gpsDistance === null) return -1;
        if (a.gpsDistance === null && b.gpsDistance !== null) return 1;
        if (a.gpsDistance !== null && b.gpsDistance !== null) return a.gpsDistance - b.gpsDistance;
      }
      return b.score - a.score;
    }).slice(0, 6);
  }
  function renderVolunteers() {
    const lists=$$(".volunteer-list");
    if(!lists.length) return;
    const volunteers = Array.isArray(data.volunteers) && data.volunteers.length ? data.volunteers : DEFAULT_VOLUNTEERS;
    const rescueTeams = Array.isArray(data.rescueTeams) && data.rescueTeams.length ? data.rescueTeams : DEFAULT_RESCUE_TEAMS;
    const items = [...volunteers.map(v => ({...v, kind:"Volunteer"})), ...rescueTeams.map(t => ({...t, kind:"Rescue team"}))];
    const cards = items.slice(0,8).map(v => `
      <article class="volunteer-card ${v.type === "Rescue team" ? "rescue-card" : ""}">
        <div class="volunteer-head">
          <div class="volunteer-badge ${v.kind === "Rescue team" ? "team-badge" : ""}">${esc((v.name || v.type).split(" ").map(part => part[0]).slice(0,2).join(""))}</div>
          <div>
            <strong>${esc(v.name)}</strong>
            <small>${esc(v.type)} · ${esc(v.location)}</small>
            ${hasGpsCoordinates(v) ? `<small>GPS: ${formatCoordinates(v.coordinates)} · <a href="https://www.openstreetmap.org/?mlat=${v.coordinates.latitude}&mlon=${v.coordinates.longitude}#map=16/${v.coordinates.latitude}/${v.coordinates.longitude}" target="_blank" rel="noopener">Open map</a></small>` : "<small>GPS not shared</small>"}
          </div>
        </div>
        <p>${esc(v.skills)}</p>
        <div class="volunteer-meta">
          <span>${esc(v.availability)}</span>
          <a href="tel:${esc(v.phone || "")}">${esc(v.phone || "Phone not shared")}</a>
        </div>
        <button class="small-button call-button" data-call="${esc(v.phone || "")}">${v.kind === "Rescue team" ? "Call rescue team" : "Call volunteer"}</button>
      </article>
    `).join("");
    lists.forEach(el => { el.innerHTML = cards; });
    const mapEl=$("#nearbyMap");
    const mapList=$("#nearbyMapList");
    if(!mapEl || !mapList) return;
    const locationText = $("#entryLocation")?.value || data.profile.area || "Koramangala, Bengaluru";
    const nearby = getNearbyVolunteers(locationText);
    const gpsItems = nearby.filter(hasGpsCoordinates);
    const points = [...gpsItems.map(item => item.coordinates), ...(hasGpsCoordinates(data.profile) ? [data.profile.coordinates] : [])];
    const bounds = points.length ? {
      minLat: Math.min(...points.map(point => point.latitude)), maxLat: Math.max(...points.map(point => point.latitude)),
      minLon: Math.min(...points.map(point => point.longitude)), maxLon: Math.max(...points.map(point => point.longitude))
    } : null;
    const project = coordinates => ({
      x: 15 + ((coordinates.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * 70,
      y: 85 - ((coordinates.latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 70
    });
    const mapPins = gpsItems.map(v => {
      const point = project(v.coordinates);
      const markerClass = v.kind === "Rescue team" ? "map-pin rescue-pin" : "map-pin volunteer-pin";
      return `<div class="${markerClass}" style="left:${point.x}%; top:${point.y}%"><span>${esc(v.name.split(" ")[0])}</span></div>`;
    }).join("");
    const centerPoint = hasGpsCoordinates(data.profile) ? project(data.profile.coordinates) : null;
    const center = centerPoint ? `<div class="map-center-marker" style="left:${centerPoint.x}%; top:${centerPoint.y}%"><strong>Your GPS</strong></div>` : "";
    mapEl.innerHTML = `${center}${mapPins}${gpsItems.length ? "" : '<p class="map-empty">Responder GPS locations will appear when shared from their devices.</p>'}`;
    mapList.innerHTML = nearby.map(v => `
      <li>
        <strong>${esc(v.name)}</strong>
        <span>${esc(v.type)} · ${esc(v.location)}</span>
        <small>${esc(v.skills)}</small>
        ${hasGpsCoordinates(v) ? `<small>GPS: ${formatCoordinates(v.coordinates)}${v.gpsDistance !== null ? ` · ${v.gpsDistance.toFixed(1)} km away` : ""}</small><a href="https://www.openstreetmap.org/?mlat=${v.coordinates.latitude}&mlon=${v.coordinates.longitude}#map=16/${v.coordinates.latitude}/${v.coordinates.longitude}" target="_blank" rel="noopener">Open map</a>` : "<small>GPS not shared</small>"}
        <button class="small-button call-button" data-call="${esc(v.phone || "")}">Call</button>
      </li>
    `).join("");
    const mapAreaLabel = $("#mapAreaLabel");
    if (mapAreaLabel) mapAreaLabel.textContent = `${gpsItems.length} responder GPS location${gpsItems.length === 1 ? "" : "s"} shared`;
  }
  function renderAll() {
    renderActivity([...data.alerts,...data.requests,...data.offers],"#recentActivity","No community activity yet","Create an alert, request, or resource offer to get started.");
    renderAlerts();
    renderEntries(data.requests,"#requestsList","No requests recorded","Requests created on this device will appear here.","request");
    renderEntries(data.offers,"#offersList","No resources offered yet","Add an offer to let your community know what you can provide.","offer");
    renderMessages();
    renderVolunteers();
    updateCounts();
  }
  function populateLanguages() {
    const options=LANGUAGES.map(([label,code])=>`<option value="${code}">${esc(label)}</option>`).join("");
    $("#languageSelect").innerHTML=options;
    $("#formLanguage").innerHTML=options;
    $("#languageSelect").value=data.language||"en-IN";
    $("#formLanguage").value=data.language||"en-IN";
    $("#languageSelect").addEventListener("change",e=>{data.language=e.target.value;persist();$("#formLanguage").value=data.language;updateVoiceSupport();});
    $("#formLanguage").addEventListener("change",e=>{data.language=e.target.value;$("#languageSelect").value=data.language;persist();updateVoiceSupport();});
  }
  function speechSynthesisAvailable(){return "speechSynthesis" in window;}
  function updateVoiceSupport() {
    const rec=("SpeechRecognition" in window)||("webkitSpeechRecognition" in window);
    const synth=speechSynthesisAvailable();
    $("#voiceSupport").textContent=`Speech input: ${rec?"browser API available; language coverage varies":"not supported by this browser"}. Spoken output: ${synth?"available; installed voices vary":"not supported"}.`;
    $("#voiceHelpBtn").title=rec?"Voice input available where supported":"Voice input not supported by this browser";
    $("#voiceNote").textContent=rec?"Voice recognition depends on browser, operating system, language availability, and sometimes an internet connection. You can always type instead.":"This browser does not provide speech recognition. Typing is available; spoken output may still work.";
  }
  function speak(text,lang=data.language) {
    if(!speechSynthesisAvailable()){toast("Spoken output is not supported by this browser.","error");return;}
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=lang;
    utterance.rate=0.94;
    const voices=window.speechSynthesis.getVoices();
    const voice=voices.find(v=>v.lang.toLowerCase()===lang.toLowerCase())||voices.find(v=>v.lang.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()));
    if(voice) utterance.voice=voice;
    utterance.onerror=()=>toast("The selected language voice may not be installed on this device.","error");
    window.speechSynthesis.speak(utterance);
  }
  function startVoice(targetSelector) {
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){toast("Voice input is not supported here. Please type your message or try a supported browser.","error");return;}
    if(recognition){try{recognition.stop();}catch{} recognition=null;}
    const input=$(targetSelector);
    recognition=new SpeechRecognition();
    recognition.lang=$("#formLanguage").value||data.language||"en-IN";
    recognition.continuous=false;
    recognition.interimResults=false;
    recognition.maxAlternatives=1;
    const oldText=input.value;
    toast(`Listening in ${recognition.lang}. Speak now.`);
    recognition.onresult=event=>{
      const transcript=event.results?.[0]?.[0]?.transcript||"";
      input.value=(oldText.trim()?oldText.trim()+" ":"")+transcript;
      input.dispatchEvent(new Event("input",{bubbles:true}));
      toast("Voice text added. Please review it before saving.","success");
    };
    recognition.onerror=event=>toast(`Voice input error: ${event.error||"unknown error"}. You can type instead.`,"error");
    recognition.onend=()=>{recognition=null;};
    try{recognition.start();}catch{toast("Could not start voice input. Check browser permissions and try again.","error");}
  }
  function openModal(mode) {
    modalMode=mode;
    const titles={sos:"Create an emergency alert",request:"Create a help request",offer:"Offer a community resource",message:"Compose a message"};
    const options=mode==="sos"?["SOS","MEDICAL","RESCUE","HAZARD"]:mode==="request"?REQUEST_TYPES:mode==="offer"?["OFFER","FOOD","WATER","SHELTER","MEDICAL","GENERAL"]:TYPES;
    $("#modalTitle").textContent=titles[mode]||"Create an entry";
    $("#modalEyebrow").textContent=mode==="sos"?"URGENT RESPONSE":"COMMUNITY SUPPORT";
    $("#entryType").innerHTML=options.map(t=>`<option value="${t}">${t.charAt(0)+t.slice(1).toLowerCase()}</option>`).join("");
    $("#entryTitle").value="";$("#entryDetails").value="";$("#entryLocation").value=data.profile.area||"";
    $("#modalBackdrop").classList.remove("hidden");
    setTimeout(()=>$("#entryTitle").focus(),50);
  }
  function closeModal(){ $("#modalBackdrop").classList.add("hidden"); }
  function saveEntry(event) {
    event.preventDefault();
    const type=$("#entryType").value;
    const title=$("#entryTitle").value.trim();
    const details=$("#entryDetails").value.trim();
    const location=$("#entryLocation").value.trim() || data.profile.area || "Location not provided";
    if(!title){toast("Please add a short title.","error");return;}
    const item={id:uid(),type,title,details,location,sender:data.profile.name||"Local user",area:data.profile.area||"",createdAt:now(),priority:typePriority(type),hopCount:0,ttl:10,status:"QUEUED",deliveryNote:"Saved on this device; not sent to a peer."};
    data.messages.unshift(item);
    if(modalMode==="sos") data.alerts.unshift(item);
    else if(modalMode==="request") data.requests.unshift(item);
    else if(modalMode==="offer") data.offers.unshift({...item,status:"AVAILABLE LOCALLY"});
    else if(["SOS","MEDICAL","RESCUE","HAZARD"].includes(type)) data.alerts.unshift(item);
    persist();closeModal();renderAll();
    toast("Saved on this device. No recipient has been contacted.","success");
    setView(modalMode==="sos"?"alerts":modalMode==="request"?"requests":modalMode==="offer"?"offers":"messages");
    if(modalMode==="sos") speak(`Emergency alert created at ${location}. ${title}`,data.language);
  }
  function deleteEntry(id,kind) {
    if(!confirm("Delete this locally stored item?"))return;
    const match=m=>m.id!==id;
    data.messages=data.messages.filter(match);
    data.alerts=data.alerts.filter(match);
    data.requests=data.requests.filter(match);
    data.offers=data.offers.filter(match);
    persist();renderAll();toast("Item deleted from this device.");
  }
  function readItem(id) {
    const all=[...data.messages,...data.alerts,...data.requests,...data.offers];
    const item=all.find(x=>x.id===id);
    if(item)speak(`${item.type}. ${item.title}. ${item.details||""}`,data.language);
  }
  function setupProfile() {
    $("#userName").value=data.profile.name||"";
    $("#userArea").value=data.profile.area||"";
    $("#profileForm").addEventListener("submit",e=>{
      e.preventDefault();data.profile.name=$("#userName").value.trim();data.profile.area=$("#userArea").value.trim();persist();toast("Profile saved on this device.","success");
    });
    $("#profileBtn").addEventListener("click",()=>setView("settings"));
  }
  async function detectLiveLocation() {
    toast("Getting your live location…");
    try {
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        const { latitude, longitude } = position.coords;
        data.profile.coordinates = { latitude, longitude, accuracy: position.coords.accuracy, updatedAt: now() };
        const locationText = `Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`;
        $("#entryLocation").value = locationText;
        data.profile.area = locationText;
        persist();
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
          const json = await response.json();
          const place = json?.address ? [json.address.city || json.address.town || json.address.village || json.address.suburb, json.address.state || ""].filter(Boolean).join(", ") : "Current GPS location";
          $("#entryLocation").value = place || locationText;
          data.profile.area = place || locationText;
          persist();
        } catch {
          $("#entryLocation").value = locationText;
        }
        renderAll();
        toast("Live GPS location added to the complaint.","success");
    } catch (error) {
      toast(`${error.message || "Location access failed."} You can type the area manually.`, "error");
    }
  }
  function setupVolunteerPortal() {
    const form=$("#volunteerForm");
    if(!form) return;
    let gpsCoordinates = null;
    $("#volunteerGpsBtn").addEventListener("click", async () => {
      const status = $("#volunteerGpsStatus");
      status.textContent = "Getting this device's location…";
      try {
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        gpsCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: now()
        };
        status.textContent = `GPS captured: ${formatCoordinates(gpsCoordinates)} (accuracy ±${Math.round(gpsCoordinates.accuracy)} m)`;
      } catch (error) {
        status.textContent = `${error.message || "Could not get GPS location."} You can still enter an area manually.`;
      }
    });
    form.addEventListener("submit",e=>{
      e.preventDefault();
      const type=$("#volunteerType").value;
      const name=$("#volunteerName").value.trim();
      const location=$("#volunteerLocation").value.trim();
      const skills=$("#volunteerSkills").value.trim();
      const availability=$("#volunteerAvailability").value.trim();
      const phone=$("#volunteerPhone").value.trim();
      if(!name || !location || !skills){toast("Please fill in the volunteer name, location, and skills.","error"); return;}
      const responder={id:uid(),type,name,location,skills,availability:availability||"Available when needed",phone:phone||"Phone not shared",...(gpsCoordinates ? {coordinates:gpsCoordinates} : {})};
      if(type === "Rescue team") data.rescueTeams=[responder,...(Array.isArray(data.rescueTeams)?data.rescueTeams:[])];
      else data.volunteers=[responder,...(Array.isArray(data.volunteers)?data.volunteers:[])];
      persist();renderAll();form.reset();gpsCoordinates=null;$("#volunteerGpsStatus").textContent="GPS coordinates not added.";toast(`${type} added to the local portal.`,"success");
    });
  }
  function exportData() {
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="resqnet-local-data.json";a.click();URL.revokeObjectURL(url);
    toast("Local data export prepared.","success");
  }
  function addChatMessage(role, text) {
    chatHistory.push({role, text});
    const messages = $("#chatMessages");
    messages.insertAdjacentHTML("beforeend", `<div class="chat-message ${role}"><span>${role === "assistant" ? "AI assistant" : "You"}</span><p>${esc(text)}</p></div>`);
    messages.scrollTop = messages.scrollHeight;
  }
  function setChatSuggestions(suggestions) {
    $("#chatSuggestions").innerHTML = suggestions.map(text => `<button type="button" data-chat-prompt="${esc(text)}">${esc(text)}</button>`).join("");
  }
  function setChatBusy(busy) {
    const submitButton = $("#chatForm button[type='submit']");
    $("#chatInput").disabled = busy;
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "…" : "Send";
    $$("#chatSuggestions button").forEach(button => { button.disabled = busy; });
    if (busy) {
      const pending = document.createElement("div");
      pending.className = "chat-message assistant chat-pending";
      pending.textContent = "AI assistant is responding…";
      $("#chatMessages").append(pending);
      $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
    } else {
      $(".chat-pending")?.remove();
    }
  }
  async function submitChatMessage(message) {
    const text = message.trim();
    if (!text) return;
    addChatMessage("user", text);
    setChatBusy(true);
    try {
      const response = await fetch(chatApiUrl("/api/chat"), {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({messages:chatHistory.slice(-12).map(message => ({role:message.role,content:message.text}))})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI assistant is unavailable.");
      addChatMessage("assistant", result.reply);
      setChatSuggestions(["Someone is injured","There is fire or smoke","I am waiting for help"]);
    } catch (error) {
      addChatMessage("assistant", `${error.message} If anyone is in immediate danger, call local emergency services directly.`);
    } finally {
      setChatBusy(false);
    }
  }
  async function updateChatStatus() {
    const status = $("#chatStatus");
    try {
      const response = await fetch(chatApiUrl("/api/health"));
      if (!response.ok) throw new Error("AI service unavailable");
      const result = await response.json();
      status.textContent = result.configured ? `Gemini ready · ${result.model}` : "Set GOOGLE_API_KEY to enable Gemini";
    } catch {
      status.textContent = "Gemini unavailable · run with node server.js";
    }
  }
  function setChatOpen(open) {
    const panel = $("#chatPanel");
    panel.classList.toggle("hidden", !open);
    panel.setAttribute("aria-hidden", String(!open));
    $("#chatToggle").setAttribute("aria-expanded", String(open));
    if (open) $("#chatInput").focus();
  }
  function setupChatGuide() {
    addChatMessage("assistant", "Tell me what is happening and I can suggest general safety steps while you wait. I cannot see your location or contact rescuers. If anyone is in immediate danger, call local emergency services now. What is happening?");
    setChatSuggestions(["Someone is injured","There is fire or smoke","I am trapped","I am waiting for help"]);
    updateChatStatus();
  }
  function setupEvents() {
    $$(".nav-item[data-view], [data-view].text-button").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
    $("#menuToggle").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
    $("#openSos").addEventListener("click",()=>openModal("sos"));
    $("#openSosTop").addEventListener("click",()=>openModal("sos"));
    $("#openSosAlerts").addEventListener("click",()=>openModal("sos"));
    $("#newRequest").addEventListener("click",()=>openModal("request"));
    $("#newOffer").addEventListener("click",()=>openModal("offer"));
    $("#newMessage").addEventListener("click",()=>openModal("message"));
    $("#closeModal").addEventListener("click",closeModal);
    $("#cancelModal").addEventListener("click",closeModal);
    $("#modalBackdrop").addEventListener("click",e=>{if(e.target===$("#modalBackdrop"))closeModal();});
    $("#entryForm").addEventListener("submit",saveEntry);
    $("#voiceTitle").addEventListener("click",()=>startVoice("#entryTitle"));
    $("#voiceDetails").addEventListener("click",()=>startVoice("#entryDetails"));
    $("#speakForm").addEventListener("click",()=>speak(`${$("#entryTitle").value}. ${$("#entryDetails").value}`,$("#formLanguage").value));
    $("#voiceHelpBtn").addEventListener("click",()=>{setView("settings");toast("Choose a language, then test speech input or spoken output.");});
    $("#testVoice").addEventListener("click",()=>speak("This is a RESQNET voice test. Please check that the language sounds correct.",data.language));
    $("#stopVoice").addEventListener("click",()=>{if(speechSynthesisAvailable())speechSynthesis.cancel();if(recognition){try{recognition.stop();}catch{}recognition=null;}toast("Voice activity stopped.");});
    $("#gpsLocationBtn")?.addEventListener("click", detectLiveLocation);
    $("#alertFilter").addEventListener("change",renderAlerts);
    $("#volunteerQuickLink")?.addEventListener("click",()=>setView("volunteers"));
    $("#demoToggle").addEventListener("click",()=>{isDemo=!isDemo;$("#demoToggle").textContent=isDemo?"Disable demo workflow":"Enable demo workflow";$("#demoStatus").textContent=isDemo?"Demo workflow is active. Sample messages are labelled DEMO and do not represent real people or deliveries.":"Demo workflow is off. No real peer connection is active.";$("#modeLabel").textContent=isDemo?"Demo mode":"Local mode";toast(isDemo?"Demo workflow enabled. No real devices are connected.":"Demo workflow disabled.");});
    $("#connectionInfo").addEventListener("click",()=>alert("For a real multi-hop offline network, use a native Android app with a tested Bluetooth or Wi-Fi Direct transport. Browser support varies and this web prototype does not implement real peer-to-peer relay."));
    $("#exportData").addEventListener("click",exportData);
    $("#chatToggle").addEventListener("click",()=>setChatOpen(true));
    $("#chatClose").addEventListener("click",()=>setChatOpen(false));
    $("#chatForm").addEventListener("submit",async event=>{
      event.preventDefault();
      if ($("#chatForm button[type='submit']").disabled) return;
      const message = $("#chatInput").value;
      $("#chatInput").value="";
      await submitChatMessage(message);
    });
    $("#chatSuggestions").addEventListener("click",event=>{
      const prompt=event.target.closest("[data-chat-prompt]");
      if(prompt && !$("#chatForm button[type='submit']").disabled) submitChatMessage(prompt.dataset.chatPrompt);
    });
    $("#chatSosBtn").addEventListener("click",()=>openModal("sos"));
    $("#clearData").addEventListener("click",()=>{if(confirm("Permanently delete this app's locally stored messages, requests, offers, and profile?")){localStorage.removeItem(STORAGE_KEY);data=loadData();setupProfile();persist();renderAll();toast("Local data deleted.","success");}});
    $("#content").addEventListener("click",e=>{
      const viewBtn=e.target.closest("[data-action]");
      if(viewBtn){const a=viewBtn.dataset.action;openModal(a==="request"?"request":a==="offer"?"offer":"message");if(a==="voice")setTimeout(()=>startVoice("#entryTitle"),200);return;}
      const speakBtn=e.target.closest("[data-speak]");
      if(speakBtn){readItem(speakBtn.dataset.speak);return;}
      const delBtn=e.target.closest("[data-delete]");
      if(delBtn){deleteEntry(delBtn.dataset.delete,delBtn.dataset.kind);return;}
      const callBtn=e.target.closest("[data-call]");
      if(callBtn){
        const phone=callBtn.dataset.call;
        if(phone){ window.location.href = `tel:${phone}`; }
      }
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();setChatOpen(false);$("#sidebar").classList.remove("open");}});
  }
  function init() {
    populateLanguages();setupProfile();setupVolunteerPortal();setupChatApiSettings();setupEvents();setupChatGuide();updateVoiceSupport();renderAll();
    if(speechSynthesisAvailable()) speechSynthesis.onvoiceschanged=()=>updateVoiceSupport();
    if(!("SpeechRecognition" in window)&&!("webkitSpeechRecognition" in window)) $("#voiceHelpBtn").style.opacity=".65";
  }
  init();
})();