// Detector de pico/residual da granada (cast→explode por contagem de hits).
// Usado pelo parser do classificador. Depende de median/percentile (stats.js).
function extractRpGrenadePeakResidual(dataOrSeries) {
  const source = Array.isArray(dataOrSeries) ? dataOrSeries : ((dataOrSeries && dataOrSeries.temporalSeries) || []);
  const rows = (source || [])
    .map((p, idx) => ({
      idx,
      raw: Math.max(0, +(p && (p.rawAttackHits != null ? p.rawAttackHits : p.mobsHit)) || 0),
      damage: Math.max(0, +(p && p.damage) || 0),
      mark: p && (p.rpGrenade || p.special || null)
    }))
    .filter(p => p.raw > 0);
  if (rows.length < 12) {
    return {
      normalMedianRaw: 0,
      normalP75Raw: 0,
      normalP90Raw: 0,
      grenadeResidualMedian: 0,
      grenadeResidualP75: 0,
      grenadeResidualP90: 0,
      grenadePeakRawMedian: 0,
      grenadePeakDamageMedian: 0,
      grenadePairCount: 0
    };
  }
  const rawVals = rows.map(p => p.raw);
  const center = median(rawVals);
  const marks = rows.map(p => p.mark || null);
  let pairCount = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    if (marks[i] || marks[i + 1]) continue;
    const low = rows[i].raw, high = rows[i + 1].raw;
    const looksLowHigh = center > 0 && low <= center * 0.75 && high >= center * 1.25 && high >= low * 1.8;
    if (looksLowHigh) {
      marks[i] = 'cast';
      marks[i + 1] = 'explode';
      pairCount++;
      i++;
    }
  }
  const normal = rows.filter((_, idx) => marks[idx] !== 'cast' && marks[idx] !== 'explode').map(p => p.raw);
  const explode = rows.filter((_, idx) => marks[idx] === 'explode');
  const normalMedianRaw = median(normal);
  const normalP75Raw = percentile(normal, 0.75);
  const normalP90Raw = percentile(normal, 0.90);
  const residualFrom = base => explode.map(p => Math.max(0, p.raw - base));
  return {
    normalMedianRaw,
    normalP75Raw,
    normalP90Raw,
    grenadeResidualMedian: median(residualFrom(normalMedianRaw)),
    grenadeResidualP75: median(residualFrom(normalP75Raw)),
    grenadeResidualP90: median(residualFrom(normalP90Raw)),
    grenadePeakRawMedian: median(explode.map(p => p.raw)),
    grenadePeakDamageMedian: median(explode.map(p => p.damage).filter(v => v > 0)),
    grenadePairCount: explode.length || pairCount
  };
}
