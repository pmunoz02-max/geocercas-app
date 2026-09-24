import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import NuevaGeocerca, { CursorPosLive } from './NuevaGeocerca.jsx';

vi.mock('@/auth/AuthProvider.jsx', () => ({ useAuthSafe: () => ({ currentOrg: { id: 'org-test' } }) }));
vi.mock('@/hooks/useOrgEntitlements.js', () => ({ default: () => ({ maxGeocercas: 1, refresh: noop }) }));
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

import { listGeofences, getGeofence, upsertGeofence, deleteGeofence } from '../../lib/geofencesApi.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate, i18n: { language: 'es' } }) }));
const translate = (key, options) => options?.defaultValue || key;
it('saves a loaded geofence under the same id at quota, without deleting or changing its activation', async () => {
  const geometry = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] };
  const row = { id: 'existing-id', org_id: 'org-test', name: 'AAA', active: true, geojson: geometry };
  listGeofences.mockResolvedValue([row]);
  getGeofence.mockResolvedValue(row);
  upsertGeofence.mockResolvedValue(row);
  const screen = render(<NuevaGeocerca />);
  try {
    await screen.findByText('AAA');
    fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    await waitFor(() => expect(screen.getAllByDisplayValue('AAA')[0]).toBeTruthy());
    // The edited live layer must win over the originally fetched GeoJSON.
    const edited = structuredClone(geometry);
    edited.features[0].geometry.coordinates[0][1] = [2,0];
    const live = vi.spyOn(L.GeoJSON.prototype, 'toGeoJSON').mockReturnValue(edited);
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar geocerca' })[0]);
    await waitFor(() => expect(upsertGeofence).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing-id', org_id: 'org-test', geojson: edited })));
    expect(upsertGeofence.mock.calls.at(-1)[0]).not.toHaveProperty('active');
    expect(deleteGeofence).not.toHaveBeenCalled();
    live.mockRestore();
  } finally { cleanup(); vi.restoreAllMocks(); }
});
