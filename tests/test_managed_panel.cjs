/* Offline behaviour checks for the managed Waves dashboard.
 * No Home Assistant connection or ventilation hardware is involved.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");

async function main(){
  const classes=new Map();
  let typed=null, confirmed=false, reloads=0;
  let serverVersion="0.3.3";
  const session=new Map();
  const calls=[];
  class Element{
    attachShadow(){
      this.shadowRoot={
        querySelector:()=>null,
        querySelectorAll:()=>[],
      };
      return this.shadowRoot;
    }
  }
  const ctx={
    HTMLElement:Element,
    customElements:{
      get:(name)=>classes.get(name),
      define:(name,value)=>classes.set(name,value),
    },
    window:{
      prompt:()=>typed,
      confirm:()=>confirmed,
      sessionStorage:{
        getItem:key=>session.get(key)||null,
        setItem:(key,value)=>session.set(key,value),
      },
      location:{reload:()=>{reloads++;}},
    },
    fetch:async (url,opts)=>{
      assert.ok(url.startsWith("/renson_sense/manifest.json?check="));
      assert.equal(opts.cache,"no-store");
      return {ok:true,json:async()=>({version:serverVersion})};
    },
    URL,
    document:{createElement:tag=>({tagName:tag.toUpperCase(),textContent:"",className:""})},
    console,
  };
  const filename=path.join(__dirname,"..","custom_components",
    "renson_sense","www","renson-ventilation-panel.js");
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),ctx,{filename});
  const Panel=classes.get("renson-managed-ventilation-panel");
  assert.ok(Panel,"Custom panel must register a web component");
  const panel=new Panel();
  const device={
    key:"device_a",name:"Test Waves",
    registry:{configuration_url:"http://192.168.2.60/"},
    entities:{
      ventilation_boost:"fan.ventilation_boost",
      silent_mode_switch:"switch.silent_mode",
      boost_active:"binary_sensor.boost_active",
      airflow:"sensor.ventilation_airflow",
    },
  };
  panel._byKey.set(device.key,device);
  panel._devices=[device];
  panel._hass={
    states:{
      "fan.ventilation_boost":{state:"off",attributes:{}},
      "switch.silent_mode":{state:"on",attributes:{}},
      "binary_sensor.boost_active":{state:"off",attributes:{}},
      "sensor.ventilation_airflow":{state:"5",attributes:{state_class:"measurement"}},
    },
    callService:async(...args)=>{calls.push(args);},
    callWS:async msg=>{
      assert.equal(msg.type,"recorder/statistics_during_period");
      assert.equal(msg.period,"5minute");
      assert.equal(msg.statistic_ids[0],"sensor.ventilation_airflow");
      return {"sensor.ventilation_airflow":[{
        start:Date.now()-60000,mean:5,min:4,max:6,
      }]};
    },
  };
  // Both address fields use links, never a manually copied hostname.
  const configured=panel._addressLink("192.168.2.60");
  assert.equal(configured.href,"http://192.168.2.60/");
  assert.equal(configured.textContent,"192.168.2.60");
  assert.equal(configured.target,"_blank");
  assert.equal(configured.rel,"noopener noreferrer");
  const reported=panel._addressLink("waves.lan:8080");
  assert.equal(reported.href,"http://waves.lan:8080/");
  assert.equal(panel._addressLink("javascript:alert(1)"),null);
  assert.equal(panel._addressLink("http://example.org/"),null);
  assert.equal(panel._addressLink(""),null);
  assert.equal(panel._addressLink("unknown"),null);
  assert.equal(panel._addressLink("unavailable"),null);
  assert.equal(panel._addressLink("http://example.org/"),null);
  // The configured address must still work when its sensor is missing or
  // disabled, via Home Assistant's registered DeviceInfo.configuration_url.
  assert.equal(panel._configuredHost(device),"192.168.2.60");
  device.entities.configured_host="sensor.configured_host";
  panel._hass.states["sensor.configured_host"]={state:"unavailable",attributes:{}};
  assert.equal(panel._configuredHost(device),"192.168.2.60");
  panel._hass.states["sensor.configured_host"].state="192.168.2.72";
  assert.equal(panel._configuredHost(device),"192.168.2.72");
  panel._hass.states["sensor.configured_host"].state="unknown";
  device.registry.configuration_url="javascript:alert(1)";
  assert.equal(panel._configuredHost(device),null,"Unsafe registry URL cannot become a link");
  device.registry.configuration_url="http://192.168.2.60/";

  const ipNode={
    dataset:{ipLink:device.key+"|configured_host"},
    children:[],
    replaceChildren(){this.children=[];},
    append(child){this.children.push(child);},
  };
  panel.shadowRoot.querySelectorAll=(selector)=>
    selector==="[data-ip-link]"?[ipNode]:[];
  panel._registered=true;
  panel._updateLive();
  assert.equal(ipNode.children[0].textContent,"Configured IP: ");
  assert.equal(ipNode.children[1].href,"http://192.168.2.60/");
  assert.equal(ipNode.children[1].target,"_blank");

  assert.equal(panel._registryKey({unique_id:"entry_a_airflow"},"entry_a"),"airflow");
  assert.equal(panel._registryKey({unique_id:"entry_a_voc_estimated"},"entry_a"),"voc_estimated");
  assert.equal(panel._registryKey({unique_id:"entry_a_temperature"},"entry_a"),"temperature");
  assert.equal(panel._registryKey({unique_id:"entry_a_breeze_temperature"},"entry_a"),null,
    "Breeze threshold is not an indoor temperature reading");
  assert.equal(panel._registryKey({unique_id:"entry_a_humidity_static_min"},"entry_a"),null);
  assert.equal(panel._registryKey({unique_id:"entry_other_temperature"},"entry_a"),null,
    "An entity belonging to a different device must not match");
  assert.equal(panel._registryKey({unique_id:"entry_a_temperature"}),null,
    "Never fall back to broad suffix matching when entry identifier is missing");

  // Reproduce the exact 30°C vs 25.3°C regression in the actual device/entity
  // registry discovery, including a second ventilator and both entry orders.
  const dataDevices=[
    {id:"d1",name:"Bathroom 1",identifiers:[["renson_sense","entry_a"]]},
    {id:"d2",name:"Bathroom 2",identifiers:[["renson_sense","entry_b"]]},
  ];
  const dataEntities=[
    {platform:"renson_sense",device_id:"d1",unique_id:"entry_a_temperature",entity_id:"sensor.one_temp"},
    {platform:"renson_sense",device_id:"d1",unique_id:"entry_a_breeze_temperature",entity_id:"sensor.one_breeze_threshold"},
    {platform:"renson_sense",device_id:"d2",unique_id:"entry_b_breeze_temperature",entity_id:"sensor.two_breeze_threshold"},
    {platform:"renson_sense",device_id:"d2",unique_id:"entry_b_temperature",entity_id:"sensor.two_temp"},
  ];
  const mappingPanel=new Panel();
  mappingPanel._hass={
    states:{
      "sensor.one_temp":{state:"25.3",attributes:{state_class:"measurement"}},
      "sensor.one_breeze_threshold":{state:"30",attributes:{state_class:"measurement"}},
      "sensor.two_temp":{state:"23.4",attributes:{state_class:"measurement"}},
      "sensor.two_breeze_threshold":{state:"30",attributes:{state_class:"measurement"}},
    },
    callWS:async request=>{
      if(request.type==="config/device_registry/list")return dataDevices;
      if(request.type==="config/entity_registry/list")return dataEntities;
      if(request.type==="recorder/statistics_during_period"){
        assert.deepEqual(Array.from(request.statistic_ids),["sensor.one_temp","sensor.two_temp"]);
        return Object.fromEntries(request.statistic_ids.map(id=>[
          id,[{start:Date.now()-60000,mean:Number(mappingPanel._hass.states[id].state)}],
        ]));
      }
      throw Error("Unexpected WebSocket call "+request.type);
    },
  };
  mappingPanel._render=()=>{};
  mappingPanel._loadChart=()=>{};
  await mappingPanel._loadRegistry();
  delete mappingPanel._loadChart;
  assert.equal(mappingPanel._devices.length,2);
  assert.equal(mappingPanel._devices[0].entities.temperature,"sensor.one_temp");
  assert.equal(mappingPanel._devices[1].entities.temperature,"sensor.two_temp");
  assert.equal(mappingPanel._value(mappingPanel._devices[0],"temperature"),"25.3");
  assert.equal(mappingPanel._value(mappingPanel._devices[1],"temperature"),"23.4");
  assert.equal(mappingPanel._statisticId(mappingPanel._devices[0],"temperature"),"sensor.one_temp");
  mappingPanel._charts.short.metric="temperature";
  await mappingPanel._loadChart("short");
  assert.equal(mappingPanel._charts.short.series[0].rows[0].y,25.3);
  assert.equal(mappingPanel._charts.short.series[1].rows[0].y,23.4);

  typed=null;
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,0,"Cancelling the prompt must not send calibration");

  typed="calibrate";
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,0,"Wrong-case confirmation must not send calibration");

  typed="CALIBRATE";
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,1,"Exact calibration confirmation must send once");
  assert.equal(calls[0][0],"renson_sense");
  assert.equal(calls[0][1],"calibrate");
  assert.equal(calls[0][2].confirmation,"CALIBRATE");
  assert.equal(calls[0][3].entity_id,"fan.ventilation_boost");

  await new Promise(resolve=>setImmediate(resolve));
  typed="RESTART";
  panel._maintenance(device,"restart");
  assert.equal(calls.length,2,"Exact restart confirmation must send once");
  assert.equal(calls[1][1],"restart_device");

  await new Promise(resolve=>setImmediate(resolve));
  confirmed=false;
  panel._startBoost(device);
  assert.equal(calls.length,2,"Rejected boost confirmation must not send");

  confirmed=true;
  panel._startBoost(device);
  assert.equal(calls.length,3);
  assert.equal(calls[2][1],"start_boost");
  assert.equal(calls[2][2].level,100);
  assert.equal(calls[2][2].duration,900);

  await new Promise(resolve=>setImmediate(resolve));
  confirmed=false;
  panel._toggleSilent(device);
  assert.equal(calls.length,3,"Rejected silent-mode change must not send");

  panel._registered=true;
  await panel._loadChart("short");
  assert.equal(panel._charts.short.series.length,1);
  assert.equal(panel._charts.short.series[0].rows.length,1);
  assert.equal(panel._charts.short.series[0].rows[0].y,5);

  // New tabs detect updated manifests and reload at most once per version.
  panel.isConnected=true;
  await panel._checkInstalledVersion();
  assert.equal(reloads,0,"Matching frontend version should not reload");
  serverVersion="0.3.4";
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"New release must trigger one full reload");
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"Stale browser cache must not cause a reload loop");
  panel._busy.add(device.key);
  serverVersion="0.3.5";
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"An in-progress device command must prevent reload");
  panel._busy.clear();
  await panel._checkInstalledVersion();
  assert.equal(reloads,2,"Reload after pending action completes");

  console.log("Managed panel smoke test passed");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
