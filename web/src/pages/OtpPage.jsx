import { useEffect, useState, useMemo } from 'react';
import { Clock, Trophy, AlertCircle, XCircle } from 'lucide-react';
import { api, fmtNum, fmtYmRoc } from '../api';
import KpiCard from '../components/KpiCard';
import EChart from '../components/EChart';

const COLORS = {
  '中華': '#38bdf8',
  '長榮': '#10b981',
  '星宇': '#f59e0b',
  '台灣虎航': '#fb7185',
  '立榮': '#a78bfa',
  '華信': '#2dd4bf',
  '德安': '#94a3b8',
};

export default function OtpPage({ dark }) {
  const [ym, setYm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getTwOtp(ym)
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

  const rankOption = useMemo(() => {
    if (!data?.airlines?.length) return null;
    const sorted = [...data.airlines].sort((a, b) => a.otp_rate - b.otp_rate);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => {
          const a = sorted[p[0].dataIndex];
          return `<b>${a.airline}</b><br/>準點率：<b>${a.otp_rate}%</b><br/>離場：${fmtNum(a.departures)} 班｜延誤：${fmtNum(a.delays)} 班<br/>可歸責取消：${a.cancel_fault} 班`;
        },
      },
      grid: { left: 78, right: 64, top: 12, bottom: 24 },
      xAxis: {
        type: 'value',
        min: (v) => Math.max(0, Math.floor(v.min / 5) * 5 - 5),
        max: 100,
        axisLabel: { color: textColor, formatter: '{value}%' },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: { type: 'category', data: sorted.map(a => a.airline), axisLabel: { color: textColor, fontWeight: 600 } },
      series: [{
        type: 'bar',
        data: sorted.map(a => ({
          value: a.otp_rate,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: a.otp_rate >= 95 ? '#10b981' : a.otp_rate >= 90 ? '#38bdf8' : '#f59e0b',
          },
        })),
        label: { show: true, position: 'right', color: textColor, fontWeight: 600, formatter: '{c}%' },
      }],
    };
  }, [data, dark]);

  const historyOption = useMemo(() => {
    if (!data?.overallHistory?.length) return null;
    const allYms = data.overallHistory.map(h => h.ym);
    const carriers = ['中華', '長榮', '星宇', '台灣虎航', '立榮', '華信'];

    const series = carriers.map(c => {
      const map = new Map((data.historyByAirline[c] || []).map(r => [r.ym, r.otp_rate]));
      return {
        name: c,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.2, color: COLORS[c] },
        itemStyle: { color: COLORS[c] },
        data: allYms.map(m => map.get(m) ?? null),
      };
    });

    return {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: carriers, top: 0, textStyle: { color: textColor } },
      grid: { left: 54, right: 20, top: 38, bottom: 48 },
      dataZoom: [
        { type: 'inside', start: 50, end: 100 },
        { type: 'slider', height: 18, bottom: 4, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: allYms, axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: '準點率 %',
        min: 70,
        max: 100,
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: '{value}%' },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series,
    };
  }, [data, dark]);

  if (loading && !data) return <div className="py-24 text-center text-slate-400 animate-pulse">載入台灣班機準點率與取消數據中...</div>;
  if (!data || data.empty) return <div className="py-24 text-center text-slate-400">尚無準點率資料</div>;

  const { kpi } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">⏱️ 國籍航空準點率與取消分析 · {fmtYmRoc(data.ym)}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            資料來源：交通部民航局（a=1750，扣除不可歸責業者因素之離場準點率與不正常取消統計，共 {data.months.length} 個月）
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="當月整體平均準點率" value={`${kpi.avgOtp}%`} subtitle={`總離場 ${fmtNum(kpi.totalDep)} 架次`} icon={Clock} accent="sky" />
        <KpiCard title="本月最準點冠軍" value={`${kpi.bestAirline} (${kpi.bestOtp}%)`} subtitle="扣除不可歸責因素後準點率第一" icon={Trophy} accent="emerald" />
        <KpiCard title="當月延誤總架次" value={fmtNum(kpi.totalDel)} subtitle={`整體延誤率 ${(100 - kpi.avgOtp).toFixed(2)}%`} icon={AlertCircle} accent="amber" />
        <KpiCard title="總取消 / 可歸責取消" value={`${fmtNum(kpi.totalCancel)} / ${fmtNum(kpi.totalFault)}`} subtitle="可歸責業者因素之取消架次" icon={XCircle} accent="violet" />
      </div>

      {/* Rank Bar + History Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">當月準點率排行榜</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">綠 ≥ 95% ｜ 藍 ≥ 90% ｜ 橘 &lt; 90%</p>
          <EChart option={rankOption} height={320} />
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
          <h3 className="font-semibold mb-1">各國籍航空歷年準點率走勢</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            可一眼看出誰長期穩居準點前段班、哪個月份（如暑假/颱風季/航管流控）延誤率特別高
          </p>
          <EChart option={historyOption} height={320} />
        </div>
      </div>

      {/* Detailed Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-3">各航空公司離場、延誤與取消明細 · {fmtYmRoc(data.ym)}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-2">航空公司</th>
                <th className="py-2.5 px-2 text-right">準點率</th>
                <th className="py-2.5 px-2 text-right">延誤率</th>
                <th className="py-2.5 px-2 text-right">總離場架次</th>
                <th className="py-2.5 px-2 text-right">總延誤架次</th>
                <th className="py-2.5 px-2 text-right">桃園離場 / 延誤</th>
                <th className="py-2.5 px-2 text-right">總取消</th>
                <th className="py-2.5 px-2 text-right">可歸責取消</th>
                <th className="py-2.5 px-2 text-right">可歸責執行率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.airlines.map(a => (
                <tr key={a.airline} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-2 font-semibold">{a.airline}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.otp_rate >= 95 ? 'bg-emerald-500/15 text-emerald-400'
                        : a.otp_rate >= 90 ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {a.otp_rate}%
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.delay_rate}%</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.departures)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-amber-400 font-medium">{fmtNum(a.delays)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {a.tpe_departures > 0 ? `${fmtNum(a.tpe_departures)} / ${fmtNum(a.tpe_delays)}` : '-'}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.cancel_total)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-rose-400 font-medium">{fmtNum(a.cancel_fault)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">{a.exec_rate ? `${a.exec_rate}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
