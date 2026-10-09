import React from 'react';
import L from 'leaflet';
import {it,expect,afterEach,vi} from 'vitest';
import {render,cleanup,fireEvent} from '@testing-library/react';
import {MapContainer,Tooltip} from 'react-leaflet';
import AnimatedTrackerDot,{createTrackerIcon} from './AnimatedTrackerDot';
import {TRACKER_STATUS_COLORS} from '../lib/trackerMapPresentation';
afterEach(cleanup);
it('renders an opaque GPS pin in the Leaflet marker pane and identifies it on tap',()=>{
 const {container}=render(<MapContainer center={[0,0]} zoom={12}><AnimatedTrackerDot center={[0,0]} name='Pietro Muñoz' status='online' showName><Tooltip>Pietro Muñoz — online</Tooltip></AnimatedTrackerDot></MapContainer>);
 const pin=container.querySelector('.leaflet-marker-pane .gps-tracker-icon');expect(pin).not.toBeNull();expect(pin.title).toBe('Pietro Muñoz');expect(pin.querySelector('.gps-tracker-name').textContent).toBe('Pietro Muñoz');expect(pin.querySelector('path').getAttribute('fill')).toBe(TRACKER_STATUS_COLORS.online);fireEvent.click(pin);expect(container.querySelector('.leaflet-tooltip').textContent).toContain('Pietro Muñoz');
});
it('safely updates status/name and hides permanent labels without losing identification',()=>{
 const view=(status,name,showName)=><MapContainer center={[0,0]} zoom={12}><AnimatedTrackerDot center={[0,0]} status={status} name={name} showName={showName} /></MapContainer>;
 const {container,rerender}=render(view('online','Pietro',true));rerender(view('stale','Ana',false));const pin=container.querySelector('.gps-tracker-icon');expect(pin.title).toBe('Ana');expect(pin.querySelector('.gps-tracker-name')).toBeNull();expect(pin.querySelector('path').getAttribute('fill')).toBe(TRACKER_STATUS_COLORS.stale);
});
it('treats tracker names as text and preserves a visible offline pin',()=>{const icon=createTrackerIcon('<img src=x onerror=alert(1)>','offline',true);const element=icon.createIcon();expect(element.querySelector('img')).toBeNull();expect(element.textContent).toContain('<img');expect(element.querySelector('path').getAttribute('fill')).toBe(TRACKER_STATUS_COLORS.offline);});


it('moves large GPS jumps immediately while preserving the marker',()=>{
 const spy=vi.spyOn(L.Marker.prototype,'setLatLng');
 try {
  const view=center=><MapContainer center={[0,0]} zoom={12}><AnimatedTrackerDot center={center} name='Pietro' status='online'/></MapContainer>;
  const {container,rerender}=render(view([0,0]));const original=container.querySelector('.gps-tracker-icon');spy.mockClear();rerender(view([1,1]));expect(spy).toHaveBeenCalledWith([1,1]);expect(container.querySelector('.gps-tracker-icon')).toBe(original);
 } finally {spy.mockRestore();}
});
