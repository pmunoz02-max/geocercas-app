import React, {useEffect, useRef, useState} from 'react';
import {filterIncidentReport, incidentCsv, loadIncidentReport} from '../lib/incidentReport';

const copy = {
 es: {title:'Reportes',load:'Generar / actualizar reporte',from:'Desde',to:'Hasta',author:'Registrado por',all:'Todos',search:'Buscar por título',clear:'Limpiar filtros',export:'Exportar CSV',total:'Resultados',scope:'Fecha de observación · hora local del navegador. Reporte de registros sincronizados. Pulsa Generar para consultar el historial.',error:'No se pudo completar el reporte. Revisa la conexión y vuelve a generar.',limit:'El historial supera 10.000 registros. Solicita un reporte por períodos al administrador.',invalid:'La fecha Desde debe ser anterior o igual a Hasta.',loaded:'Consulta realizada',previous:'Anterior',next:'Siguiente',unknown:'Usuario',empty:'Sin resultados para estos filtros.'},
 en: {title:'Reports',load:'Generate / refresh report',from:'From',to:'To',author:'Recorded by',all:'All',search:'Search by title',clear:'Clear filters',export:'Export CSV',total:'Results',scope:'Observation date · browser local time. Synced records only. Select Generate to read the history.',error:'The report could not be completed. Check your connection and generate again.',limit:'History exceeds 10,000 records. Ask your administrator for a report by period.',invalid:'From date must be on or before To date.',loaded:'Retrieved',previous:'Previous',next:'Next',unknown:'User',empty:'No results for these filters.'},
 fr: {title:'Rapports',load:'Générer / actualiser le rapport',from:'Du',to:'Au',author:'Enregistré par',all:'Tous',search:'Rechercher par titre',clear:'Effacer les filtres',export:'Exporter CSV',total:'Résultats',scope:'Date d’observation · heure locale du navigateur. Registres synchronisés. Sélectionnez Générer pour consulter l’historique.',error:'Le rapport est incomplet. Vérifiez la connexion et relancez la génération.',limit:'L’historique dépasse 10 000 dossiers. Demandez un rapport par période à l’administrateur.',invalid:'La date de début doit précéder ou égaler la date de fin.',loaded:'Consulté',previous:'Précédent',next:'Suivant',unknown:'Utilisateur',empty:'Aucun résultat pour ces filtres.'}
};
const emptyFilters = {from:'',to:'',geofence_id:'',author_id:'',category:'',severity:'',status:'',search:''};
export default function IncidentReports({org,user,request,words:w,language,onOpen}) {
 const text = copy[language?.slice(0,2)] || copy.es;
 const [rows,setRows] = useState(null);
 const [filters,setFilters] = useState(emptyFilters);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [loaded,setLoaded] = useState('');
 const [page,setPage] = useState(0);
 const controller = useRef(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const invalid = filters.from && filters.to && filters.from > filters.to;
 const filtered = invalid ? [] : filterIncidentReport(rows || [],filters);
 const names = new Map((rows || []).map(row=>[row.author_id,row.author_name || text.unknown+' '+row.author_id]));
 const fences = new Map((rows || []).map(row=>[row.geofence_id,row.geofence_name_snapshot]));
 const input='w-full min-w-0 rounded-lg border border-emerald-200 bg-white p-2 text-slate-900';
 const button='rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50';
 const stamp=value=>value?new Date(value).toLocaleString(language):'—';
 const change=(key,value)=>{setFilters(old=>({...old,[key]:value}));setPage(0);};
 async function generate() {
  if (busy) return;
  controller.current?.abort();
  const task = new AbortController();
  controller.current=task;
  setBusy(true);setRows(null);setError('');setPage(0);
  try {
   const items = await loadIncidentReport(request,org,user,task.signal);
   if (!task.signal.aborted) {setRows(items);setLoaded(new Date().toISOString());}
  } catch (e) {
   if (!task.signal.aborted) setError(e.message === 'report_limit'?text.limit:text.error);
  } finally {if (!task.signal.aborted) setBusy(false);}
 }
 function download() {
  const header=[w.name,w.observed+' (UTC)',w.recorded+' (UTC)',w.plot,text.author,w.category,w.severity,w.status,'Lat','Lng',w.precision+' (m)','ID'];
  const values=filtered.map(row=>[row.title,row.observed_at,row.received_at,row.geofence_name_snapshot,names.get(row.author_id),w.categories[row.category],w.severities[row.severity],w.states[row.status],row.lat,row.lng,row.accuracy_m,row.id]);
  const url=URL.createObjectURL(new Blob([incidentCsv([header,...values])],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='incidencias-'+new Date().toISOString().slice(0,10)+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="rounded-xl border border-emerald-300 bg-white p-5 space-y-4" aria-label={text.title}>
  <h2 className="text-2xl font-semibold text-emerald-900">{text.title}</h2>
  <p className="text-sm text-slate-600">{text.scope}</p>
  <button className={button} disabled={busy} onClick={generate}>{busy?w.loading:text.load}</button>
  <p role="status">{error || (rows?text.loaded+': '+stamp(loaded):'')}</p>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   {[['from',text.from],['to',text.to]].map(([key,label])=><label key={key}>{label}<input type="date" className={input} value={filters[key]} onChange={e=>change(key,e.target.value)}/></label>)}
   <label>{text.search}<input type="search" className={input} value={filters.search} onChange={e=>change('search',e.target.value)}/></label>
   {[['geofence_id',w.plot,[...fences]],['author_id',text.author,[...names]],['category',w.category,Object.entries(w.categories)],['severity',w.severity,Object.entries(w.severities)],['status',w.status,Object.entries(w.states)]].map(([key,label,options])=><label key={key}>{label}<select className={input} value={filters[key]} onChange={e=>change(key,e.target.value)}><option value="">{text.all}</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>)}
  </div>
  {invalid&&<p role="alert" className="text-red-700">{text.invalid}</p>}
  <div className="flex flex-wrap gap-3"><button className={button} onClick={()=>{setFilters(emptyFilters);setPage(0);}}>{text.clear}</button><button className={button} disabled={busy||!rows||!!invalid||!filtered.length} onClick={download}>{text.export}</button></div>
  {rows&&<><p className="font-semibold">{text.total}: {filtered.length}</p><div className="flex flex-wrap gap-4 text-sm">{Object.entries(w.states).map(([state,label])=><span key={state}>{label}: {filtered.filter(row=>row.status===state).length}</span>)}</div>
   {!filtered.length?<p>{text.empty}</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[w.name,w.observed,w.plot,text.author,w.category,w.severity,w.status].map(label=><th className="p-2 border-b" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.slice(page*50,page*50+50).map(row=><tr key={row.id}><td className="p-2 border-b"><button className="text-emerald-800 underline" onClick={()=>onOpen(row.id)}>{row.title}</button></td>{[stamp(row.observed_at),row.geofence_name_snapshot,names.get(row.author_id),w.categories[row.category],w.severities[row.severity],w.states[row.status]].map((cell,index)=><td className="p-2 border-b" key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
   {filtered.length>50&&<div className="flex items-center gap-3"><button className={button} disabled={page===0} onClick={()=>setPage(page-1)}>{text.previous}</button><span>{page+1} / {Math.ceil(filtered.length/50)}</span><button className={button} disabled={(page+1)*50>=filtered.length} onClick={()=>setPage(page+1)}>{text.next}</button></div>}
  </>}
 </section>;
}
