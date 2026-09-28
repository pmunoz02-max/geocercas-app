import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthSafe } from '@/context/auth.js';
import { supabase, SUPABASE_URL } from '../lib/supabaseClient';
import { hardwarePreviewAllowed, routePoints, hardwareHealth } from '../lib/hardwarePreview';

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points.map(p => [p.latitude,p.longitude]), { padding:[32,32],maxZoom:16 }); }, [map,points]);
  return null;
}
function Pilot({ org }) {
  const [trackers,setTrackers]=useState([]), [selected,setSelected]=useState('');
  const [result,setResult]=useState(null), [error,setError]=useState(''), [refresh,setRefresh]=useState(0), [loading,setLoading]=useState(true);
  useEffect(()=>{ const timer=setInterval(()=>setRefresh(n=>n+1),30000); return ()=>clearInterval(timer); },[]);
  useEffect(()=>{
    const abort=new AbortController(); let live=true;
    setLoading(true); setError(''); setResult(null);
    (async()=>{
      const list=await supabase.from('trackers').select('id,name').eq('org_id',org).eq('is_simulated',true).order('name').abortSignal(abort.signal);
      if(list.error) throw list.error;
      if(!live) return;
      setTrackers(list.data||[]);
      const id=(list.data||[]).some(t=>t.id===selected)?selected:list.data?.[0]?.id;
      if(!id){setLoading(false);return;}
      if(id!==selected){setSelected(id);return;}
      const rows=await supabase.from('hardware_observations').select('device_id,event_id,recorded_at,received_at,fix_valid,latitude,longitude')
        .eq('org_id',org).eq('tracker_id',id).gte('recorded_at',new Date(Date.now()-86400000).toISOString())
        .order('recorded_at',{ascending:false}).order('event_id',{ascending:false}).order('device_id',{ascending:false}).limit(501).abortSignal(abort.signal);
      if(rows.error) throw rows.error;
      // Communication is independent of recorded-time route ordering and its 500-row cap.
      const communication=await supabase.from('hardware_observations').select('recorded_at,received_at,fix_valid')
        .eq('org_id',org).eq('tracker_id',id).order('received_at',{ascending:false}).order('event_id',{ascending:false}).limit(1).abortSignal(abort.signal);
      if(communication.error) throw communication.error;
      if(live){setResult({id,communication:communication.data?.[0]||null,points:routePoints((rows.data||[]).slice(0,500)),truncated:rows.data?.length>500});setLoading(false);}
    })().catch(()=>{if(live){setError('No se pudo cargar el recorrido. Comprueba tu acceso y vuelve a actualizar.');setLoading(false);}});
    return ()=>{live=false;abort.abort();};
  },[org,selected,refresh]);
  const points=!loading&&result?.id===selected?result.points:[];
  const latest=points.at(-1);
  const health=hardwareHealth(result?.communication);
  return <section className="mx-auto max-w-6xl space-y-5 p-5">
    <header className="rounded-2xl bg-emerald-900 p-6 text-white"><p className="text-sm font-bold uppercase tracking-widest">Preview · Datos simulados</p><h1 className="mt-2 text-3xl font-bold">Piloto GPS/GNSS</h1><p className="mt-3">Recorridos ficticios para comprobar la recepción de dispositivos dedicados. No representan personas ni confirman conexión de un GPS real.</p></header>
    <div className="flex flex-wrap items-end gap-4"><label className="flex flex-col gap-2">Dispositivo simulado<select className="rounded-lg border p-3" value={selected} onChange={e=>setSelected(e.target.value)}><option value="" disabled>Selecciona un tracker</option>{trackers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Actualizar</button><a className="p-3 underline" href="/dashboard">Volver al seguimiento móvil</a></div>
    {!loading && !error && trackers.length>0 && result?.id===selected && <div className="rounded-xl border border-emerald-200 bg-white p-4" role="status"><strong>{health.label}</strong><p>Estado simulado · Frecuencia esperada: 60 s · Sin comunicación después de 3 minutos · Actualización cada 30 s.</p><p>Último envío nuevo: {result.communication?new Date(result.communication.received_at).toLocaleString():'Sin datos'}. Los reenvíos idénticos no renuevan este tiempo.</p></div>}
    <p>Últimas 24 horas · Máximo 500 observaciones · Retención de la organización aplicada por el servidor.</p>
    {loading?<p role="status">Cargando recorrido…</p>:error?<p role="alert">{error}</p>:!trackers.length?<p role="status">No hay trackers simulados visibles en esta organización. Selecciona la organización del piloto con una cuenta autorizada.</p>:!points.length?<p role="status">Sin posiciones GPS válidas en las últimas 24 horas.</p>:<>
      <p>{points.length} posiciones válidas. Última observación: {new Date(latest.recorded_at).toLocaleString()}. {result.truncated?'Se muestran solo las 500 observaciones más recientes.':''}</p>
      <MapContainer key={selected} center={[latest.latitude,latest.longitude]} zoom={13} style={{height:460,borderRadius:16}} aria-label="Mapa del recorrido simulado">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <Polyline positions={points.map(p=>[p.latitude,p.longitude])} pathOptions={{color:'#047857',weight:4}}/>
        <CircleMarker center={[latest.latitude,latest.longitude]} radius={9}><Popup>Última posición simulada<br/>{new Date(latest.recorded_at).toLocaleString()}</Popup></CircleMarker><FitRoute points={points}/>
      </MapContainer>
      <details><summary className="cursor-pointer p-3 font-semibold">Ver observaciones</summary><div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Fecha del dispositivo</th><th>Recibida</th><th>Latitud</th><th>Longitud</th></tr></thead><tbody>{points.slice().reverse().map(p=><tr key={p.device_id+':'+p.event_id}><td>{new Date(p.recorded_at).toLocaleString()}</td><td>{new Date(p.received_at).toLocaleString()}</td><td>{p.latitude}</td><td>{p.longitude}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
export default function HardwarePilotPage(){
 const auth=useAuthSafe(); const org=auth.currentOrgId||auth.currentOrg?.id||auth.orgId;
 if(!hardwarePreviewAllowed(window.location.hostname,SUPABASE_URL)) return <p className="p-6">El piloto GPS/GNSS está disponible exclusivamente en Preview.</p>;
 if(!org) return <p className="p-6">Selecciona una organización para ver el piloto.</p>;
 return <Pilot key={org+':'+auth.user?.id} org={org}/>;
}
