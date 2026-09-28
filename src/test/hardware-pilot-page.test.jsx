import React from 'react';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import {vi,it,expect,afterEach} from 'vitest';
const {from,auth}=vi.hoisted(()=>({from:vi.fn(),auth:{currentOrgId:'test-org',user:{id:'owner'}}}));
vi.mock('@/context/auth.js',()=>({useAuthSafe:()=>auth}));
vi.mock('../lib/supabaseClient',()=>({SUPABASE_URL:'https://mujwsfhkocsuuahlrssn.supabase.co',supabase:{from}}));
vi.mock('react-leaflet',()=>({MapContainer:({children})=><div>{children}</div>,TileLayer:()=>null,Polyline:()=>null,CircleMarker:({children})=><div>{children}</div>,Popup:({children})=><div>{children}</div>,useMap:()=>({fitBounds:vi.fn()})}));
import HardwarePilotPage from '../pages/HardwarePilotPage';
function mockData(error=false){from.mockImplementation(table=>{const q={};for(const name of ['select','eq','order','gte','limit'])q[name]=vi.fn(()=>q);q.abortSignal=vi.fn(async()=>({data:table==='trackers'?[{id:'t1',name:'Simulado 1'}]:[{device_id:'d1',event_id:'p1',recorded_at:new Date().toISOString(),received_at:new Date().toISOString(),fix_valid:true,latitude:0,longitude:0}],error:error?{message:'secret server error'}:null}));return q;});}
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('renders read-only route under permitted organization',async()=>{mockData();render(<HardwarePilotPage/>);await waitFor(()=>expect(screen.getByText(/1 posiciones válidas/)).toBeTruthy());expect(screen.getByText('Preview · Datos simulados')).toBeTruthy();expect(from).toHaveBeenCalledWith('hardware_observations');});
it('fails visibly without exposing server errors',async()=>{mockData(true);render(<HardwarePilotPage/>);await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(screen.queryByText('secret server error')).toBeNull();});
