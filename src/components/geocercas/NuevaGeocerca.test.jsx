import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { CursorPosLive } from './NuevaGeocerca.jsx';

vi.mock('@/auth/AuthProvider.jsx', () => ({ useAuthSafe: () => ({}) }));
vi.mock('@/hooks/useOrgEntitlements.js', () => ({ default: () => ({}) }));
vi.mock('@/components/Billing/UpgradeToProButton', () => ({ default: () => null }));
vi.mock('../../lib/geofencesApi.js', () => ({ listGeofences: vi.fn(), getGeofence: vi.fn(), upsertGeofence: vi.fn(), deleteGeofence: vi.fn() }));
const noop = () => {};
describe('geofence toolbar editing', () => {
  it('keeps vertex editing and dragging operational when switching toolbar buttons', async () => {
    let map, polygon;
    function Setup() {
      map = useMap();
      useEffect(() => {
        polygon = L.polygon([[0,0],[0,1],[1,1]]).addTo(map);
        map.pm.addControls({ drawControls: false, editMode: true, dragMode: true });
        return () => map.pm.removeControls();
      }, []);
      return <CursorPosLive setCursorLatLng={noop} setMapZoom={noop} setMapScale={noop} />;
    }
    const { container } = render(<MapContainer center={[0,0]} zoom={10}><Setup /></MapContainer>);
    const edit = () => container.querySelector('.leaflet-pm-icon-edit').closest('a');
    const drag = () => container.querySelector('.leaflet-pm-icon-drag').closest('a');
    fireEvent.click(edit());
    await waitFor(() => expect(polygon.pm.enabled()).toBe(true));
    expect(container.querySelectorAll('.marker-icon').length).toBeGreaterThan(0);
    fireEvent.click(drag());
    await waitFor(() => expect(polygon.pm.layerDragEnabled()).toBe(true));
    expect(polygon.pm.enabled()).toBe(false);
    fireEvent.click(edit());
    await waitFor(() => expect(polygon.pm.enabled()).toBe(true));
    expect(polygon.pm.layerDragEnabled()).toBe(false);
    cleanup();
  });
});
