/* Test dashboard updates without a browser reload or Home Assistant server.
 * Actual dynamic module loading is mocked; the loader flow is exercised.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");

async function main(){
  let installed="0.3.4";
  let unavailable=false;
  const events={};
  const tags=new Map();
  const imports=[];
  let timer=null;
  let urls=[];
  const window={
    setInterval:(fn,period)=>{assert.equal(period,60000);timer=fn;return 17;},
    clearInterval:(id)=>{assert.equal(id,17);timer=null;},
    addEventListener:(k,fn)=>{events["window_"+k]=fn;},
    removeEventListener:(k,fn)=>{delete events["window_"+k];},
  };
  const doc={
    hidden:false,
    createElement(tag){
      if(tags.has(tag))return new (tags.get(tag))();
      return new Element(tag);
    },
    addEventListener:(k,fn)=>{events["document_"+k]=fn;},
    removeEventListener:(k,fn)=>{delete events["document_"+k];},
  };
  class Element{
    constructor(tag="div"){
      this.tagName=tag;this.children=[];this.textContent="";this.isConnected=true;
    }
    attachShadow(){this.shadowRoot=new Element("shadow");return this.shadowRoot;}
    append(...x){this.children.push(...x);}
    replaceChildren(...x){this.children=x;}
  }
  const context={
    HTMLElement:Element,
    customElements:{
      get:k=>tags.get(k),
      define:(k,v)=>tags.set(k,v),
    },
    window,document:doc,
    fetch:async(url,opts)=>{
      urls.push(url);
      assert.ok(url.startsWith("/renson_sense/manifest.json?_="));
      assert.equal(opts.cache,"no-store");
      if(unavailable)throw Error("HA restarting");
      return {ok:true,json:async()=>({version:installed})};
    },
  };
  const file=path.join(__dirname,"..","custom_components",
    "renson_sense","www","renson-ventilation-loader.js");
  vm.runInNewContext(fs.readFileSync(file,"utf8"),context,{filename:file});
  const Loader=tags.get("renson-ventilation-loader-panel");
  assert.ok(Loader);
  const panel=new Loader();
  panel.hass={states:{"sensor.test":{state:"5"}}};
  panel.panel={config:{test:true}};
  panel.narrow=true;
  panel.route={path:"overview"};
  panel._loadModule=async version=>{
    if(unavailable)throw Error("Version not yet registered");
    imports.push(version);
    const tag=panel._tag(version);
    class Child extends Element{
      constructor(){super(tag);this._busy=new Set();}
    }
    tags.set(tag,Child);
  };
  await panel._check();
  assert.equal(panel._version,"0.3.4");
  const original=panel._active;
  assert.equal(original.hass,panel._hass);
  assert.equal(original.panel,panel._panel);
  assert.equal(original.narrow,true);
  assert.equal(original.route.path,"overview");
  assert.deepEqual(imports,["0.3.4"]);

  // Changing the frontend version hot-swaps the child without reload.
  installed="0.3.5";
  await panel._check();
  assert.equal(panel._version,"0.3.5");
  assert.notEqual(panel._active,original);
  assert.equal(panel._mount.children[0],panel._active);
  assert.deepEqual(imports,["0.3.4","0.3.5"]);

  // Hass updates continue to reach the new element.
  panel.hass={states:{"sensor.test":{state:"25"}}};
  assert.equal(panel._active.hass,panel._hass);

  // In-flight control actions prevent replacement.
  panel._active._busy.add("device-1");
  installed="0.3.6";
  await panel._check();
  assert.equal(panel._version,"0.3.5");
  assert.equal(imports.length,2);
  panel._active._busy.clear();

  // New asset absent until HA restart: keep old child and retry.
  unavailable=true;
  await panel._check();
  assert.equal(panel._version,"0.3.5");
  assert.equal(panel._mount.children[0],panel._active);
  unavailable=false;
  await panel._check();
  assert.equal(panel._version,"0.3.6");

  // Repeated same-version checks don't reload or re-import.
  await panel._check();
  assert.deepEqual(imports,["0.3.4","0.3.5","0.3.6"]);

  panel.connectedCallback();
  // connectedCallback starts an asynchronous manifest check; finish it before
  // simulating focus and visibility events to avoid a race in the test.
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(timer);
  assert.ok(events.window_focus);
  assert.ok(events.document_visibilitychange);
  installed="0.3.7";
  await events.window_focus();
  assert.equal(panel._version,"0.3.7");
  installed="0.3.8";
  await events.document_visibilitychange();
  assert.equal(panel._version,"0.3.8");
  installed="0.3.9";
  await timer();
  assert.equal(panel._version,"0.3.9");
  panel.disconnectedCallback();
  assert.equal(timer,null);
  assert.equal(events.window_focus,undefined);
  assert.equal(events.document_visibilitychange,undefined);
  console.log("Panel loader hot-update tests passed");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
