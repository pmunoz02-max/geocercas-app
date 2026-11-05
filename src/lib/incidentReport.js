export function filterIncidentReport(items, filters) {
  return items.filter(item => {
    const date = new Date(item.observed_at);
    const day = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
    return (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      ['geofence_id','author_id','category','severity','status'].every(key => !filters[key] || item[key] === filters[key]) &&
      (!filters.search || item.title.toLocaleLowerCase().includes(filters.search.trim().toLocaleLowerCase()));
  });
}
export function incidentCsv(rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export async function loadIncidentReport(request, org, user, signal) {
  const items = new Map();
  const cursors = new Set();
  let cursor = {};
  do {
    if (signal.aborted) throw new Error('cancelled');
    const query = new URLSearchParams({org_id:org,report:'1',...cursor});
    const response = await request('/api/incidents?' + query,{signal});
    const page = await response.json();
    if (!response.ok || page.user_id !== user || !Array.isArray(page.items)) throw new Error('report_failed');
    for (const item of page.items) items.set(item.id,item);
    if (items.size > 10000) throw new Error('report_limit');
    cursor = page.next;
    if (cursor) {
      const key = JSON.stringify(cursor);
      if (cursors.has(key)) throw new Error('invalid_cursor');
      cursors.add(key);
    }
  } while (cursor);
  return [...items.values()];
}
