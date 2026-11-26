import { useEffect, useState, useMemo } from 'react';
import { api, fmtCompact, fmtNum } from '../api';
import EChart from '../components/EChart';

export default function EastAsiaPage({ dark }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEastAsiaCompare()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const { paxOption, lfOption, bilateralOption } = useMemo(() => {
    if (!data) return {};
    const ymSet = new Set([
      ...data.tw.map(d => d.ym),
      ...data.kr.map(d => d.ym),
      ...data.jp.map(d => d.ym),
    ]);
    const yms = Array.from(ymSet).sort();

    const twMap = new Map(data.tw.map(d => [d.ym, d]));
    const krMap = new Map(data.kr.map(d => [d.ym, d]));
    const jpMap = new Map(data.jp.map(d => [d.ym, d]));

    const baseGrid = { left: 58, right: 20, top: 40, bottom: 48 };
    const baseZoom = [
      { type: 'inside' },
      { type: 'slider', height: 18, bottom: 4, borderColor: 'transparent', textStyle: { color: textColor } },
    ];

    const paxOption = {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: ['🇰🇷 韓國國際線', '🇹🇼 台灣國際+兩岸線', '🇯🇵 日本日籍國際線', '🇯🇵 日本國內線'], top: 0, textStyle: { color: textColor } },
      grid: baseGrid,
      dataZoom: baseZoom,
      xAxis: { type: 'category', data: yms, axisLabel: { color: textColor } },
      yAxis: { type: 'value', name: '月載客人次', nameTextStyle: { color: textColor }, axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      series: [
        { name: '🇰🇷 韓國國際線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#818cf8' }, data: yms.map(m => krMap.get(m)?.pax ?? null) },
        { name: '🇹🇼 台灣國際+兩岸線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#38bdf8' }, data: yms.map(m => twMap.get(m)?.pax ?? null) },
        { name: '🇯🇵 日本日籍國際線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.2, color: '#34d399' }, data: yms.map(m => jpMap.get(m)?.intl_pax ?? null) },
        { name: '🇯🇵 日本國內線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 1.8, type: 'dashed', color: '#fb7185' }, data: yms.map(m => jpMap.get(m)?.dom_pax ?? null) },
      ],
    };

    const lfOption = {
      tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
      legend: { data: ['🇹🇼 台灣國際線', '🇰🇷 韓國國際線', '🇯🇵 日本日籍國際線', '🇯🇵 日本國內線'], top: 0, textStyle: { color: textColor } },
      grid: baseGrid,
      dataZoom: baseZoom,
      xAxis: { type: 'category', data: yms, axisLabel: { color: textColor } },
      yAxis: { type: 'value', min: 0, max: 100, name: '載客率 %', nameTextStyle: { color: textColor }, axisLabel: { color: textColor, formatter: '{value}%' }, splitLine: { lineStyle: { color: gridColor } } },
      series: [
        { name: '🇹🇼 台灣國際線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#38bdf8' }, data: yms.map(m => twMap.get(m)?.lf ?? null) },
        { name: '🇰🇷 韓國國際線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#818cf8' }, data: yms.map(m => krMap.get(m)?.lf ?? null) },
        { name: '🇯🇵 日本日籍國際線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.2, color: '#34d399' }, data: yms.map(m => jpMap.get(m)?.intl_lf ?? null) },
        { name: '🇯🇵 日本國內線', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 1.8, type: 'dashed', color: '#fb7185' }, data: yms.map(m => jpMap.get(m)?.dom_lf ?? null) },
      ],
    };

    const twKrMap = new Map(data.bilateral.twToKr.map(d => [d.ym, d.pax]));
    const krTwMap = new Map(data.bilateral.krToTw.map(d => [d.ym, d.pax]));
    const bilateralOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (params) => {
          const p0 = params[0];
          const p1 = params[1];
          return `<div class="font-semibold mb-1">${p0.axisValue} 台韓雙邊客流</div>
            <div>🇹🇼 台灣民航局統計：<b>${fmtNum(p0.value)}</b> 人</div>
            ${p1 ? `<div>🇰🇷 韓國 Air Portal 統計：<b>${fmtNum(p1.value)}</b> 人</div>` : ''}`;
        },
      },
      legend: { data: ['🇹🇼 台灣民航局（飛韓國各航點）', '🇰🇷 韓國 Air Portal（飛台灣各航點）'], top: 0, textStyle: { color: textColor } },
      grid: { left: 58, right: 20, top: 38, bottom: 32 },
      xAxis: { type: 'category', data: yms, axisLabel: { color: textColor } },
      yAxis: { type: 'value', axisLabel: { color: textColor, formatter: fmtCompact }, splitLine: { lineStyle: { color: gridColor } } },
      series: [
        { name: '🇹🇼 台灣民航局（飛韓國各航點）', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#38bdf8' }, data: yms.map(m => twKrMap.get(m) ?? null) },
        { name: '🇰🇷 韓國 Air Portal（飛台灣各航點）', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5, type: 'dashed', color: '#f59e0b' }, data: yms.map(m => krTwMap.get(m) ?? null) },
      ],
    };

    return { paxOption, lfOption, bilateralOption };
  }, [data, dark]);

  if (loading) return <div className="py-24 text-center text-slate-400 animate-pulse">正在整合台、韓、日三國官方統計數據...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">🌏 東亞三國航空大對決（🇹🇼 台灣 vs 🇰🇷 韓國 vs 🇯🇵 日本）</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          同步整合台灣民航局（CAA）、韓國國土交通部（Air Portal）與日本國土交通省（MLIT e-Stat）三方官方月報
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">三國月度總載客量對決（2019–2026）</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          註：日本國際線為日籍航司統計；台灣與韓國為該國機場全部國際線（含外籍航司）
        </p>
        <EChart option={paxOption} height={330} />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">三國平均載客率（Load Factor）復甦對決</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          看誰在疫情斷崖時撐最久、解封後誰的飛機最滿！
        </p>
        <EChart option={lfOption} height={320} />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold mb-1">台韓雙邊官方數據交叉驗證（🇹🇼 CAA vs 🇰🇷 Air Portal）</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          將台灣民航局統計的「台→韓」與韓國統計的「韓→台」疊在一起比對，兩條曲線幾乎完美重合（細微差距來自包機／不定期航班與統計口徑）
        </p>
        <EChart option={bilateralOption} height={300} />
      </div>
    </div>
  );
}
