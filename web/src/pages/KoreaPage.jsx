import { useEffect, useState, useMemo } from 'react';
import { Users, Gauge, Plane, Package } from 'lucide-react';
import { api, fmtNum, fmtCompact } from '../api';
import KpiCard from '../components/KpiCard';
import EChart from '../components/EChart';

export default function KoreaPage({ dark }) {
  const [ym, setYm] = useState('');
  const [origin, setOrigin] = useState('ALL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDest, setSelectedDest] = useState('TPE');
  const [routeHist, setRouteHist] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getKrOverview({ ym, origin })
      .then(res => {
        if (cancelled) return;
        setData(res);
        if (!ym && res.ym) setYm(res.ym);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym, origin]);

  useEffect(() => {
    if (!selectedDest) return;
    let cancelled = false;
    api.getKrRoute(selectedDest)
      .then(res => { if (!cancelled) setRouteHist(res); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [selectedDest]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const historyOption = useMemo(() => {
    if (!data?.history?.length) return null;
    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: ['國際線載客人數', '平均載客率 (%)'], top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 50, top: 38, bottom: 48 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 4, borderColor: 'transparent', textStyle: { color: textColor } }],
      xAxis: { type: 'category', data: data.history.map(h => h.ym), axisLabel: { color: textColor } },
      yAxis: [
        { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
        { type: 'value', min: 0, max: 100, axisLabel: { color: textColor, formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        {
          name: '國際線載客人數',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: '#818cf8' },
          areaStyle: { color: 'rgba(129,140,248,0.22)' },
          data: data.history.map(h => h.pax),
        },
        {
          name: '平均載客率 (%)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#34d399' },
          data: data.history.map(h => h.load_factor),
        },
      ],
    };
  }, [data, dark]);

  const topRoutesOption = useMemo(() => {
    if (!data?.topRoutes?.length) return null;
    const list = data.topRoutes.slice(0, 15).reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => {
          const r = list[p[0].dataIndex];
          return `<b>${r.destination} (${r.dest_iata})</b><br/>載客：${fmtNum(r.pax)} 人<br/>架次：${fmtNum(r.flights)} 次｜貨運：${fmtNum(r.cargo)} 噸<br/><span class="text-xs text-sky-400">點擊查看歷年走勢 →</span>`;
        },
      },
      grid: { left: 110, right: 64, top: 10, bottom: 22 },
      xAxis: { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: 'category', data: list.map(r => `${r.dest_iata} ${r.destination}`), axisLabel: { color: textColor, fontSize: 11 } },
      series: [{
        type: 'bar',
        data: list.map(r => ({
          value: r.pax,
          itemStyle: { borderRadius: [0, 6, 6, 0], color: r.dest_iata === selectedDest ? '#f59e0b' : '#818cf8' },
        })),
        label: { show: true, position: 'right', color: textColor, fontSize: 11, formatter: (p) => fmtCompact(p.value) },
      }],
    };
  }, [data, selectedDest, dark]);

  const routeHistOption = useMemo(() => {
    if (!routeHist?.history?.length) return null;
    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      grid: { left: 56, right: 20, top: 24, bottom: 32 },
      xAxis: { type: 'category', data: routeHist.history.map(h => h.ym), axisLabel: { color: textColor } },
      yAxis: { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      series: [{
        name: '載客人數',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: '#f59e0b' },
        areaStyle: { color: 'rgba(245,158,11,0.18)' },
        data: routeHist.history.map(h => h.pax),
      }],
    };
  }, [routeHist, dark]);

  if (loading && !data) return <div className="py-24 text-center text-slate-400 animate-pulse">載入韓國 Air Portal 數據中...</div>;
  if (!data || data.empty) return <div className="py-24 text-center text-slate-400">尚無韓國資料</div>;

  const { kpi } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">🇰🇷 韓國國際航線分析 · {data.ym}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            資料來源：韓國國土交通部 Air Portal（涵蓋 2019-01 ～ 2026-10，共 {data.months.length} 個月）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={ym}
            onChange={e => setYm(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
          >
            {data.months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
          >
            <option value="ALL">韓國全部機場</option>
            {data.origins.map(o => (
              <option key={o.origin_iata} value={o.origin_iata}>{o.origin} ({o.origin_iata})</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="國際線總載客人數" value={fmtNum(kpi.total_pax)} subtitle={`座位供給：${fmtNum(kpi.total_seats)}`} icon={Users} accent="sky" mom={kpi.momPax} yoy={kpi.yoyPax} />
        <KpiCard title="整體平均載客率" value={`${kpi.load_factor}%`} subtitle="依官方供給座位數計算" icon={Gauge} accent="emerald" yoy={kpi.yoyLf} deltaSuffix="pt" />
        <KpiCard title="國際線總架次" value={fmtNum(kpi.total_flights)} subtitle={`均單機 ${kpi.total_flights > 0 ? Math.round(kpi.total_seats / kpi.total_flights) : 0} 座`} icon={Plane} accent="violet" />
        <KpiCard title="國際航空貨運量" value={`${fmtNum(Math.round(kpi.total_cargo))} 噸`} subtitle="客機腹艙貨運量" icon={Package} accent="amber" />
      </div>

      {/* Macro History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">韓國國際線歷年載客與載客率走勢（2019–2026）</h3>
        <EChart option={historyOption} height={300} />
      </div>

      {/* Top Routes + Route History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">韓國出發熱門國際航點 Top 15</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">點擊任一航點（橘色為目前選取）檢視右側 8 年走勢</p>
          <EChart
            option={topRoutesOption}
            height={420}
            onChartClick={(p) => {
              const list = data.topRoutes.slice(0, 15).reverse();
              const item = list[p.dataIndex];
              if (item?.dest_iata) setSelectedDest(item.dest_iata);
            }}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold">韓國 ↔ {routeHist?.destination} ({selectedDest}) 歷年趨勢</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">快速切換熱門航點觀察</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {['TPE', 'KIX', 'NRT', 'FUK', 'BKK', 'HKG', 'LAX'].map(code => (
                <button
                  key={code}
                  onClick={() => setSelectedDest(code)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                    selectedDest === code ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <EChart option={routeHistOption} height={360} />
        </div>
      </div>

      {/* Top Airlines Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-3">韓國國際線航空公司排行 Top 20（含精準載客率與貨運量）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">航空公司 (ICAO)</th>
                <th className="py-2 px-2 text-right">載客人數</th>
                <th className="py-2 px-2 text-right">座位供給</th>
                <th className="py-2 px-2 text-right">載客率</th>
                <th className="py-2 px-2 text-right">架次</th>
                <th className="py-2 px-2 text-right">貨運量 (噸)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.topAirlines.slice(0, 20).map((a, i) => (
                <tr key={a.airline + a.airline_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-2 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">
                    {a.airline} {a.airline_code && <span className="font-mono text-xs text-indigo-400 ml-1">{a.airline_code}</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtNum(a.pax)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">{fmtNum(a.seats)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.load_factor >= 88 ? 'bg-emerald-500/15 text-emerald-400'
                        : a.load_factor >= 75 ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {a.load_factor}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNum(a.flights)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">{fmtNum(Math.round(a.cargo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
