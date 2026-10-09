export const TRACKER_STATUS_COLORS={online:'#059669',stale:'#d97706',offline:'#64748b'};
export function validTrackerCoordinates(lat,lng){const ok=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isFinite(Number(v));return ok(lat)&&ok(lng)&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;}
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function filterTrackerRows(rows,{selectedTrackerId='all',statusFilter='all',search=''}={}){const needle=norm(search);return (rows||[]).filter(r=>(selectedTrackerId==='all'||String(r.tracker_key||r.user_id||r.key)===String(selectedTrackerId))&&(statusFilter==='all'||(r.live?.status||'offline')===statusFilter)&&(!needle||norm([r.display_name,r.name,r.label,r.trackerLabel,r.fullName,r.firstName,r.lastName,r.email,r.tracker_key,r.user_id].filter(Boolean).join(' ')).includes(needle)));}
export function chooseTrackerLabels(markers,project,size,getName){const chosen=new Set(),occupied=[];if(markers.length>12)return chosen;const projected=markers.map(item=>({item,point:project([item.lat,item.lng])}));const pins=projected.map(({point:p})=>({left:p.x-20,right:p.x+20,top:p.y-44,bottom:p.y+4}));const hits=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;projected.sort((a,b)=>String(a.item.key).localeCompare(String(b.item.key))).forEach(({item,point:p})=>{const box={left:p.x+22,right:p.x+22+Math.min(180,Math.max(60,getName(item).length*8+20)),top:p.y-36,bottom:p.y-6};if(box.left<0||box.top<0||box.right>size.x||box.bottom>size.y||[...occupied,...pins].some(other=>hits(box,other)))return;occupied.push(box);chosen.add(item.key);});return chosen;}

// Membership and coordinate validation are shared by all historical paths.
export function visibleRoutePositions(positions, visibleKeys, getKey) {
 return (positions || []).filter(position => visibleKeys.has(String(getKey(position))) && validTrackerCoordinates(position?.lat, position?.lng));
}
