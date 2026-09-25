import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import VisitsPanel from '../components/VisitsPanel';
import {authFetch} from '../lib/authFetch';
import {visitDrafts,putVisitDraft,acknowledgeVisit} from '../lib/visitDrafts';
vi.mock('../lib/authFetch',()=>({authFetch:vi.fn()}));
vi.mock('../lib/visitDrafts',()=>({visitDrafts:vi.fn(),putVisitDraft:vi.fn(),acknowledgeVisit:vi.fn(),deviceLocation:vi.fn(async()=>null),prepareVisitPhoto:vi.fn(async()=>({base64:'photo',type:'image/png',location:null,attached_at:'2026-09-25T10:00:00Z'})),csvCell:String}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'es'}})}));
const initial={enabled:false,manager:true,user_id:'user',visits:[],geofences:[{id:'zone',name:'AAA'}],people:[],assignments:[]};
let state,queued;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();state=structuredClone(initial);queued=[];visitDrafts.mockImplementation(async()=>queued);putVisitDraft.mockImplementation(async(scope,body)=>{queued=[{scope,key:scope+body.id,revision:'1',body}];});acknowledgeVisit.mockImplementation(async()=>{queued=[];});authFetch.mockImplementation(async(url,options)=>{if(options?.body){const body=JSON.parse(options.body);if(body.action==='configure')state.enabled=body.enabled;}return {ok:true,json:async()=>structuredClone(state)};});});
afterEach(cleanup);
it('starts disabled and requires an explicit organization activation',async()=>{render(<VisitsPanel orgId="org" identityUser="user"/>);await screen.findByText('Visitas está desactivado para esta organización.');expect(screen.queryByText('Iniciar visita')).toBeNull();fireEvent.click(screen.getByText('Activar visitas para esta organización'));await screen.findByText('Iniciar visita');expect(authFetch.mock.calls.some(c=>c[1]?.body&&JSON.parse(c[1].body).enabled===true)).toBe(true);});
it('does not expose configuration controls to a tracker',async()=>{state.manager=false;render(<VisitsPanel orgId="org" identityUser="user"/>);await screen.findByText('Visitas está desactivado para esta organización.');expect(screen.queryByText('Activar visitas para esta organización')).toBeNull();});
it('retains a photo with unavailable location as a pending draft when offline',async()=>{state.enabled=true;render(<VisitsPanel orgId="org" identityUser="user"/>);await screen.findByText('Iniciar visita');fireEvent.change(screen.getByLabelText('Geocerca'),{target:{value:'zone'}});fireEvent.change(screen.getByLabelText('Motivo de la visita'),{target:{value:'Inspección'}});fireEvent.click(screen.getByText('Iniciar visita'));await screen.findByText('Guardar avances');authFetch.mockRejectedValue(new Error('offline'));fireEvent.change(screen.getByLabelText('Adjuntar fotos (hasta 5; 2 MB en total)'),{target:{files:[new File(['x'],'visit.png',{type:'image/png'})]}});await waitFor(()=>expect(putVisitDraft.mock.calls.at(-1)[1].photos[0]).toMatchObject({location:null,base64:'photo'}));expect(queued).toHaveLength(1);});

it('shows the photo selector before starting and includes the selected photo in the visit',async()=>{
 state.enabled=true;render(<VisitsPanel orgId="org" identityUser="user"/>);
 const input=await screen.findByLabelText('Adjuntar fotos (hasta 5; 2 MB en total)');
 fireEvent.change(input,{target:{files:[new File(['x'],'document.png',{type:'image/png'})]}});
 await screen.findByRole('img',{name:'Foto preparada'});
 expect(putVisitDraft).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Geocerca'),{target:{value:'zone'}});
 fireEvent.change(screen.getByLabelText('Motivo de la visita'),{target:{value:'Documento de visita'}});
 fireEvent.click(screen.getByText('Iniciar visita'));
 await waitFor(()=>expect(putVisitDraft).toHaveBeenCalledWith('org:user',expect.objectContaining({photos:[expect.objectContaining({base64:'photo',location:null})]})));
 await screen.findByText('Guardar avances');
 expect(screen.getByRole('img',{name:'Foto preparada'})).toBeTruthy();
});

it('accepts five photos, blocks a sixth and permits removing one',async()=>{
 state.enabled=true;render(<VisitsPanel orgId="org" identityUser="user"/>);
 const input=await screen.findByLabelText('Adjuntar fotos (hasta 5; 2 MB en total)');
 const files=Array.from({length:5},(_,i)=>new File(['x'],i+'.png',{type:'image/png'}));
 fireEvent.change(input,{target:{files}});
 await waitFor(()=>expect(screen.getAllByRole('img')).toHaveLength(5));
 expect(input.disabled).toBe(true);
 fireEvent.click(screen.getByText('Quitar foto 3'));
 await waitFor(()=>expect(screen.getAllByRole('img')).toHaveLength(4));
 expect(input.disabled).toBe(false);
});
it('rejects a batch of six before preparing any photo',async()=>{
 state.enabled=true;render(<VisitsPanel orgId="org" identityUser="user"/>);
 const input=await screen.findByLabelText('Adjuntar fotos (hasta 5; 2 MB en total)');
 fireEvent.change(input,{target:{files:Array.from({length:6},()=>new File(['x'],'x.png',{type:'image/png'}))}});
 await screen.findByText('Puedes adjuntar hasta 5 fotos por visita.');
 expect(screen.queryAllByRole('img')).toHaveLength(0);
});
