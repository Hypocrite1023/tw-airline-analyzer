import { useEffect, useState, useMemo } from 'react';
import { Flame, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { api, fmtNum, fmtCompact, fmtYmRoc } from '../api';
import EChart from '../components/EChart';

const ERA_PRESETS = [
  { label: '解封後 (2023-2026)', start: 2023, end: 2026 },
  { label: '疫情前黃金期 (2015-2019)', start: 2015, end: 2019 },
  { label: '全歷史 (2009-2026)', start: 2009, end: 2026 },
];

export default function TrendsPage({ ym, airport, dark, onSelectRoute }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [era, setEra] = useState(ERA_PRESETS[0]);

  useEffect(() => {
    if (!ym) return;
    let cancelled = false;
    setLoading(true);
    api.getTrends({ ym, airport, startYear: era.start, endYear: era.end })
      .then(res => { if (!cancelled) setData(res); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym, airport, era]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const splitTimelineOption = useMemo(() => {
    if (!data?.timeline?.length) return null;
    const x = data.timeline.map(d => d.ym);
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
      },
      legend: { data: ['國際航線(含港澳)', '兩岸航線'], top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 20, top: 36, bottom: 52 },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', height: 20, bottom: 6, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: x, axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: '月載客人數',
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: fmtCompact },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: '國際航線(含港澳)',
          type: 'line',
          stack: 'total',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.45 },
          lineStyle: { width: 1.5, color: '#38bdf8' },
          itemStyle: { color: '#38bdf8' },
          data: data.timeline.map(d => d.intl_pax),
        },
        {
          name: '兩岸航線',
          type: 'line',
          stack: 'total',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.55 },
          lineStyle: { width: 1.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
          data: data.timeline.map(d => d.cross_strait_pax),
        },
      ],
    };
  }, [data, dark]);

  const yearlyOption = useMemo(() => {
    if (!data?.yearlySummary?.length) return null;
    const yrs = data.yearlySummary.map(d => `${d.year}${d.months_count < 12 ? '*' : ''}`);
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (params) => {
          const item = data.yearlySummary[params[0].dataIndex];
          return `<div class="font-semibold mb-1">${item.year} 年（含 ${item.months_count} 個月）</div>
            <div>總載客：<b>${fmtNum(item.pax)}</b> 人</div>
            <div>平均載客率：<b>${item.load_factor}%</b></div>
            <div>飛行架次：${fmtNum(item.flights)} 次｜航點：${item.dest_count} 個</div>`;
        },
      },
      legend: { data: ['年度載客人數', '年度平均載客率 (%)'], top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 50, top: 38, bottom: 28 },
      xAxis: { type: 'category', data: yrs, axisLabel: { color: textColor } },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: textColor, formatter: fmtCompact },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { color: textColor, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '年度載客人數',
          type: 'bar',
          data: data.yearlySummary.map(d => ({
            value: d.pax,
            itemStyle: {
              borderRadius: [5, 5, 0, 0],
              color: d.year >= 2020 && d.year <= 2022 ? '#f43f5e' : '#38bdf8',
            },
          })),
        },
        {
          name: '年度平均載客率 (%)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          lineStyle: { width: 2.5, color: '#34d399' },
          itemStyle: { color: '#34d399' },
          data: data.yearlySummary.map(d => d.load_factor),
        },
      ],
    };
  }, [data, dark]);

  const heatmapOption = useMemo(() => {
    if (!data?.heatmapDestinations?.length || !data?.heatmap?.length) return null;
    const dests = [...data.heatmapDestinations].reverse();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const destIdx = new Map(dests.map((d, i) => [d, i]));
    const points = data.heatmap
      .filter(h => destIdx.has(h.destination))
      .map(h => [h.month - 1, destIdx.get(h.destination), h.avg_lf]);

    return {
      tooltip: {
        position: 'top',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => {
          const d = dests[p.value[1]];
          const m = months[p.value[0]];
          return `<b>${d} · ${m}</b><br/>平均載客率：<b>${p.value[2]}%</b>`;
        },
      },
      grid: { left: 84, right: 24, top: 12, bottom: 52 },
      xAxis: { type: 'category', data: months, axisLabel: { color: textColor }, splitArea: { show: true } },
      yAxis: { type: 'category', data: dests, axisLabel: { color: textColor }, splitArea: { show: true } },
      visualMap: {
        min: 55,
        max: 95,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: textColor },
        inRange: {
          color: ['#1e3a5f', '#0284c7', '#10b981', '#f59e0b', '#ef4444'],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: points,
          label: { show: true, fontSize: 10, color: '#fff', formatter: (p) => `${Math.round(p.value[2])}` },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
    };
  }, [data, dark]);

  if (loading && !data) {
    return <div className="py-24 text-center text-slate-400 animate-pulse">正在計算 18 年歷史趨勢與季節性模型...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Annual Summary */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">台灣民航 18 年年度總運量（2009–2026）</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          紅色標示為疫情衝擊期間（2020–2022），* 表示當年尚未滿 12 個月
        </p>
        <EChart option={yearlyOption} height={310} />
      </div>

      {/* Intl vs Cross-Strait */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">國際航線 vs 兩岸航線 18 年板塊消長</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          直觀看見 2009–2015 兩岸直航爆發、2020 疫情冰封，以及解封後東北亞/東南亞國際線獨挑大樑的歷史軌跡
        </p>
        <EChart option={splitTimelineOption} height={310} />
      </div>

      {/* Seasonality Heatmap */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              熱門航點季節性載客率熱力圖（1~12 月）
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              顏色越紅代表該月份越搶手難買票！點擊格子可進入航線戰況室
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
            {ERA_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setEra(p)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  era.label === p.label ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <EChart
          option={heatmapOption}
          height={470}
          onChartClick={(p) => {
            if (p?.name && data?.heatmapDestinations && onSelectRoute) {
              const reversed = [...data.heatmapDestinations].reverse();
              const dest = reversed[p.value[1]];
              if (dest) onSelectRoute(dest);
            }
          }}
        />
      </div>

      {/* Automatic Insights Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm">YoY 成長最快航點</h3>
            <span className="text-[11px] text-slate-400 ml-auto">{fmtYmRoc(ym)}</span>
          </div>
          <div className="space-y-2">
            {(data?.insights?.fastestGrowing || []).map(r => (
              <div
                key={r.destination}
                onClick={() => onSelectRoute && onSelectRoute(r.destination)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-500/10 cursor-pointer text-xs"
              >
                <div>
                  <span className="font-medium text-sm">{r.destination}</span>
                  <div className="text-slate-400">{fmtCompact(r.prevPax)} → {fmtCompact(r.pax)}</div>
                </div>
                <span className="font-bold text-emerald-400 tabular-nums">+{r.yoyGrowth}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-rose-400" />
            <h3 className="font-semibold text-sm">YoY 衰退最多航點</h3>
            <span className="text-[11px] text-slate-400 ml-auto">{fmtYmRoc(ym)}</span>
          </div>
          <div className="space-y-2">
            {(data?.insights?.steepestDrop || []).map(r => (
              <div
                key={r.destination}
                onClick={() => onSelectRoute && onSelectRoute(r.destination)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-rose-500/10 cursor-pointer text-xs"
              >
                <div>
                  <span className="font-medium text-sm">{r.destination}</span>
                  <div className="text-slate-400">{fmtCompact(r.prevPax)} → {fmtCompact(r.pax)}</div>
                </div>
                <span className="font-bold text-rose-400 tabular-nums">{r.yoyGrowth}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <h3 className="font-semibold text-sm">較去年同期新開 / 復飛航點</h3>
            <span className="text-[11px] text-slate-400 ml-auto">{fmtYmRoc(ym)}</span>
          </div>
          <div className="space-y-2">
            {(data?.insights?.newOrResumed || []).map(r => (
              <div
                key={r.destination}
                onClick={() => onSelectRoute && onSelectRoute(r.destination)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-sky-500/10 cursor-pointer text-xs"
              >
                <div>
                  <span className="font-medium text-sm">{r.destination}</span>
                  <div className="text-slate-400">{r.flights} 架次 · 載客率 {r.lf}%</div>
                </div>
                <span className="font-bold text-sky-400 tabular-nums">{fmtCompact(r.pax)} 人</span>
              </div>
            ))}
            {!data?.insights?.newOrResumed?.length && (
              <div className="text-xs text-slate-400 py-6 text-center">本月無較去年同期新增航點</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
