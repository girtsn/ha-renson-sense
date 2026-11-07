/* Renson Sense / Waves integration-managed Ventilation panel.
 * All entities are discovered through Home Assistant's registries, so this
 * works with multiple devices, customized entity IDs, and normal HACS updates.
 * Sensor values and history come exclusively from Home Assistant.
 */
const RV_PANEL_VERSION="0.3.4";
const RV_PICKER_NAME="renson-ventilation-date-range-v"+RV_PANEL_VERSION.replace(/\./g,"-");
const RV_METRICS=[
  {key:"airflow",label:"Airflow",unit:"m³/h"},
  {key:"ventilation_level",label:"Ventilation level",unit:"%"},
  {key:"humidity",label:"Relative humidity",unit:"%"},
  {key:"temperature",label:"Temperature",unit:"°C"},
  {key:"voc_estimated",label:"Estimated VOC index",unit:""},
  {key:"voc",label:"Raw VOC",unit:""},
  {key:"fan_rpm",label:"Fan speed",unit:"rpm"},
  {key:"pressure",label:"Live pressure",unit:"Pa"},
];
const rvRecorderPeriod=range=>{
  const days=(Date.parse(range.end)-Date.parse(range.start))/86400000;
  if(days<=3)return "5minute";
  if(days<=14)return "hour";
  if(days<=180)return "day";
  if(days<=550)return "week";
  return "month";
};
let rvPresetRange=null;
const RV_COLORS=["#377dd2","#e18a32","#1a997c","#9b6ec8","#b9505b"];
const RV_LIVE=[
  ["airflow","Airflow","m³/h"],["ventilation_level","Ventilation","%"],
  ["fan_rpm","Fan speed","rpm"],["humidity","Humidity","%"],
  ["temperature","Temperature","°C"],["voc_estimated","Estimated VOC","index"],
];

class RensonManagedVentilationPanel extends HTMLElement{
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this._hass=null;
    this._panel=null;
    this._loading=false;
    this._registered=false;
    this._devices=[];
    this._byKey=new Map();
    this._busy=new Set();
    this._prefs=new Map();
    this._notice="";
    this._registryError="";
    this._range=null;this._selectedDevice="all";
    this._assetsReady=false;this._assetPromise=null;
    this._assetError="";this._assetRetries=0;
    this._history={};this._historyError="";this._historyLoading=false;
    this._historyToken=0;this._historyRefresh=0;this._historyPeriod="hour";
  }
  set hass(hass){
    this._hass=hass;
    if(!this._assetsReady){
      this._ensureAssets();return;
    }
    if(!this._registered&&!this._loading&&this.isConnected)this._loadRegistry();
    else{
      this._updateLive();
      if(this._registered&&!this._historyLoading&&!this._busy.size&&
         Date.now()-this._historyRefresh>15*60000)this._loadHistory();
    }
  }
  set panel(panel){this._panel=panel;}
  set narrow(value){this._narrow=!!value;}
  set route(value){this._route=value;}
  connectedCallback(){
    this._ensureAssets();
    if(this._assetsReady&&this._hass&&!this._registered&&!this._loading)
      this._loadRegistry();
  }
  _ensureAssets(){
    if(this._assetsReady||this._assetPromise||!this.isConnected)return;
    this._assetError="";
    const retry=this._assetRetries?"&retry="+this._assetRetries:"";
    this._assetPromise=import(
      "./renson-ventilation-date-range-picker.js?v="+RV_PANEL_VERSION+retry
    ).then(module=>{
      rvPresetRange=module.rvPresetRange;
      if(typeof rvPresetRange!=="function")throw Error("Date selector export unavailable");
      this._range??=rvPresetRange("last7");
      this._assetsReady=true;
      if(this._hass&&!this._registered&&!this._loading)this._loadRegistry();
    }).catch(err=>{
      this._assetRetries++;
      this._assetError="Date selector did not load: "+(err?.message||String(err));
    }).finally(()=>{
      this._assetPromise=null;
      if(this._hass&&this.isConnected)this._render();
    });
  }
  _el(tag,text,css){
    const el=document.createElement(tag);
    if(text!==undefined&&text!==null)el.textContent=String(text);
    if(css)el.className=css;
    return el;
  }
  _button(text,fn,css){
    const el=this._el("button",text,css||"");
    el.type="button";
    el.addEventListener("click",fn);
    return el;
  }
  _metric(key){return RV_METRICS.find(m=>m.key===key);}
  _fmt(raw,unit=""){
    const val=Number(raw);
    if(raw===undefined||raw===null||raw===""||["unknown","unavailable","none"].includes(String(raw).toLowerCase())||!Number.isFinite(val))
      return "—";
    const digits=Math.abs(val)<10?2:Math.abs(val)<100?1:0;
    return val.toLocaleString(undefined,{maximumFractionDigits:digits})+(unit?" "+unit:"");
  }
  _state(dev,key){
    const id=dev.entities[key];
    return id?this._hass?.states?.[id]:null;
  }
  _value(dev,key){
    return this._state(dev,key)?.state;
  }
  _entity(dev,key){return dev.entities[key]||null;}
  _displayName(device){
    return device.name_by_user||device.name||device.id;
  }
  _normalizeHost(address){
    // A host/IP from either the state machine or the device registry is data,
    // never trusted HTML. Only HTTP host[:port] input is accepted.
    if(typeof address!=="string")return null;
    const host=address.trim();
    const valid=/^(?:[A-Za-z0-9.-]+(?::[0-9]{1,5})?|\[[0-9a-fA-F:]+\](?::[0-9]{1,5})?)$/;
    if(["unknown","unavailable","none"].includes(host.toLowerCase())||
       !valid.test(host))return null;
    return host;
  }
  _configuredHost(dev){
    // The configured-host diagnostic entity might be disabled or not yet
    // registered. DeviceInfo.configuration_url is populated directly from
    // the config entry, so use it as the independent read-only fallback.
    const sensorHost=this._normalizeHost(this._value(dev,"configured_host"));
    if(sensorHost)return sensorHost;
    const link=dev.registry?.configuration_url;
    if(typeof link!=="string")return null;
    try{
      const url=new URL(link);
      if(!["http:","https:"].includes(url.protocol)||url.username||url.password)
        return null;
      return this._normalizeHost(url.host);
    }catch(_err){return null;}
  }
  _addressLink(address){
    const host=this._normalizeHost(address);
    if(!host)return null;
    const link=this._el("a",host,"device-address");
    link.href="http://"+host+"/";
    link.target="_blank";
    link.rel="noopener noreferrer";
    link.title="Open the device address in a new tab (a web interface may not be available)";
    return link;
  }
  _registryKey(entry, configEntryId){
    // Each integration entity has unique_id "<config entry id>_<exact key>".
    // Suffix matching was unsafe: breeze_temperature also ends in
    // "_temperature" and overwrote the real air temperature with 30°C.
    if(typeof configEntryId!=="string"||!configEntryId)return null;
    const prefix=configEntryId+"_";
    const uid=String(entry.unique_id||"");
    if(!uid.startsWith(prefix))return null;
    const key=uid.slice(prefix.length);
    const known=[
      "voc_estimated","ventilation_level","silent_mode_switch",
      "ventilation_boost","configured_host","boost_remaining",
      "boost_active","nominal_airflow","minimum_airflow","fan_rpm",
      "fan_pwm","wifi_ip","wifi_ssid","wifi_mac","rssi","pressure",
      "humidity","temperature","airflow","voc","uptime",
    ];
    return known.includes(key)?key:null;
  }
  async _loadRegistry(){
    if(!this._hass||this._loading)return;
    this._loading=true;this._render();
    try{
      const [allDevices,allEntities]=await Promise.all([
        this._hass.callWS({type:"config/device_registry/list"}),
        this._hass.callWS({type:"config/entity_registry/list"}),
      ]);
      const rensonDevices=(allDevices||[]).filter(d=>
        (d.identifiers||[]).some(id=>Array.isArray(id)&&id[0]==="renson_sense")
      ).sort((a,b)=>this._displayName(a).localeCompare(this._displayName(b)));
      this._devices=rensonDevices.map(device=>{
        // The device registry identifier contains the actual HA config entry
        // ID, which all Renson entity unique IDs share as their prefix.
        const configEntryId=(device.identifiers||[])
          .find(pair=>Array.isArray(pair)&&pair[0]==="renson_sense")?.[1];
        const reg=(allEntities||[]).filter(entity=>
          entity.platform==="renson_sense"&&entity.device_id===device.id
        );
        const entities={};
        for(const e of reg){
          const key=this._registryKey(e,configEntryId);
          if(key&&e.entity_id)entities[key]=e.entity_id;
        }
        return {key:device.id,name:this._displayName(device),entities,registry:device};
      });
      this._byKey=new Map(this._devices.map(dev=>[dev.key,dev]));
      this._registryError="";
      this._registered=true;
    }catch(err){
      this._registryError="Could not read Renson device/entity registries: "+
        (err?.message||String(err));
      this._registered=false;
    }finally{
      this._loading=false;this._render();
      if(this._registered)this._loadHistory();
    }
  }
  _noticeText(message){
    this._notice=message;
    const node=this.shadowRoot?.querySelector("[data-notice]");
    if(node)node.textContent=message;
  }
  _confirmAction(dev,what,detail){
    return window.confirm(
      dev.name+"\n\n"+what+"\n"+detail+"\n\nContinue?"
    );
  }
  async _execute(dev,service,domain,data,target,verb){
    if(this._busy.has(dev.key))return;
    this._busy.add(dev.key);this._updateLive();
    this._noticeText(verb+" requested for "+dev.name+"…");
    try{
      await this._hass.callService(domain,service,data,{entity_id:target});
      this._noticeText(verb+" request acknowledged for "+dev.name+
        ". Check the device state to confirm the result.");
    }catch(err){
      this._noticeText("Could not confirm "+verb.toLowerCase()+" for "+dev.name+
        ": "+(err?.message||String(err))+
        (["calibrate","restart_device"].includes(service)?
          ". The device may have started the operation. Check before retrying.":""));
    }finally{
      this._busy.delete(dev.key);
      this._updateLive();
    }
  }
  _prefsFor(dev){
    if(!this._prefs.has(dev.key))this._prefs.set(dev.key,{level:100,duration:900});
    return this._prefs.get(dev.key);
  }
  _startBoost(dev){
    const fan=this._entity(dev,"ventilation_boost");
    if(!fan)return;
    const prefs=this._prefsFor(dev);
    if(!this._confirmAction(dev,"Start temporary boost",
        prefs.level+"% for "+Math.round(prefs.duration/60)+" minutes. "+
        "The ventilator returns to automatic ventilation after the timer."))return;
    this._execute(dev,"start_boost","renson_sense",
      {level:prefs.level,duration:prefs.duration},fan,"Boost");
  }
  _stopBoost(dev){
    const fan=this._entity(dev,"ventilation_boost");
    if(!fan)return;
    if(!this._confirmAction(dev,"Cancel ventilation boost",
      "Normal automatic ventilation continues; minimum airflow does not stop."))return;
    this._execute(dev,"turn_off","fan",{},fan,"Cancel boost");
  }
  _toggleSilent(dev){
    const entity=this._entity(dev,"silent_mode_switch");
    if(!entity)return;
    const on=this._value(dev,"silent_mode_switch")==="on";
    const goal=on?"Disable silent-mode schedule":"Enable silent-mode schedule";
    if(!this._confirmAction(dev,goal,
      "The device's existing weekly schedule will be preserved."))return;
    this._execute(dev,on?"turn_off":"turn_on","switch",{},
      entity,goal);
  }
  _maintenance(dev,command){
    const fan=this._entity(dev,"ventilation_boost");
    if(!fan)return;
    const isCalibration=command==="calibrate";
    const word=isCalibration?"CALIBRATE":"RESTART";
    const detail=isCalibration?
      "This recalibrates the ventilation duct pressure loss and can change airflow behaviour. "+
      "Use only when present at the device and prepared according to Renson's instructions.":
      "This restarts the ventilator and temporarily interrupts ventilation control and reporting.";
    const typed=window.prompt(
      dev.name+"\n\n"+detail+"\n\nType "+word+" to confirm:", ""
    );
    if(typed!==word){
      if(typed!==null)this._noticeText("Maintenance command not sent: confirmation did not match "+word+".");
      return;
    }
    this._execute(dev,command==="calibrate"?"calibrate":"restart_device",
      "renson_sense",{confirmation:word},fan,
      isCalibration?"Calibration":"Restart");
  }
  _controlRow(dev){
    const block=this._el("article",null,"device-card");
    const header=this._el("div",null,"device-head");
    const name=this._el("div");
    name.append(this._el("h2",dev.name),this._el("p",null,"subtle"));
    const note=name.querySelector("p");
    note.dataset.ipLink=dev.key+"|configured_host";
    note.textContent="Renson Sense / Waves";
    header.append(name);
    const boost=this._el("span",null,"status-pill");boost.dataset.live=dev.key+"|boost_status";
    header.append(boost);
    block.append(header);
    const values=this._el("div",null,"readings");
    for(const [key,label,unit] of RV_LIVE){
      if(!this._entity(dev,key))continue;
      const tile=this._el("div",null,"tile");
      tile.append(this._el("small",label),this._el("strong",null,"value"));
      tile.querySelector("strong").dataset.live=dev.key+"|"+key;
      if(key==="voc_estimated")tile.title="Experimental unitless Renson app-style estimate, not a gas concentration or safety measurement";
      values.append(tile);
    }
    block.append(values);
    if(this._entity(dev,"ventilation_boost")){
      const prefs=this._prefsFor(dev);
      const controls=this._el("div",null,"controls");
      const levelLabel=this._el("label","Boost level");
      const level=this._el("select");
      for(const v of [25,50,75,100,150,200]){
        const opt=this._el("option",v+"%");
        opt.value=String(v);if(v===prefs.level)opt.selected=true;
        level.append(opt);
      }
      level.addEventListener("change",()=>{prefs.level=Number(level.value);});
      levelLabel.append(level);
      const durationLabel=this._el("label","Duration");
      const duration=this._el("select");
      for(const minutes of [2,5,10,15,30,60]){
        const opt=this._el("option",minutes+" min");
        opt.value=String(minutes*60);if(minutes*60===prefs.duration)opt.selected=true;
        duration.append(opt);
      }
      duration.addEventListener("change",()=>{prefs.duration=Number(duration.value);});
      durationLabel.append(duration);
      controls.append(levelLabel,durationLabel);
      const start=this._button("Start boost",()=>this._startBoost(dev),"primary");
      const stop=this._button("Stop boost",()=>this._stopBoost(dev));
      start.dataset.actionDevice=dev.key;stop.dataset.actionDevice=dev.key;
      start.dataset.startBoost=dev.key;stop.dataset.stopBoost=dev.key;
      controls.append(start,stop);
      if(this._entity(dev,"silent_mode_switch")){
        const silent=this._button("Silent mode",()=>this._toggleSilent(dev));
        silent.dataset.actionDevice=dev.key;
        silent.dataset.silent=dev.key;
        controls.append(silent);
      }
      block.append(controls);
    }
    const extra=this._el("details",null,"device-details");
    const summary=this._el("summary","Diagnostics and maintenance");
    extra.append(summary);
    const diag=this._el("div",null,"diagnostics");
    const diagnostics=[
      ["nominal_airflow","Nominal airflow","m³/h"],
      ["minimum_airflow","Minimum airflow","m³/h"],
      ["pressure","Live pressure","Pa"],
      ["voc","Raw VOC",""],
      ["rssi","Wi-Fi RSSI","dBm"],
      ["boost_remaining","Boost remaining","s"],
      ["wifi_ip","Reported Wi-Fi IP",""],
      ["uptime","Uptime","s"],
    ];
    for(const [key,label,unit] of diagnostics){
      if(!this._entity(dev,key))continue;
      const row=this._el("div",null,"diag");
      row.append(this._el("span",label),this._el("strong"));
      const output=row.querySelector("strong");
      if(key==="wifi_ip")output.dataset.ipLink=dev.key+"|wifi_ip";
      else output.dataset.live=dev.key+"|"+key;
      diag.append(row);
    }
    extra.append(diag);
    if(this._entity(dev,"ventilation_boost")){
      extra.append(this._el("p",
        "Maintenance operations require an exact typed confirmation. "+
        "Calibration measures duct pressure loss, not VOC sensor calibration. "+
        "The previously app-reported calibration pressure is not available in the known local API.",
        "subtle"));
      const actions=this._el("div",null,"maintenance-controls");
      const cal=this._button("Calibrate…",()=>this._maintenance(dev,"calibrate"));
      const restart=this._button("Restart device…",()=>this._maintenance(dev,"restart"));
      cal.dataset.actionDevice=dev.key;restart.dataset.actionDevice=dev.key;
      actions.append(cal,restart);extra.append(actions);
    }
    block.append(extra);
    return block;
  }
  _statisticId(dev,key){
    const id=this._entity(dev,key);
    return id&&this._hass?.states?.[id]?.attributes?.state_class==="measurement" ? id : null;
  }
  async _loadHistory(){
    if(!this._hass||!this._registered||!this._assetsReady||!this._range)return;
    const token=++this._historyToken;
    this._historyLoading=true;this._historyError="";
    const ids=[...new Set(this._devices.flatMap(dev=>
      RV_METRICS.map(metric=>this._statisticId(dev,metric.key)).filter(Boolean)
    ))];
    this._drawAllCharts();
    try{
      if(!ids.length){
        this._history={};
        this._historyError="No statistics-enabled Renson sensors were found.";
        return;
      }
      const period=rvRecorderPeriod(this._range);
      const data=await this._hass.callWS({
        type:"recorder/statistics_during_period",
        start_time:this._range.start,end_time:this._range.end,
        statistic_ids:ids,period,types:["mean","min","max"]
      });
      if(token!==this._historyToken)return;
      this._history=data||{};
      this._historyPeriod=period;this._historyRefresh=Date.now();
    }catch(err){
      if(token!==this._historyToken)return;
      this._history={};
      this._historyError="Recorder history unavailable: "+(err?.message||String(err));
      this._historyRefresh=Date.now();
    }finally{
      if(token===this._historyToken){
        this._historyLoading=false;this._drawAllCharts();
      }
    }
  }
  _svg(tag,attrs={}){
    const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
    return el;
  }
  _seriesFor(metric){
    return this._devices
      .filter(dev=>this._selectedDevice==="all"||dev.key===this._selectedDevice)
      .map((dev,index)=>{
        const id=this._statisticId(dev,metric);
        const rows=id&&Array.isArray(this._history[id])?this._history[id]:[];
        return {id,name:dev.name,color:RV_COLORS[index%RV_COLORS.length],
          rows:rows.filter(p=>p.mean!=null&&Number.isFinite(Number(p.mean))&&
             Number.isFinite(Number(p.start)))
            .map(p=>({x:Number(p.start),y:Number(p.mean)}))
            .sort((x,y)=>x.x-y.x)};
      }).filter(s=>s.id);
  }
  _date(ts){
    const d=new Date(ts),range=this._range;
    const days=(Date.parse(range.end)-Date.parse(range.start))/86400000;
    return days<=3?d.toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):
      days>550?d.toLocaleDateString(undefined,{month:"short",year:"numeric"}):
      d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"2-digit"});
  }
  _drawAllCharts(){
    for(const metric of RV_METRICS)this._drawChart(metric);
  }
  _drawChart(metric){
    const surface=this.shadowRoot?.querySelector('[data-chart-plot="'+metric.key+'"]');
    if(!surface||!this._range)return;
    surface.replaceChildren();
    if(this._historyLoading){
      surface.append(this._el("p","Loading Recorder history…","subtle"));return;
    }
    if(this._historyError){
      surface.append(this._el("p",this._historyError,"warning"));return;
    }
    const series=this._seriesFor(metric.key).filter(s=>s.rows.length);
    if(!series.length){
      surface.append(this._el("p",
        "No recorded statistics for this period. Earlier data is not backfilled.",
        "subtle"));return;
    }
    const start=Date.parse(this._range.start),end=Date.parse(this._range.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
    const values=series.flatMap(s=>s.rows.filter(p=>p.x>=start&&p.x<end).map(p=>p.y));
    if(!values.length){
      surface.append(this._el("p","No statistics in the selected interval.","subtle"));return;
    }
    let min=Math.min(...values),max=Math.max(...values);
    const pad=Math.max((max-min)*0.1,Math.max(Math.abs(max),1)*0.015);
    min-=pad;max+=pad;
    const W=800,H=270,L=63,R=16,T=12,B=40;
    const X=x=>L+Math.max(0,Math.min(1,(x-start)/(end-start)))*(W-L-R);
    const Y=y=>T+(max-y)/(max-min)*(H-T-B);
    const svg=this._svg("svg",{viewBox:"0 0 "+W+" "+H,role:"img",
      "aria-label":metric.label+" statistics"});
    for(let i=0;i<=4;i++){
      const y=T+i*(H-T-B)/4,v=max-(max-min)*i/4;
      svg.append(this._svg("line",{x1:L,x2:W-R,y1:y,y2:y,
        stroke:"var(--divider-color,#999)","stroke-width":0.8,opacity:0.5}));
      const tx=this._svg("text",{x:L-7,y:y+4,"text-anchor":"end",
        fill:"var(--secondary-text-color,#777)","font-size":12});
      tx.textContent=Number(v.toFixed(Math.abs(v)<20?2:0)).toLocaleString();
      svg.append(tx);
    }
    for(const [x,align] of [[start,"start"],[(start+end)/2,"middle"],[end,"end"]]){
      const txt=this._svg("text",{x:X(x),y:H-8,"text-anchor":align,
        fill:"var(--secondary-text-color,#777)","font-size":12});
      txt.textContent=this._date(x);svg.append(txt);
    }
    const gap=this._historyPeriod==="5minute"?90*60000:
      this._historyPeriod==="hour"?4*3600000:
      this._historyPeriod==="day"?4*86400000:
      this._historyPeriod==="week"?25*86400000:65*86400000;
    for(const group of series){
      const rows=group.rows.filter(p=>p.x>=start&&p.x<end);
      let chunks=[],chunk=[],prev=null;
      for(const pt of rows){
        if(prev!==null&&pt.x-prev>gap&&chunk.length){chunks.push(chunk);chunk=[];}
        chunk.push(pt);prev=pt.x;
      }
      if(chunk.length)chunks.push(chunk);
      for(const segment of chunks){
        if(segment.length>1){
          svg.append(this._svg("polyline",{
            points:segment.map(pt=>X(pt.x)+","+Y(pt.y)).join(" "),
            fill:"none",stroke:group.color,"stroke-width":2.5,
            "stroke-linecap":"round","stroke-linejoin":"round"
          }));
        }else if(segment.length){
          svg.append(this._svg("circle",{
            cx:X(segment[0].x),cy:Y(segment[0].y),r:3.5,fill:group.color
          }));
        }
      }
    }
    surface.append(svg);
    const legend=this._el("div",null,"legend");
    for(const s of series){
      const item=this._el("div",null,"legend-item");
      const dot=this._el("i");dot.style.background=s.color;
      item.append(dot,this._el("span",s.name+" · "+s.rows.length+" intervals"));
      legend.append(item);
    }
    surface.append(legend,this._el("p",
      "Recorder "+this._historyPeriod+" means · Historical gaps are not filled.",
      "subtle"));
  }
  _chartSection(metric){
    const sec=this._el("section",null,"chart-card");
    sec.append(this._el("h2",metric.label+(metric.unit?" ("+metric.unit+")":"")));
    const plot=this._el("div",null,"chart-surface");
    plot.dataset.chartPlot=metric.key;sec.append(plot);return sec;
  }
  _updateLive(){
    if(!this._hass||!this._registered)return;
    for(const node of this.shadowRoot.querySelectorAll("[data-live]")){
      const [id,key]=node.dataset.live.split("|");
      const dev=this._byKey.get(id);if(!dev)continue;
      if(key==="boost_status"){
        const raw=this._value(dev,"boost_active")??this._value(dev,"ventilation_boost");
        const active=raw==="on";
        node.textContent=["on","off"].includes(raw)
          ?(active?"Boost active":"Automatic"):"Boost state unknown";
        node.classList.toggle("active",active);
      }else{
        const meta=[...RV_LIVE,
          ["nominal_airflow","", "m³/h"],["minimum_airflow","","m³/h"],
          ["pressure","","Pa"],["voc","",""],["rssi","","dBm"],
          ["boost_remaining","","s"],["wifi_ip","",""],["uptime","","s"],
        ].find(x=>x[0]===key);
        const unit=meta?.[2]||"";
        const raw=this._value(dev,key);
        node.textContent=this._fmt(raw,unit);
      }
    }
    // Both configured host (device header) and device-reported Wi-Fi IP
    // (diagnostics) open directly in a separate browser tab.
    for(const node of this.shadowRoot.querySelectorAll("[data-ip-link]")){
      const [deviceId,key]=node.dataset.ipLink.split("|");
      const dev=this._byKey.get(deviceId);
      if(!dev)continue;
      const raw=key==="configured_host"
        ?this._configuredHost(dev):this._value(dev,key);
      const link=this._addressLink(raw);
      node.replaceChildren();
      if(key==="configured_host"){
        node.append(this._el("span","Configured IP: "));
      }
      if(link)node.append(link);
      else node.append(this._el("span",
        key==="configured_host"?"Address not available":"—"));
    }
    for(const button of this.shadowRoot.querySelectorAll("[data-action-device]")){
      button.disabled=this._busy.has(button.dataset.actionDevice);
    }
    for(const button of this.shadowRoot.querySelectorAll("[data-silent]")){
      const dev=this._byKey.get(button.dataset.silent);
      if(dev)button.textContent=this._value(dev,"silent_mode_switch")==="on"?
        "Disable silent mode":"Enable silent mode";
    }
  }
  _mobileMenuButton(){
    // A custom panel owns its header on narrow screens; HA does not supply one.
    const button=document.createElement("button");
    button.type="button";
    button.className="ha-mobile-menu";
    button.title="Open Home Assistant menu";
    button.setAttribute("aria-label","Open Home Assistant menu");
    const icon=document.createElement("ha-icon");
    icon.setAttribute("icon","mdi:menu");
    icon.setAttribute("aria-hidden","true");
    button.append(icon);
    button.addEventListener("click",()=>this.dispatchEvent(
      new Event("hass-toggle-menu",{bubbles:true,composed:true})
    ));
    return button;
  }
  _render(){
    const root=this.shadowRoot;root.replaceChildren();
    const style=this._el("style");
    style.textContent=[
      ":host{display:block;color:var(--primary-text-color);font-family:var(--primary-font-family,Roboto,Arial,sans-serif)}",
      "*{box-sizing:border-box}",
      ".ha-mobile-menu{display:none;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;padding:8px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}",
      ".ha-mobile-menu:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}",
      ".heading-group{display:flex;align-items:center;gap:10px;min-width:0}",
      "@media(max-width:870px){.ha-mobile-menu{display:inline-flex}}",
      ".shell{max-width:1380px;margin:auto;padding:18px 18px 40px}",
      "h1{font-size:26px;font-weight:650;margin:0 0 5px}h2{font-size:18px;font-weight:600;margin:0 0 12px}",
      "p{line-height:1.5}.subtle{color:var(--secondary-text-color,#777);font-size:12px;margin:8px 0}",
      ".header{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}",
      "button,select{font:inherit}button{padding:9px 12px;border:1px solid var(--divider-color,#ccc);border-radius:9px;background:var(--card-background-color,#fff);color:inherit;cursor:pointer}",
      "button:hover{border-color:var(--primary-color,#268bd2)}button:disabled{opacity:.5;cursor:not-allowed}",
      "button.primary{background:var(--primary-color,#268bd2);color:#fff;border-color:transparent}",
      "button.selected{background:var(--primary-color,#268bd2);color:#fff;border-color:transparent}",
      "select{padding:8px 9px;border-radius:8px;border:1px solid var(--divider-color,#ccc);background:var(--card-background-color,#fff);color:var(--primary-text-color)}",
      ".notice{min-height:23px;color:var(--secondary-text-color,#777);margin:2px 0 15px;font-size:13px}",
      ".devices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,490px),1fr));gap:16px}",
      ".device-card,.chart-card{border:1px solid var(--divider-color,#ddd);border-radius:14px;background:var(--card-background-color,var(--ha-card-background,#fff));padding:18px;min-width:0}",
      ".device-head{display:flex;justify-content:space-between;gap:12px;align-items:start}",
      ".device-head h2{margin-bottom:2px}.device-head .subtle{margin:3px 0 12px}",
      ".device-address{color:var(--primary-color,#268bd2);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}",
      ".device-address:hover{text-decoration-thickness:2px}",
      ".status-pill{padding:5px 10px;border-radius:20px;background:var(--secondary-background-color,#eee);font-size:12px;white-space:nowrap}",
      ".status-pill.active{background:var(--primary-color,#268bd2);color:#fff}",
      ".readings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:15px}",
      ".tile{background:var(--secondary-background-color,rgba(128,128,128,.08));border-radius:10px;padding:11px;min-height:70px;display:flex;flex-direction:column;gap:8px}",
      ".tile small{font-size:12px;color:var(--secondary-text-color,#777)}.tile strong{font-size:19px;font-weight:650;overflow-wrap:anywhere}",
      ".controls,.maintenance-controls,.chart-toolbar,.periods{display:flex;gap:8px;flex-wrap:wrap;align-items:end}",
      ".controls label,.chart-toolbar label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color,#777)}",
      ".controls button{min-height:39px}.controls{padding-top:6px}.device-details{margin-top:15px;border-top:1px solid var(--divider-color,#ddd);padding-top:12px}",
      "summary{cursor:pointer;color:var(--primary-color,#268bd2)}.diagnostics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}",
      ".diag{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px}.diag span{color:var(--secondary-text-color,#777)}",
      ".maintenance-controls{margin:12px 0}.warning{color:var(--error-color,#d64740);font-size:13px}",
      ".history-toolbar{position:relative;z-index:5;padding:14px 18px;margin-top:20px;border-radius:12px;background:var(--card-background-color,var(--ha-card-background,#fff));border:1px solid var(--divider-color,#ddd)}",
      ".history-tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.history-tools label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color,#777)}",
      ".charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,580px),1fr));gap:16px;margin-top:14px}",
      ".chart-toolbar{margin:4px 0 13px}.periods{margin-bottom:12px}.periods button{padding:8px 12px}",
      ".chart-surface svg{width:100%;height:auto;display:block}.legend{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 6px}",
      ".legend-item{display:flex;align-items:center;gap:6px;font-size:12px}.legend-item i{display:inline-block;width:10px;height:10px;border-radius:50%}",
      ".footer{margin-top:18px;font-size:12px;color:var(--secondary-text-color,#777)}",
      "@media(max-width:700px){.shell{padding:12px}.readings{grid-template-columns:repeat(2,minmax(0,1fr))}.tile strong{font-size:17px}.devices,.charts{grid-template-columns:minmax(0,1fr)}}",
    ].join("\n");
    root.append(style);
    const shell=this._el("main",null,"shell");
    const header=this._el("header",null,"header");
    const label=this._el("div");
    label.append(this._el("h1","Renson Ventilation"),
      this._el("p","Local Waves / Sense · integration-managed dashboard","subtle"));
    const headingGroup=this._el("div",null,"heading-group");
    headingGroup.append(this._mobileMenuButton(),label);
    header.append(headingGroup);
    header.append(this._button("Refresh devices",()=>this._loadRegistry()));
    shell.append(header);
    const notice=this._el("div",this._notice,"notice");notice.dataset.notice="";
    shell.append(notice);
    if(this._assetError){
      shell.append(this._el("p",this._assetError,"warning"));
      shell.append(this._button("Retry date picker",()=>this._ensureAssets()));
    }
    if(!this._assetsReady){
      shell.append(this._el("p","Loading history date selector…","subtle"));
    }else if(this._loading){
      shell.append(this._el("p","Discovering Renson devices and entities…","subtle"));
    }else if(this._registryError){
      shell.append(this._el("p",this._registryError,"warning"));
    }else if(!this._registered||!this._devices.length){
      shell.append(this._el("p","No Renson devices were found in Home Assistant's device registry.","subtle"));
    }else{
      const devices=this._el("section",null,"devices");
      for(const dev of this._devices)devices.append(this._controlRow(dev));
      shell.append(devices);
      const filter=this._el("section",null,"history-toolbar");
      filter.append(this._el("h2","Ventilation statistics"));
      filter.append(this._el("p","One date selector for all history charts","subtle"));
      const actions=this._el("div",null,"history-tools");
      const picker=this._el(RV_PICKER_NAME);
      picker.range=this._range;
      picker.addEventListener("date-range-changed",event=>{
        this._range=event.detail;this._loadHistory();
      });
      actions.append(picker);
      const label=this._el("label","Ventilator");
      const select=this._el("select");
      const opt=this._el("option","All ventilators");opt.value="all";select.append(opt);
      for(const dev of this._devices){
        const option=this._el("option",dev.name);
        option.value=dev.key;select.append(option);
      }
      select.value=this._selectedDevice;
      select.addEventListener("change",()=>{
        this._selectedDevice=select.value;this._drawAllCharts();
      });
      label.append(select);actions.append(label);
      actions.append(this._button("Refresh history",()=>this._loadHistory()));
      filter.append(actions);shell.append(filter);
      const charts=this._el("section",null,"charts");
      for(const metric of RV_METRICS)charts.append(this._chartSection(metric));
      shell.append(charts);
      shell.append(this._el("p",
        "Frontend v"+RV_PANEL_VERSION+" · Managed by the Renson integration. "+
        "Existing dashboards and automations are unchanged. Trends use Recorder statistics. "+
        "Estimated VOC is experimental, not a safety measurement.",
        "footer"));
    }
    root.append(shell);
    this._updateLive();
    this._drawAllCharts();
  }
}
// Unique tag per version: customElements definitions cannot be replaced in
// a single Home Assistant browser tab. The stable loader swaps the child.
const RV_ELEMENT_NAME="renson-managed-ventilation-v"+RV_PANEL_VERSION.replace(/\./g,"-");
if(!customElements.get(RV_ELEMENT_NAME)){
  customElements.define(RV_ELEMENT_NAME,RensonManagedVentilationPanel);
}
