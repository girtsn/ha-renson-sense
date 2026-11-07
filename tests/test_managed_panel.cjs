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
  let serverVersion="0.3.2";
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

  assert.equal(panel._registryKey({unique_id:"abc_def_airflow"}),"airflow");
  assert.equal(panel._registryKey({unique_id:"abc_def_voc_estimated"}),"voc_estimated");

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
  serverVersion="0.3.3";
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"New release must trigger one full reload");
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"Stale browser cache must not cause a reload loop");
  panel._busy.add(device.key);
  serverVersion="0.3.4";
  await panel._checkInstalledVersion();
  assert.equal(reloads,1,"An in-progress device command must prevent reload");
  panel._busy.clear();
  await panel._checkInstalledVersion();
  assert.equal(reloads,2,"Reload after pending action completes");

  console.log("Managed panel smoke test passed");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
