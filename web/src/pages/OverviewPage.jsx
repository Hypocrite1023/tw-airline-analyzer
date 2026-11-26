import { useEffect, useState, useMemo } from 'react';
import { Users, Gauge, Plane, Globe2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api, fmtNum, fmtCompact, fmtYmRoc } from '../api';
import KpiCard from '../components/KpiCard';
import EChart from '../components/EChart';

export default function OverviewPage({ ym, airport, routeType, dark, onSelectRoute, onSelectAirline }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [destSort, setDestSort] = useState('pax'); // 'pax' | 'lf'

  useEffect(() => {
    if (!ym) return;
    let cancelled = false;
    setLoading(true);
    api.getOverview({ ym, airport, routeType })
      .then(res => { if (!cancelled) setData(res); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym, airport, routeType]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const macroOption = useMemo(() => {
    if (!data?.macroHistory?.length) return null;
    const x = data.macroHistory.map(d => d.ym);
    const pax = data.macroHistory.map(d => d.pax);
    const lf = data.macroHistory.map(d => d.load_factor);
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (params) => {
          const p0 = params[0];
          const p1 = params[1];
          return `<div class="font-semibold mb-1">${p0.axisValue}</div>
            <div>載客人數：<b>${fmtNum(p0.value)}</b> 人</div>
            ${p1 ? `<div>平均載客率：<b>${p1.value}%</b></div>` : ''}`;
        },
      },
      legend: { data: ['總載客人數', '平均載客率 (%)'], textStyle: { color: textColor }, top: 0 },
      grid: { left: 58, right: 52, top: 38, bottom: 52 },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', height: 20, bottom: 6, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: x, axisLabel: { color: textColor } },
      yAxis: [
        {
          type: 'value',
          name: '人次',
          nameTextStyle: { color: textColor },
          axisLabel: { color: textColor, formatter: (v) => fmtCompact(v) },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          name: '載客率 %',
          min: 0,
          max: 100,
          nameTextStyle: { color: textColor },
          axisLabel: { color: textColor, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '總載客人數',
          type: 'line',
          data: pax,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: '#38bdf8' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(56,189,248,0.35)' }, { offset: 1, color: 'rgba(56,189,248,0.02)' }],
            },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
            data: [{ xAxis: ym, label: { formatter: '目前檢視', color: '#f59e0b' } }],
          },
        },
        {
          name: '平均載客率 (%)',
          type: 'line',
          yAxisIndex: 1,
          data: lf,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.8, color: '#34d399' },
        },
      ],
    };
  }, [data, ym, dark]);

  const topDestOption = useMemo(() => {
    if (!data?.topDestinations?.length) return null;
    const sorted = [...data.topDestinations]
      .sort((a, b) => (destSort === 'pax' ? b.pax - a.pax : b.load_factor - a.load_factor))
      .slice(0, 15)
      .reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (params) => {
          const item = sorted[params[0].dataIndex];
          return `<div class="font-semibold mb-1">${item.destination} (${item.route_type})</div>
            <div>載客人數：<b>${fmtNum(item.pax)}</b> 人</div>
            <div>載客率：<b>${item.load_factor}%</b>（入境 ${item.lf_in}% / 出境 ${item.lf_out}%）</div>
            <div>飛行架次：${fmtNum(item.flights)} 次｜執飛航司：${item.airline_count} 家</div>
            <div class="text-xs text-sky-400 mt-1">點擊可進入航線戰況室 →</div>`;
        },
      },
      grid: { left: 86, right: 64, top: 12, bottom: 24 },
      xAxis: {
        type: 'value',
        max: destSort === 'lf' ? 100 : undefined,
        axisLabel: { color: textColor, formatter: (v) => (destSort === 'lf' ? `${v}%` : fmtCompact(v)) },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'category',
        data: sorted.map(d => d.destination),
        axisLabel: { color: textColor, fontWeight: 500 },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map(d => ({
            value: destSort === 'pax' ? d.pax : d.load_factor,
            itemStyle: {
              borderRadius: [0, 6, 6, 0],
              color: destSort === 'pax'
                ? '#38bdf8'
                : d.load_factor >= 88 ? '#10b981' : d.load_factor >= 75 ? '#38bdf8' : '#f59e0b',
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: textColor,
            fontSize: 11,
            formatter: (p) => (destSort === 'pax' ? fmtCompact(p.value) : `${p.value}%`),
          },
        },
      ],
    };
  }, [data, destSort, dark]);

  const airportOption = useMemo(() => {
    if (!data?.airportBreakdown?.length) return null;
    const colors = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa'];
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => `${p.name}<br/>載客：<b>${fmtNum(p.value)}</b> 人 (${p.percent}%)<br/>載客率：<b>${p.data.lf}%</b>`,
      },
      legend: { bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['46%', '72%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 6, borderColor: dark ? '#0f172a' : '#fff', borderWidth: 2 },
          label: { show: false },
          data: data.airportBreakdown.map((a, i) => ({
            name: a.label,
            value: a.pax,
            lf: a.load_factor,
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    };
  }, [data, dark]);

  if (loading && !data) {
    return <div className="py-24 text-center text-slate-400 animate-pulse">載入市場總覽數據中...</div>;
  }
  if (!data || data.empty) {
    return <div className="py-24 text-center text-slate-400">尚無資料，請先至「資料同步」頁面匯入民航局報表。</div>;
  }

  const { kpi } = data;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            市場總覽 · {fmtYmRoc(ym)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            範圍：{data.airportLabel} ｜ 航線：{routeType === 'ALL' ? '國際 + 兩岸合計' : routeType}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl">
          <span className="flex items-center gap-1 text-sky-400 font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" /> 入境 {fmtCompact(kpi.paxIn)} ({kpi.lfIn}%)
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" /> 出境 {fmtCompact(kpi.paxOut)} ({kpi.lfOut}%)
          </span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="當月總載客人數"
          value={fmtNum(kpi.pax)}
          subtitle={`座位供給：${fmtNum(kpi.seats)} 位`}
          icon={Users}
          accent="sky"
          mom={kpi.momPax}
          yoy={kpi.yoyPax}
        />
        <KpiCard
          title="平均載客率"
          value={`${kpi.loadFactor}%`}
          subtitle={`出入境落差：${(kpi.lfOut - kpi.lfIn).toFixed(1)}%`}
          icon={Gauge}
          accent="emerald"
          mom={kpi.momLf}
          yoy={kpi.yoyLf}
          deltaSuffix="pt"
        />
        <KpiCard
          title="總飛行架次"
          value={fmtNum(kpi.flights)}
          subtitle={`平均單機：${kpi.flights > 0 ? Math.round(kpi.seats / kpi.flights) : 0} 座`}
          icon={Plane}
          accent="violet"
        />
        <KpiCard
          title="活躍航點 / 航空公司"
          value={`${kpi.destCount} / ${kpi.airlineCount}`}
          subtitle="當月實際有定期航班執飛"
          icon={Globe2}
          accent="amber"
        />
      </div>

      {/* 18-Year Macro History Chart */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">歷年總運量與載客率走勢（2009–2026）</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">可拖曳下方時間軸或滾輪縮放，完整觀察 18 年成長、疫情斷崖與解封復甦</p>
          </div>
        </div>
        <EChart option={macroOption} height={310} />
      </div>

      {/* Top Destinations + Airport Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">熱門航點 Top 15</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">點擊長條可直接深入該航點戰況室</p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setDestSort('pax')}
                className={`px-3 py-1 rounded-md font-medium transition ${destSort === 'pax' ? 'bg-sky-500 text-white shadow' : 'text-slate-500 dark:text-slate-400'}`}
              >
                依載客人數
              </button>
              <button
                onClick={() => setDestSort('lf')}
                className={`px-3 py-1 rounded-md font-medium transition ${destSort === 'lf' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 dark:text-slate-400'}`}
              >
                依載客率
              </button>
            </div>
          </div>
          <EChart
            option={topDestOption}
            height={420}
            onChartClick={(params) => {
              if (params?.name && onSelectRoute) onSelectRoute(params.name);
            }}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5 flex flex-col">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">各機場運量佔比</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">當月全台各國際機場客流分配</p>
          {airportOption ? (
            <EChart option={airportOption} height={260} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">早期報表無單一機場細分</div>
          )}
          {data.routeTypeBreakdown?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">航線板塊分佈</p>
              {data.routeTypeBreakdown.map(rt => {
                const pct = kpi.pax > 0 ? Math.round((rt.pax / kpi.pax) * 1000) / 10 : 0;
                return (
                  <div key={rt.route_type} className="text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{rt.route_type}</span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {fmtCompact(rt.pax)} ({pct}%) · 載客率 {rt.load_factor}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${rt.route_type === '兩岸航線' ? 'bg-amber-400' : 'bg-sky-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Airlines Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-3">航空公司運量排行 Top 15</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-2">#</th>
                <th className="py-2.5 px-2">航空公司</th>
                <th className="py-2.5 px-2 text-right">載客人數</th>
                <th className="py-2.5 px-2 text-right">市占率</th>
                <th className="py-2.5 px-2 text-right">載客率</th>
                <th className="py-2.5 px-2 text-right">飛行架次</th>
                <th className="py-2.5 px-2 text-right">平均單機座位</th>
                <th className="py-2.5 px-2 text-right">執飛航點</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.topAirlines.slice(0, 15).map((a, idx) => {
                const share = kpi.pax > 0 ? ((a.pax / kpi.pax) * 100).toFixed(1) : '0.0';
                return (
                  <tr
                    key={a.airline}
                    onClick={() => onSelectAirline && onSelectAirline(a.airline)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    <td className="py-2.5 px-2 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 px-2 font-medium text-sky-600 dark:text-sky-400">{a.airline}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium">{fmtNum(a.pax)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{share}%</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.load_factor >= 88 ? 'bg-emerald-500/15 text-emerald-400'
                          : a.load_factor >= 75 ? 'bg-sky-500/15 text-sky-400'
                            : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {a.load_factor}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.flights)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {a.avg_seats} 座 {a.avg_seats >= 260 ? '✈️廣體' : ''}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{a.dest_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
