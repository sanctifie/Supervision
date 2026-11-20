#!/usr/bin/env node
// Demande à Prometheus si chaque service d'Officina répond sur /health.
// Sans risque : lecture seule. Code de sortie 1 si un service ne répond pas.
const url = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const r = await fetch(`${url}/api/v1/query?query=${encodeURIComponent('probe_success{job="sondes-internes"}')}`).catch((e) => {
  console.error(`Prometheus injoignable (${url}) : ${e.message}`);
  process.exit(2);
});
const { data } = await r.json();
let ko = 0;
for (const s of data.result.sort((a, b) => a.metric.service.localeCompare(b.metric.service))) {
  const ok = s.value[1] === '1';
  if (!ok) ko++;
  console.log(`${s.metric.service.padEnd(12)} ${ok ? 'OK' : 'KO — ne répond pas'}`);
}
console.log(`\n${data.result.length - ko}/${data.result.length} services répondent.`);
process.exit(ko ? 1 : 0);
