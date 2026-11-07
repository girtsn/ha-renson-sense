/* Browser-free smoke tests of the Renson panel.
 * Ensures mapped temperatures, batched histories and confirmation safeguards.
 * No Home Assistant instance or physical ventilator is contacted.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
function range(days){
  const end=Date.now()+86400000;
  return {start:new Date(end-days*86400000).toISOString(),
          end:new Date(end).toISOString(),preset:"custom"};
}

async function main(){
  const classes=new Map(),calls=[],historyRequests=[];
  let typed=null,confirmed=false;
  class Element {
    attachShadow(){
      this.shadowRoot={querySelector:()=>null,querySelectorAll:()=>[]};
      return this.shadowRoot;
    }
  }
  const context={
    HTMLElement:Element,
    customElements:{get:k=>classes.get(k),define:(k,ctor)=>classes.set(k,ctor)},
    document:{createElement:tag=>({tagName:tag,textContent:"",className:""})},
    window:{prompt:()=>typed,confirm:()=>confirmed},
    URL,console,
  };
  const file=path.join(__dirname,"..","custom_components","renson_sense",
    "www","renson-ventilation-panel.js");
  vm.runInNewContext(fs.readFileSync(file,"utf8"),context,{filename:file});
  const Panel=classes.get("renson-managed-ventilation-v0-3-4");
  assert.ok(Panel,"Versioned dashboard element must register");

  const panel=new Panel();
  const device={key:"device_a",name:"Test Waves",
    registry:{configuration_url:"http://192.168.2.60/"},
    entities:{ventilation_boost:"fan.boost",silent_mode_switch:"switch.silent",
      boost_active:"binary_sensor.boost",airflow:"sensor.airflow"}};
  panel._devices=[device];
  panel._byKey.set(device.key,device);
  panel._assetsReady=true;
  panel._registered=true;
  panel._range=range(1);
  panel._drawAllCharts=()=>{};
  panel._hass={
    states:{
      "fan.boost":{state:"off",attributes:{}},
      "switch.silent":{state:"on",attributes:{}},
      "binary_sensor.boost":{state:"off",attributes:{}},
      "sensor.airflow":{state:"5",attributes:{state_class:"measurement"}},
    },
    callService:async(...args)=>calls.push(args),
    callWS:async req=>{
      historyRequests.push(req);
      assert.equal(req.type,"recorder/statistics_during_period");
      return Object.fromEntries(req.statistic_ids.map(id=>[
        id,[{start:Date.now()-60000,mean:5,min:4,max:6}]
      ]));
    },
  };
  // IP fallback still uses configured address, not reported Wi-Fi IP.
  assert.equal(panel._configuredHost(device),"192.168.2.60");
  device.entities.configured_host="sensor.configured_host";
  panel._hass.states["sensor.configured_host"]={state:"unavailable",attributes:{}};
  assert.equal(panel._configuredHost(device),"192.168.2.60");
  panel._hass.states["sensor.configured_host"].state="192.168.2.72";
  assert.equal(panel._configuredHost(device),"192.168.2.72");
  assert.equal(panel._addressLink("192.168.2.72").href,"http://192.168.2.72/");
  assert.equal(panel._addressLink("javascript:alert(1)"),null);
  panel._hass.states["sensor.configured_host"].state="unavailable";

  // Exact unique IDs keep the Breeze threshold (30) out of actual temperature.
  assert.equal(panel._registryKey({unique_id:"a_temperature"},"a"),"temperature");
  assert.equal(panel._registryKey({unique_id:"a_breeze_temperature"},"a"),null);
  assert.equal(panel._registryKey({unique_id:"other_temperature"},"a"),null);
  assert.equal(panel._registryKey({unique_id:"a_humidity_static_min"},"a"),null);

  // One batched query: all available metrics and both units.
  const devices=[
    {id:"d1",name:"First bathroom",identifiers:[["renson_sense","a"]]},
    {id:"d2",name:"Second bathroom",identifiers:[["renson_sense","b"]]},
  ];
  const entities=[
    {platform:"renson_sense",device_id:"d1",unique_id:"a_temperature",entity_id:"sensor.first_temp"},
    {platform:"renson_sense",device_id:"d1",unique_id:"a_breeze_temperature",entity_id:"sensor.first_threshold"},
    {platform:"renson_sense",device_id:"d1",unique_id:"a_humidity",entity_id:"sensor.first_humidity"},
    {platform:"renson_sense",device_id:"d1",unique_id:"a_airflow",entity_id:"sensor.first_flow"},
    {platform:"renson_sense",device_id:"d2",unique_id:"b_temperature",entity_id:"sensor.second_temp"},
    {platform:"renson_sense",device_id:"d2",unique_id:"b_breeze_temperature",entity_id:"sensor.second_threshold"},
    {platform:"renson_sense",device_id:"d2",unique_id:"b_humidity",entity_id:"sensor.second_humidity"},
    {platform:"renson_sense",device_id:"d2",unique_id:"b_airflow",entity_id:"sensor.second_flow"},
  ];
  const values={
    "sensor.first_temp":25.3,"sensor.first_threshold":30,
    "sensor.first_humidity":48,"sensor.first_flow":5,
    "sensor.second_temp":23.4,"sensor.second_threshold":30,
    "sensor.second_humidity":51,"sensor.second_flow":4,
  };
  const mapping=new Panel();
  mapping._assetsReady=true;
  mapping._range=range(1);
  mapping._render=()=>{};
  mapping._drawAllCharts=()=>{};
  mapping._hass={
    states:Object.fromEntries(Object.entries(values).map(([id,value])=>[
      id,{state:String(value),attributes:{state_class:"measurement"}}
    ])),
    callWS:async request=>{
      if(request.type==="config/device_registry/list")return devices;
      if(request.type==="config/entity_registry/list")return entities;
      if(request.type==="recorder/statistics_during_period"){
        historyRequests.push(request);
        assert.equal(request.statistic_ids.length,6);
        assert.ok(request.statistic_ids.includes("sensor.first_temp"));
        assert.ok(request.statistic_ids.includes("sensor.second_temp"));
        assert.ok(!request.statistic_ids.includes("sensor.first_threshold"));
        return Object.fromEntries(request.statistic_ids.map(id=>[
          id,[{start:Date.now()-60000,mean:values[id]}]
        ]));
      }
      throw Error("Unexpected call: "+request.type);
    },
  };
  // Avoid races between Registry discovery and the explicit history test.
  mapping._loadHistory=()=>{};
  await mapping._loadRegistry();
  delete mapping._loadHistory;
  assert.equal(mapping._devices.length,2);
  assert.equal(mapping._value(mapping._devices[0],"temperature"),"25.3");
  assert.equal(mapping._value(mapping._devices[1],"temperature"),"23.4");
  assert.equal(mapping._statisticId(mapping._devices[0],"temperature"),"sensor.first_temp");
  assert.equal(mapping._statisticId(mapping._devices[1],"temperature"),"sensor.second_temp");

  const expected=[ [1,"5minute"],[7,"hour"],[45,"day"],
                   [365,"week"],[1095,"month"] ];
  for(const [days,period] of expected){
    mapping._range=range(days);
    await Panel.prototype._loadHistory.call(mapping);
    assert.equal(historyRequests.at(-1).period,period,"Recorder granularity at "+days+" days");
    assert.equal(historyRequests.at(-1).statistic_ids.length,6);
    assert.equal(mapping._seriesFor("temperature")[0].rows[0].y,25.3);
    assert.equal(mapping._seriesFor("temperature")[1].rows[0].y,23.4);
    assert.equal(mapping._seriesFor("humidity").length,2);
    assert.equal(mapping._seriesFor("airflow").length,2);
  }
  mapping._selectedDevice=mapping._devices[0].key;
  assert.equal(mapping._seriesFor("temperature").length,1);
  mapping._selectedDevice="all";

  // History class is separate from live controls; actions remain confirmed.
  typed=null;
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,0,"Cancel must never calibrate");
  typed="calibrate";
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,0,"Wrong-case entry must never calibrate");
  typed="CALIBRATE";
  panel._maintenance(device,"calibrate");
  assert.equal(calls.length,1);
  assert.equal(calls[0][1],"calibrate");
  assert.equal(calls[0][2].confirmation,"CALIBRATE");
  await new Promise(resolve=>setImmediate(resolve));
  typed="RESTART";
  panel._maintenance(device,"restart");
  assert.equal(calls.length,2);
  assert.equal(calls[1][1],"restart_device");
  await new Promise(resolve=>setImmediate(resolve));
  confirmed=false;
  panel._startBoost(device);
  assert.equal(calls.length,2);
  confirmed=true;
  panel._startBoost(device);
  assert.equal(calls.length,3);
  assert.equal(calls[2][1],"start_boost");
  await new Promise(resolve=>setImmediate(resolve));
  confirmed=false;
  panel._toggleSilent(device);
  assert.equal(calls.length,3);
  console.log("Renson chart mapping, shared range and safe controls smoke tests passed");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
