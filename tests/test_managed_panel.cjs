/* Offline behaviour checks for the managed Waves dashboard.
 * No Home Assistant connection or ventilation hardware is involved.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");

async function main(){
  const classes=new Map();
  let typed=null, confirmed=false;
  const calls=[];
  class Element{
    attachShadow(){
      return {
        querySelector:()=>null,
        querySelectorAll:()=>[],
      };
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
    },
    document:{},
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
  console.log("Managed panel smoke test passed");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
