import {describe,it,expect,vi} from "vitest";
import L from "leaflet";
import {shouldFitToBounds,observeManualMapView} from "./trackerDashboardHelpers";
const mapFor=view=>({getBounds:()=>view});
describe("dashboard map framing",()=>{
 it("fits when only part of geofence/tracker bounds overlaps the viewport",()=>{
  const view=L.latLngBounds([[0,0],[2,2]]), content=L.latLngBounds([[1,1],[3,3]]);
  expect(view.intersects(content)).toBe(true);
  expect(shouldFitToBounds(mapFor(view),content)).toBe(true);
 });
 it("does not refit when all content and padding are visible",()=>{
  expect(shouldFitToBounds(mapFor(L.latLngBounds([[-1,-1],[4,4]])),L.latLngBounds([[0,0],[3,3]]))).toBe(false);
 });
 it("fits an offscreen tracker together with the geofence",()=>{
  const geofence=L.latLngBounds([[0,0],[1,1]]), tracker=L.latLngBounds([[2,2],[2,2]]);
  const content=geofence.extend(tracker);
  expect(content.contains([0,0])).toBe(true);expect(content.contains([2,2])).toBe(true);
  expect(shouldFitToBounds(mapFor(L.latLngBounds([[-0.1,-0.1],[1.1,1.1]])),content)).toBe(true);
 });
 it("preserves manual pan/zoom even when updated content leaves the viewport",()=>{
  expect(shouldFitToBounds(mapFor(L.latLngBounds([[0,0],[1,1]])),L.latLngBounds([[3,3],[4,4]]),{userInteracted:true})).toBe(false);
 });
 it("ignores missing/invalid content and fits an initially unavailable viewport",()=>{
  expect(shouldFitToBounds(null,L.latLngBounds([[0,0],[1,1]]))).toBe(false);
  expect(shouldFitToBounds(mapFor(null),L.latLngBounds([]))).toBe(false);
  expect(shouldFitToBounds(mapFor(null),L.latLngBounds([[0,0],[1,1]]))).toBe(true);
 });
});

function eventMap() {
 let zoom=12;const handlers=new Map();
 const fire=type=>{for(const listener of handlers.get(type)||[])listener();};
 const map={
  getZoom:()=>zoom,
  on:(type,listener)=>{handlers.set(type,[...(handlers.get(type)||[]),listener]);},
  off:(type,listener)=>{handlers.set(type,(handlers.get(type)||[]).filter(item=>item!==listener));},
  fitBounds:vi.fn(()=>{zoom=9;fire("zoomend");}),
 };
 return {map,fire,zoomTo:value=>{zoom=value;fire("zoomend");}};
}
describe("manual map view protection",()=>{
 it("ignores a simple click or wheel/key attempt that does not change zoom",()=>{
  const events=eventMap(), manual=vi.fn();observeManualMapView(events.map,manual);
  for(const type of ["pointerdown","click","wheel","keydown","zoomend"])events.fire(type);
  expect(manual).not.toHaveBeenCalled();
 });
 it("activates on a real drag",()=>{
  const events=eventMap(),manual=vi.fn();observeManualMapView(events.map,manual);
  events.fire("dragstart");expect(manual).toHaveBeenCalledOnce();
 });
 it("activates only when zoom actually changes",()=>{
  const events=eventMap(),manual=vi.fn();observeManualMapView(events.map,manual);
  events.zoomTo(12);expect(manual).not.toHaveBeenCalled();
  events.zoomTo(13);expect(manual).toHaveBeenCalledOnce();
  events.zoomTo(13);expect(manual).toHaveBeenCalledOnce();
 });
 it("allows automatic/Center fitting without mistaking its zoom for manual input",()=>{
  const events=eventMap(),manual=vi.fn();const observer=observeManualMapView(events.map,manual);
  const bounds=L.latLngBounds([[0,0],[1,1]]);observer.fitBounds(bounds,{padding:[24,24]});
  expect(events.map.fitBounds).toHaveBeenCalledWith(bounds,{padding:[24,24],animate:false});
  expect(manual).not.toHaveBeenCalled();
  events.zoomTo(10);expect(manual).toHaveBeenCalledOnce();
 });
 it("removes listeners on unmount",()=>{
  const events=eventMap(),manual=vi.fn();const observer=observeManualMapView(events.map,manual);observer.dispose();
  events.fire("dragstart");events.zoomTo(13);expect(manual).not.toHaveBeenCalled();
 });
 it("restores user zoom detection after a failed fit",()=>{
  const events=eventMap(),manual=vi.fn();const observer=observeManualMapView(events.map,manual);
  events.map.fitBounds.mockImplementationOnce(()=>{throw Error("fit failed");});
  expect(()=>observer.fitBounds(null,{})).toThrow("fit failed");
  events.zoomTo(13);expect(manual).toHaveBeenCalledOnce();
 });
});
