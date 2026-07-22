export function trackApiCall(apiName) {
  try {
    const logs = JSON.parse(localStorage.getItem('api_call_logs') || '{}');
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Initialize month and API key
    logs[monthKey] = logs[monthKey] || {};
    logs[monthKey][apiName] = (logs[monthKey][apiName] || 0) + 1;
    
    // Prune logs older than 6 months
    const months = Object.keys(logs).sort();
    if (months.length > 6) {
      const toRemove = months.slice(0, months.length - 6);
      toRemove.forEach(m => delete logs[m]);
    }
    
    localStorage.setItem('api_call_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to log API call:', e);
  }
}
