/* Stable Renson Ventilation sidebar loader.
 * Registered once with panel_custom. This module intentionally stays at one
 * URL: it loads each dashboard version from its own path and custom element
 * tag, without a full-page reload or replacement of the HA application shell.
 */
const RV_LOADER_INTERVAL_MS=60000;
class RensonVentilationLoaderPanel extends HTMLElement{
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this._hass=null;
    this._panel=null;
    this._narrow=false;
    this._route=null;
    this._active=null;
    this._version=null;
    this._checking=false;
    this._timer=null;
    this._loadRetries=new Map();
    this._onFocus=()=>this._check();
    this._onVisible=()=>document.hidden?undefined:this._check();
    const style=document.createElement("style");
    style.textContent=":host{display:block}.message{padding:10px 16px;font:13px var(--primary-font-family,Arial);color:var(--secondary-text-color,#777)}.message:empty{display:none}";
    this._notice=document.createElement("div");
    this._notice.className="message";
    this._mount=document.createElement("div");
    this.shadowRoot.append(style,this._notice,this._mount);
  }
  set hass(value){
    this._hass=value;
    if(this._active)this._active.hass=value;
  }
  set panel(value){
    this._panel=value;
    if(this._active)this._active.panel=value;
  }
  set narrow(value){
    this._narrow=Boolean(value);
    if(this._active)this._active.narrow=this._narrow;
  }
  set route(value){
    this._route=value;
    if(this._active)this._active.route=value;
  }
  connectedCallback(){
    if(this._timer!==null)return;
    this._check();
    this._timer=window.setInterval(()=>this._check(),RV_LOADER_INTERVAL_MS);
    window.addEventListener("focus",this._onFocus);
    document.addEventListener("visibilitychange",this._onVisible);
  }
  disconnectedCallback(){
    if(this._timer!==null){
      window.clearInterval(this._timer);
      this._timer=null;
    }
    window.removeEventListener("focus",this._onFocus);
    document.removeEventListener("visibilitychange",this._onVisible);
  }
  _tag(version){return "renson-managed-ventilation-v"+version.replace(/\./g,"-");}
  async _loadModule(version){
    // Browser module loaders may cache a failed import (e.g., a 404 while HA
    // restarts). A changed retry parameter permits a fresh network attempt.
    const attempt=this._loadRetries.get(version)||0;
    const url="/renson_sense/assets/"+version+"/managed-panel.js?v="+version+
      (attempt?"&retry="+attempt:"");
    try{await import(url);}
    catch(err){this._loadRetries.set(version,attempt+1);throw err;}
  }
  async _check(){
    if(this._checking||!this.isConnected)return;
    this._checking=true;
    try{
      const response=await fetch(
        "/renson_sense/manifest.json?_="+Date.now(),
        {cache:"no-store",credentials:"same-origin"}
      );
      if(!response.ok)throw Error("Manifest HTTP "+response.status);
      const manifest=await response.json();
      const version=manifest?.version;
      if(typeof version!=="string"||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))
        throw Error("Invalid integration version");
      if(version===this._version){
        this._notice.textContent="";
        return;
      }
      if(this._active?._busy?.size){
        this._notice.textContent="A dashboard update is available and will be applied after the current device operation.";
        return;
      }
      const tag=this._tag(version);
      if(!customElements.get(tag))await this._loadModule(version);
      if(!customElements.get(tag))
        throw Error("Updated dashboard module did not register "+tag);
      const next=document.createElement(tag);
      next.hass=this._hass;
      next.panel=this._panel;
      next.narrow=this._narrow;
      next.route=this._route;
      this._mount.replaceChildren(next);
      this._active=next;
      this._version=version;
      this._notice.textContent="";
    }catch(err){
      // HACS can replace files before HA restarts and registers the new
      // versioned asset route. Do not discard a working panel; retry later.
      this._notice.textContent=(this._active?
        "Dashboard update not yet ready; continuing with the previous version. ":
        "Unable to load Renson Ventilation dashboard. ")+
        (err?.message||String(err));
    }finally{
      this._checking=false;
    }
  }
}
if(!customElements.get("renson-ventilation-loader-panel")){
  customElements.define("renson-ventilation-loader-panel",RensonVentilationLoaderPanel);
}
