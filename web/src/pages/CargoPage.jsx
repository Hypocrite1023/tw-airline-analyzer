import { useEffect, useState, useMemo } from 'react';
import { Package, Gauge, Trophy, Layers } from 'lucide-react';
import { api, fmtNum, fmtCompact, fmtYmRoc } from '../api';
import KpiCard from '../components/KpiCard';
import EChart from '../components/EChart';

const COLORS = {
  '中華': '#38bdf8',
  '長榮': '#10b981',
  '星宇': '#f59e0b',
  '台灣虎航': '#fb7185',
  '立榮': '#a78bfa',
  '華信': '#2dd4bf',
};

export default function CargoPage({ dark }) {
  const [ym, setYm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('cargo_tons'); // 'cargo_tons' | 'cargo_lf'

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getTwCargo(ym)
      .then(res => {
        if (cancelled) return;
        setData(res);
        if (!ym && res.ym) setYm(res.ym);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const carrierHistoryOption = useMemo(() => {
    if (!data?.totalMonthlyHistory?.length) return null;
    const allYms = data.totalMonthlyHistory.map(h => h.ym);
    const carriers = ['中華', '長榮', '星宇', '台灣虎航'];

    const series = carriers.map(c => {
      const map = new Map((data.historyByAirline[c] || []).map(r => [r.ym, r[metric]]));
      return {
        name: c,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.3, color: COLORS[c] },
        itemStyle: { color: COLORS[c] },
        data: allYms.map(m => map.get(m) ?? null),
      };
    });

    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: carriers, top: 0, textStyle: { color: textColor } },
      grid: { left: 60, right: 24, top: 38, bottom: 48 },
      dataZoom: [
        { type: 'inside', start: 40, end: 100 },
        { type: 'slider', height: 18, bottom: 4, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: allYms, axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: metric === 'cargo_tons' ? '貨運噸數 (公噸)' : '載貨率 %',
        max: metric === 'cargo_lf' ? 100 : undefined,
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: (v) => (metric === 'cargo_tons' ? fmtCompact(v) : `${v}%`) },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series,
    };
  }, [data, metric, dark]);

  const sharePieOption = useMemo(() => {
    if (!data?.airlines?.length) return null;
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => `<b>${p.name}</b><br/>貨運量：${fmtNum(p.value)} 公噸 (${p.percent}%)<br/>載貨率：${p.data.lf}%`,
      },
      legend: { bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['44%', '72%'],
        center: ['50%', '43%'],
        itemStyle: { borderRadius: 6, borderColor: dark ? '#0f172a' : '#fff', borderWidth: 2 },
        data: data.airlines.map(a => ({
          name: a.airline,
          value: Math.round(a.cargo_tons),
          lf: a.cargo_lf,
          itemStyle: { color: COLORS[a.airline] || '#94a3b8' },
        })),
      }],
    };
  }, [data, dark]);

  const airportHistoryOption = useMemo(() => {
    if (!data?.airportHistory?.length) return null;
    const years = Array.from(new Set(data.airportHistory.map(r => r.year))).sort((a, b) => a - b);
    const byAirport = (code) => {
      const m = new Map(data.airportHistory.filter(r => r.airport === code).map(r => [r.year, Math.round(r.cargo_tons)]));
      return years.map(y => m.get(y) ?? 0);
    };
    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: ['全台總貨運量', '桃園國際機場 (TPE)', '高雄國際機場 (KHH)'], top: 0, textStyle: { color: textColor } },
      grid: { left: 62, right: 20, top: 38, bottom: 32 },
      xAxis: { type: 'category', data: years.map(String), axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: '年貨運量 (公噸)',
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: fmtCompact },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        { name: '全台總貨運量', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#38bdf8' }, areaStyle: { color: 'rgba(56,189,248,0.15)' }, data: byAirport('ALL') },
        { name: '桃園國際機場 (TPE)', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.2, color: '#10b981' }, data: byAirport('TPE') },
        { name: '高雄國際機場 (KHH)', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 1.8, color: '#f59e0b' }, data: byAirport('KHH') },
      ],
    };
  }, [data, dark]);

  if (loading && !data) return <div className="py-24 text-center text-slate-400 animate-pulse">載入台灣民航貨運大數據中...</div>;
  if (!data || data.empty) return <div className="py-24 text-center text-slate-400">尚無台灣貨運資料</div>;

  const { kpi } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">📦 台灣航空貨運分析 · {fmtYmRoc(data.ym)}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            資料來源：交通部民航局 表18（國籍航空全球客貨運概況 a=1738）＆ 表3（全台機場 74 年營運史 a=1736）
          </p>
        </div>
        <select
          value={ym}
          onChange={e => setYm(e.target.value)}
          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
        >
          {data.months.map(m => <option key={m} value={m}>{fmtYmRoc(m)}</option>)}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="國籍航空當月總貨運"
          value={`${fmtNum(Math.round(kpi.totalCargo))} 噸`}
          subtitle="華航 + 長榮 + 星宇 + 虎航等全球航線"
          icon={Package}
          accent="sky"
          mom={kpi.momCargo}
          yoy={kpi.yoyCargo}
        />
        <KpiCard
          title="國籍航空平均載貨率"
          value={`${kpi.avgCargoLf}%`}
          subtitle="載貨噸公里 (FTK) ÷ 可售貨噸公里"
          icon={Gauge}
          accent="emerald"
        />
        <KpiCard
          title="貨運霸主（當月市占）"
          value={`${kpi.topCarrier} (${kpi.topCarrierShare}%)`}
          subtitle="在所有國籍航空貨運噸數中佔比"
          icon={Trophy}
          accent="amber"
        />
        <KpiCard
          title="資料涵蓋跨度"
          value={`${data.months.length} 個月`}
          subtitle="2009–2026 月度貨運 + 1952–2026 機場史"
          icon={Layers}
          accent="violet"
        />
      </div>

      {/* Carrier Cargo Trend + Share Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold">國籍航空貨運消長戰（2009–2026）</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">觀察疫情貨運黃金期、AI 伺服器出口潮與星宇快速擴張</p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setMetric('cargo_tons')}
                className={`px-3 py-1 rounded-md font-medium ${metric === 'cargo_tons' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}
              >
                貨運噸數
              </button>
              <button
                onClick={() => setMetric('cargo_lf')}
                className={`px-3 py-1 rounded-md font-medium ${metric === 'cargo_lf' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}
              >
                載貨率 %
              </button>
            </div>
          </div>
          <EChart option={carrierHistoryOption} height={330} />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">當月國籍航空貨運市占</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">依當月全球航線貨運公噸數</p>
          <EChart option={sharePieOption} height={310} />
        </div>
      </div>

      {/* Airport 74-Year Cargo History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">台灣機場貨運量 74 年大歷史（1952–2026）</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          桃園國際機場扛下全台超過 95% 航空貨運量，見證台灣從輕工業到全球半導體／AI 供應鏈重鎮的躍升
        </p>
        <EChart option={airportHistoryOption} height={300} />
      </div>

      {/* Detailed Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-3">各國籍航空公司貨運詳細戰績 · {fmtYmRoc(data.ym)}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-2">航空公司</th>
                <th className="py-2.5 px-2 text-right">貨運噸數 (公噸)</th>
                <th className="py-2.5 px-2 text-right">貨運佔比</th>
                <th className="py-2.5 px-2 text-right">載貨率</th>
                <th className="py-2.5 px-2 text-right">載貨噸公里 (FTK)</th>
                <th className="py-2.5 px-2 text-right">同月客運載客率</th>
                <th className="py-2.5 px-2 text-right">全球總架次</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.airlines.map(a => (
                <tr key={a.airline} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-2 font-semibold">{a.airline}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">{fmtNum(Math.round(a.cargo_tons))}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-sky-400 font-semibold">{a.share}%</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.cargo_lf >= 70 ? 'bg-emerald-500/15 text-emerald-400'
                        : a.cargo_lf >= 50 ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {a.cargo_lf}%
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{fmtCompact(a.ftk)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{a.pax_lf}%</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.flights)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
