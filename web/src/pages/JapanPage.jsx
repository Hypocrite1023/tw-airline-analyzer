import { useEffect, useState, useMemo } from 'react';
import { Users, Gauge, Plane, Globe2 } from 'lucide-react';
import { api, fmtNum, fmtCompact } from '../api';
import KpiCard from '../components/KpiCard';
import EChart from '../components/EChart';

export default function JapanPage({ dark }) {
  const [ym, setYm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState('東京（羽田）－新千歳');
  const [routeHist, setRouteHist] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getJpOverview({ ym })
      .then(res => {
        if (cancelled) return;
        setData(res);
        if (!ym && res.ym) setYm(res.ym);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym]);

  useEffect(() => {
    if (!selectedRoute) return;
    let cancelled = false;
    api.getJpRoute(selectedRoute)
      .then(res => { if (!cancelled) setRouteHist(res); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [selectedRoute]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const historyOption = useMemo(() => {
    if (!data?.history?.length) return null;
    const x = data.history.map(h => h.ym);
    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: ['國內線載客', '日籍國際線載客', '國內線載客率 %', '國際線載客率 %'], top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 50, top: 40, bottom: 48 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 4, borderColor: 'transparent', textStyle: { color: textColor } }],
      xAxis: { type: 'category', data: x, axisLabel: { color: textColor } },
      yAxis: [
        { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
        { type: 'value', min: 0, max: 100, axisLabel: { color: textColor, formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        { name: '國內線載客', type: 'bar', itemStyle: { color: 'rgba(244,63,94,0.65)', borderRadius: [3, 3, 0, 0] }, data: data.history.map(h => h.dom_pax) },
        { name: '日籍國際線載客', type: 'bar', itemStyle: { color: 'rgba(56,189,248,0.85)', borderRadius: [3, 3, 0, 0] }, data: data.history.map(h => h.intl_pax) },
        { name: '國內線載客率 %', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, lineStyle: { width: 2, color: '#fb7185' }, data: data.history.map(h => h.dom_lf) },
        { name: '國際線載客率 %', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, lineStyle: { width: 2, color: '#34d399' }, data: data.history.map(h => h.intl_lf) },
      ],
    };
  }, [data, dark]);

  const domRoutesOption = useMemo(() => {
    if (!data?.domRoutes?.length) return null;
    const list = data.domRoutes.slice(0, 15).reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => {
          const r = list[p[0].dataIndex];
          return `<b>${r.route}</b> (${r.category})<br/>載客：${fmtNum(r.pax)} 人<br/>前年同月比：${r.pax_yoy ?? '-'}%｜貨運：${fmtNum(Math.round(r.cargo_tons))} 噸`;
        },
      },
      grid: { left: 150, right: 64, top: 10, bottom: 22 },
      xAxis: { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: 'category', data: list.map(r => r.route), axisLabel: { color: textColor, fontSize: 11 } },
      series: [{
        type: 'bar',
        data: list.map(r => ({
          value: r.pax,
          itemStyle: { borderRadius: [0, 6, 6, 0], color: r.route === selectedRoute ? '#f59e0b' : '#f43f5e' },
        })),
        label: { show: true, position: 'right', color: textColor, fontSize: 11, formatter: (p) => fmtCompact(p.value) },
      }],
    };
  }, [data, selectedRoute, dark]);

  const intlRegionOption = useMemo(() => {
    if (!data?.intlRegions?.length) return null;
    const colors = ['#38bdf8', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#2dd4bf'];
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => `<b>${p.name}</b><br/>載客：${fmtNum(p.value)} 人 (${p.percent}%)<br/>前年比：${p.data.yoy ?? '-'}%`,
      },
      legend: { bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['50%', '43%'],
        itemStyle: { borderRadius: 6, borderColor: dark ? '#0f172a' : '#fff', borderWidth: 2 },
        data: data.intlRegions.map((r, i) => ({
          name: r.region,
          value: r.pax,
          yoy: r.pax_yoy,
          itemStyle: { color: colors[i % colors.length] },
        })),
      }],
    };
  }, [data, dark]);

  const routeHistOption = useMemo(() => {
    if (!routeHist?.history?.length) return null;
    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      grid: { left: 56, right: 20, top: 24, bottom: 32 },
      xAxis: { type: 'category', data: routeHist.history.map(h => h.ym), axisLabel: { color: textColor } },
      yAxis: { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      series: [{
        name: '月載客人數',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: '#f59e0b' },
        areaStyle: { color: 'rgba(245,158,11,0.18)' },
        data: routeHist.history.map(h => h.pax),
      }],
    };
  }, [routeHist, dark]);

  if (loading && !data) return <div className="py-24 text-center text-slate-400 animate-pulse">載入日本國土交通省 MLIT 數據中...</div>;
  if (!data || data.empty) return <div className="py-24 text-center text-slate-400">尚無日本資料</div>;

  const { kpi } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">🇯🇵 日本航空輸送統計 · {data.ym}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            資料來源：日本國土交通省 MLIT（e-Stat 航空輸送統計速報，日籍航空國內線＋國際線，共 {data.months.length} 個月）
          </p>
        </div>
        <select
          value={ym}
          onChange={e => setYm(e.target.value)}
          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
        >
          {data.months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="日本國內線總載客" value={fmtNum(kpi.dom_pax)} subtitle={`運航 ${fmtNum(kpi.dom_flights)} 次｜貨運 ${fmtNum(Math.round(kpi.dom_cargo_tons))} 噸`} icon={Users} accent="sky" yoy={kpi.yoyDomPax} />
        <KpiCard title="國內線平均載客率" value={`${kpi.dom_lf}%`} subtitle={`幹線 ${kpi.dom_trunk_lf}% ｜ 地方線 ${kpi.dom_local_lf}%`} icon={Gauge} accent="emerald" />
        <KpiCard title="日籍國際線總載客" value={fmtNum(kpi.intl_pax)} subtitle={`運航 ${fmtNum(kpi.intl_flights)} 次｜貨運 ${fmtNum(Math.round(kpi.intl_cargo_tons))} 噸`} icon={Globe2} accent="violet" yoy={kpi.yoyIntlPax} />
        <KpiCard title="日籍國際線載客率" value={`${kpi.intl_lf}%`} subtitle="JAL / ANA / ZIPAIR / Peach 等日籍航司" icon={Plane} accent="amber" />
      </div>

      {/* Macro History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">日本國內線 vs 日籍國際線歷年走勢（2020–2026）</h3>
        <EChart option={historyOption} height={310} />
      </div>

      {/* Domestic Trunk Routes + International Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">日本超級國內幹線排行 Top 15</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">羽田–新千歲、羽田–福岡單月即可破百萬人次！點擊長條查看下方歷年走勢</p>
          <EChart
            option={domRoutesOption}
            height={420}
            onChartClick={(p) => {
              const list = data.domRoutes.slice(0, 15).reverse();
              const item = list[p.dataIndex];
              if (item?.route) setSelectedRoute(item.route);
            }}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">日籍國際線七大區域分佈</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">註：台灣歸類於「その他アジア」</p>
          <EChart
            option={intlRegionOption}
            height={360}
            onChartClick={(p) => {
              if (p?.name) setSelectedRoute(p.name);
            }}
          />
        </div>
      </div>

      {/* Selected Route History */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold">「{selectedRoute}」歷年載客走勢</h3>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {['東京（羽田）－新千歳', '東京（羽田）－福岡', '東京（羽田）－沖縄（那覇）', '東京（羽田）－大阪', '中国', '韓国', 'その他アジア'].map(r => (
              <button
                key={r}
                onClick={() => setSelectedRoute(r)}
                className={`px-2 py-0.5 rounded ${selectedRoute === r ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <EChart option={routeHistOption} height={280} />
      </div>
    </div>
  );
}
