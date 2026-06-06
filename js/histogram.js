// Histograma pequeno por componente (só o necessário para o classificador).
// Extraído do app principal: histogramFromArray, histTotal, renderSmallComponentHistogram.
function histogramFromArray(values) {
  const hist = {};
  for (const v of values || []) {
    const key = Math.max(0, Math.round(v || 0));
    hist[key] = (hist[key] || 0) + 1;
  }
  return hist;
}

function histTotal(hist) {
  let total = 0;
  for (const k in (hist || {})) total += hist[k] || 0;
  return total;
}

function renderSmallComponentHistogram(canvasId, assignChart, realValues, simHist, title, note, color = '#3B82F6') {
  const canvas = $(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  const toRgba = (hex, a) => {
    const [r, g, b] = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)].map(h => parseInt(h, 16));
    return `rgba(${r},${g},${b},${a})`;
  };
  const realHist = histogramFromArray(realValues || []);
  const realTotal = histTotal(realHist);
  const simTotal = histTotal(simHist);
  let maxHit = 0;
  for (const k in realHist) maxHit = Math.max(maxHit, +k);
  for (const k in (simHist || {})) maxHit = Math.max(maxHit, +k);
  const labels = [];
  const realData = [];
  const simData = [];
  for (let i = 0; i <= Math.max(1, maxHit + 1); i++) {
    labels.push(i);
    realData.push(realTotal ? +((realHist[i] || 0) / realTotal * 100).toFixed(2) : 0);
    simData.push(simTotal ? +((simHist[i] || 0) / simTotal * 100).toFixed(2) : 0);
  }
  const datasets = [
    {
      type: 'bar',
      label: t('val_rp_component_real'),
      data: realData,
      backgroundColor: toRgba(color, 0.45),
      borderColor: color,
      borderWidth: 2,
      order: 2
    }
  ];
  if (simTotal > 0) {
    datasets.push({
      type: 'line',
      label: t('val_rp_component_sim'),
      data: simData,
      borderColor: color,
      backgroundColor: toRgba(color, 0.08),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
      order: 1
    });
  }
  assignChart(new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: simTotal > 0, labels: { color: '#8BA4C2', font: { size: 10 }, boxWidth: 10 } },
        title: { display: true, text: title + ' · n=' + realTotal + (note ? ' · ' + note : ''), color: '#DDE6F3', font: { size: 12, weight: '500' } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' } }
      },
      scales: {
        x: { grid: { color: 'rgba(139,164,194,0.1)' }, ticks: { color: '#8BA4C2', font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(139,164,194,0.1)' }, ticks: { color: '#8BA4C2', font: { size: 10 }, callback: v => v + '%' } }
      }
    }
  }));
}
