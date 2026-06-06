// Helpers de gráfico compartilhados com o app principal.
const VALIDATOR_TURN_DURATION = 2.25;

// média móvel de dano (Impact Analyser) — dano/s nos últimos `windowSeconds`.
function movingImpact(series, windowSeconds = 30) {
  return series.map((cur, idx) => {
    const startTime = Math.max(0, (cur.relTime || 0) - windowSeconds);
    let dmg = 0;
    let firstTs = cur.relTime || 0;
    for (let i = idx; i >= 0; i--) {
      const p = series[i];
      if ((p.relTime || 0) < startTime) break;
      dmg += p.damage || 0;
      firstTs = p.relTime || 0;
    }
    const prevTime = idx > 0 ? (series[idx - 1].relTime || 0) : null;
    const step = prevTime == null ? VALIDATOR_TURN_DURATION : Math.max(0.1, (cur.relTime || 0) - prevTime);
    const span = Math.max(1, Math.min(windowSeconds, (cur.relTime || 0) - firstTs + step));
    return dmg / span;
  });
}
