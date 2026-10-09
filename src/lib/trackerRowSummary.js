// Use the same active personal rows and live states as the dashboard table.
export function summarizeTrackerRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((counts,row) => {
    counts.total += 1;
    const status = row?.live?.status;
    if (status === "online") counts.online += 1;
    else if (status === "stale") counts.stale += 1;
    else counts.offline += 1;
    return counts;
  }, {total:0,online:0,stale:0,offline:0});
}
