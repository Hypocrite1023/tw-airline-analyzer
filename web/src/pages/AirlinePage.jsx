import { useEffect, useState, useMemo } from 'react';
import { Plus, X, Trophy, AlertTriangle } from 'lucide-react';
import { api, fmtNum, fmtCompact, fmtYmRoc } from '../api';
import EChart from '../components/EChart';

const PALETTE = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#f97316', '#2dd4bf', '#60a5fa'];
const PRESETS = [
  { label: '國籍四雄', list: ['中華', '長榮', '星宇', '台灣虎航'] },
  { label: '熱門廉航', list: ['台灣虎航', '樂桃', '酷航', '捷星日本', '香港快運'] },
  { label: '港澳與外籍巨頭', list: ['國泰', '新加坡', '大韓', '日本', '香港快運'] },
];

export default function AirlinePage({ ym, airport, selectedAirlines, setSelectedAirlines, meta, dark, onSelectRoute }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('pax'); // 'pax' | 'load_factor'
  const [addValue, setAddValue] = useState('');

  useEffect(() => {
    if (!ym || !selectedAirlines.length) return;
    let cancelled = false;
    setLoading(true);
    api.getAirline({ airlines: selectedAirlines, airport, ym })
      .then(res => { if (!cancelled) setData(res); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym, airport, selectedAirlines]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const battleOption = useMemo(() => {
    if (!data?.historyByAirline) return null;
    const ymSet = new Set();
    Object.values(data.historyByAirline).forEach(arr => arr.forEach(r => ymSet.add(r.ym)));
    const allYms = Array.from(ymSet).sort();

    const series = selectedAirlines.map((airline, idx) => {
      const map = new Map((data.historyByAirline[airline] || []).map(r => [r.ym, r[metric]]));
      return {
        name: airline,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.2, color: PALETTE[idx % PALETTE.length] },
        itemStyle: { color: PALETTE[idx % PALETTE.length] },
        data: allYms.map(m => map.get(m) ?? null),
      };
    });

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
      },
      legend: { top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 20, top: 38, bottom: 52 },
      dataZoom: [
        { type: 'inside', start: 55, end: 100 },
        { type: 'slider', height: 20, bottom: 6, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: allYms, axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: metric === 'pax' ? '月載客人數' : '平均載客率 %',
        max: metric === 'load_factor' ? 100 : undefined,
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: (v) => (metric === 'pax' ? fmtCompact(v) : `${v}%`) },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series,
    };
  }, [data, selectedAirlines, metric, dark]);

  const handleAdd = (val) => {
    if (!val || selectedAirlines.includes(val) || selectedAirlines.length >= 8) return;
    setSelectedAirlines([...selectedAirlines, val]);
    setAddValue('');
  };

  const handleRemove = (name) => {
    if (selectedAirlines.length <= 1) return;
    setSelectedAirlines(selectedAirlines.filter(a => a !== name));
  };

  const makePrimary = (name) => {
    setSelectedAirlines([name, ...selectedAirlines.filter(a => a !== name)]);
  };

  return (
    <div className="space-y-6">
      {/* Selector & Presets */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">快速組合：</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setSelectedAirlines(p.list)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 transition"
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={addValue}
              onChange={e => handleAdd(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="">+ 加入比較航空公司（最多 8 家）</option>
              {(meta?.airlines || []).map(a => (
                <option key={a.airline} value={a.airline} disabled={selectedAirlines.includes(a.airline)}>
                  {a.airline}（歷年 {fmtCompact(a.total_pax)} 人）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedAirlines.map((name, i) => (
            <span
              key={name}
              onClick={() => makePrimary(name)}
              title="點擊設為主剖析航司"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition ${
                i === 0
                  ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              {name} {i === 0 && <span className="text-[10px] opacity-80">(主剖析)</span>}
              {selectedAirlines.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(name); }}
                  className="hover:text-rose-400 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 text-center text-slate-400 animate-pulse">載入航空公司戰力分析中...</div>
      ) : (
        <>
          {/* Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(data?.comparison || []).map((c, idx) => (
              <div
                key={c.airline}
                onClick={() => makePrimary(c.airline)}
                className={`rounded-2xl border p-4 cursor-pointer transition ${
                  c.airline === data.primary
                    ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-slate-900 dark:text-white">{c.airline}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                    {c.load_factor}%
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold tabular-nums">{fmtNum(c.pax)} <span className="text-xs font-normal text-slate-400">人</span></div>
                <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{fmtNum(c.flights)} 架次</span>
                  <span>{c.dest_count} 航點</span>
                  <span>均 {c.avg_seats} 座</span>
                </div>
              </div>
            ))}
          </div>

          {/* Historical Battle Chart */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">歷年營運消長對決</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">觀察各航空公司擴張速度、新航司崛起與載客率競爭</p>
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                <button
                  onClick={() => setMetric('pax')}
                  className={`px-3 py-1 rounded-md font-medium ${metric === 'pax' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}
                >
                  月載客人數
                </button>
                <button
                  onClick={() => setMetric('load_factor')}
                  className={`px-3 py-1 rounded-md font-medium ${metric === 'load_factor' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}
                >
                  平均載客率
                </button>
              </div>
            </div>
            <EChart option={battleOption} height={340} />
          </div>

          {/* Primary Airline Best vs Weakest Routes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {data?.primary} · 王牌滿載航線 Top 6
                </h3>
                <span className="text-xs text-slate-400 ml-auto">{fmtYmRoc(ym)}</span>
              </div>
              <div className="space-y-2.5">
                {(data?.bestRoutes || []).map(r => (
                  <div
                    key={r.destination}
                    onClick={() => onSelectRoute && onSelectRoute(r.destination)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-500/10 cursor-pointer transition"
                  >
                    <div>
                      <span className="font-medium text-sm">{r.destination}</span>
                      <span className="text-xs text-slate-400 ml-2">{fmtNum(r.pax)} 人 · {r.flights} 架次</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{r.load_factor}%</span>
                  </div>
                ))}
                {!data?.bestRoutes?.length && <div className="text-xs text-slate-400 py-4 text-center">無符合條件航線</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {data?.primary} · 載客率偏低航線 Top 6
                </h3>
                <span className="text-xs text-slate-400 ml-auto">（至少 8 架次）</span>
              </div>
              <div className="space-y-2.5">
                {(data?.weakestRoutes || []).map(r => (
                  <div
                    key={r.destination}
                    onClick={() => onSelectRoute && onSelectRoute(r.destination)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-amber-500/10 cursor-pointer transition"
                  >
                    <div>
                      <span className="font-medium text-sm">{r.destination}</span>
                      <span className="text-xs text-slate-400 ml-2">{fmtNum(r.pax)} 人 · {r.flights} 架次</span>
                    </div>
                    <span className="text-sm font-bold text-amber-400 tabular-nums">{r.load_factor}%</span>
                  </div>
                ))}
                {!data?.weakestRoutes?.length && <div className="text-xs text-slate-400 py-4 text-center">無符合條件航線</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
