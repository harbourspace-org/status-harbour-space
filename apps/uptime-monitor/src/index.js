const AGENT_ID = process.env.AGENT_ID || 'unknown';
const AGENT_REGION = process.env.AGENT_REGION || 'unknown';
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_INTERVAL_SECONDS) || 30;

console.log(`[uptime-monitor placeholder] agent=${AGENT_ID} region=${AGENT_REGION}`);
console.log('[uptime-monitor placeholder] no probes yet — Phase 2 wires real probing.');

setInterval(() => {
  console.log(`[heartbeat] ${new Date().toISOString()} agent=${AGENT_ID} region=${AGENT_REGION}`);
}, HEARTBEAT_SECONDS * 1000);
