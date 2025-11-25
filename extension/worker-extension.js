function hasChromeTabs(){
  return typeof chrome!=="undefined" && chrome?.runtime && chrome?.tabs && typeof chrome.tabs.query==="function";
}
async function safeGetCurrentTab(){
  if(!hasChromeTabs()){
    console.info("[App Geocerca] worker cargado fuera de extensión; sin acción.");
    return null;
  }
  try{
    const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
    console.log("[App Geocerca] Tab activa:",tab?.id,tab?.url);
    return tab||null;
  }catch(e){
    console.error("[App Geocerca] Error tabs.query:",e);
    return null;
  }
}
(async()=>{ console.log("[App Geocerca] worker iniciado"); await safeGetCurrentTab(); })();
if(hasChromeTabs()){
  chrome.runtime.onMessage.addListener((msg,_,sendResponse)=>{
    if(msg?.type==="PING") sendResponse({ok:true,ts:Date.now()});
    return false;
  });
}
