function observationDay(value) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function filterIncidentReport(items, filters) {
  return items.filter(item => {
    const day = observationDay(item.observed_at);
    return (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      ['geofence_id','author_id','category','severity','status'].every(key => !filters[key] || item[key] === filters[key]) &&
      (!filters.search || item.title.toLocaleLowerCase().includes(filters.search.trim().toLocaleLowerCase()));
  });
}

export function incidentObservationSeries(rows) {
  const days = rows
    .map(row => Date.parse(observationDay(row.observed_at) + 'T00:00:00Z'))
    .filter(Number.isFinite);
  if (!days.length) return { points: [] };

  const first = new Date(Math.min(...days));
  const last = new Date(Math.max(...days));
  const span = (last - first) / 86400000;
  const unit = span <= 45 ? 'day' : span <= 730 ? 'month' : 'year';
  const periodStart = value => {
    const date = new Date(value);
    if (unit === 'day') return date.getTime();
    if (unit === 'year') date.setUTCMonth(0, 1);
    else date.setUTCDate(1);
    return date.getTime();
  };

  const counts = new Map();
  for (const day of days) {
    const period = periodStart(day);
    counts.set(period, (counts.get(period) || 0) + 1);
  }

  const points = [];
  const cursor = new Date(periodStart(first));
  const end = periodStart(last);
  while (cursor.getTime() <= end) {
    const date = cursor.getTime();
    points.push({ date, count: counts.get(date) || 0 });
    if (unit === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else if (unit === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { unit, points };
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
