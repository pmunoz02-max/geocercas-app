import {it,expect,vi} from "vitest";
import L from "leaflet";
import {observeManualMapView} from "./trackerDashboardHelpers";
it("distinguishes fitting from an actual zoom change with a real Leaflet map",()=>{
 const container=document.createElement("div");document.body.appendChild(container);
 Object.defineProperties(container,{clientWidth:{value:800},clientHeight:{value:600}});
 const map=L.map(container,{zoomAnimation:false}).setView([0,0],12);
 const manual=vi.fn();const observer=observeManualMapView(map,manual);
 try {
  container.dispatchEvent(new Event("pointerdown"));expect(manual).not.toHaveBeenCalled();
  observer.fitBounds(L.latLngBounds([[-1,-1],[1,1]]),{padding:[24,24]});
  expect(manual).not.toHaveBeenCalled();
  map.setZoom(map.getZoom()+1,{animate:false});expect(manual).toHaveBeenCalledOnce();
  observer.fitBounds(L.latLngBounds([[-2,-2],[2,2]]),{padding:[24,24]});
  expect(manual).toHaveBeenCalledOnce();
  observer.dispose();map.setZoom(map.getZoom()+1,{animate:false});expect(manual).toHaveBeenCalledOnce();
 } finally {observer.dispose();map.remove();container.remove();}
});