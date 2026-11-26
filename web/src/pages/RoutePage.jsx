import { useEffect, useState, useMemo } from 'react';
import { Search, MapPin } from 'lucide-react';
import { api, fmtNum, fmtCompact, fmtYmRoc } from '../api';
import EChart from '../components/EChart';

const QUICK_ROUTES = ['大阪', '東京成田', '首爾仁川', '香港', '曼谷', '新加坡', '札幌', '東京羽田', '洛杉磯', '上海浦東'];
const PALETTE = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#f97316', '#2dd4bf', '#60a5fa', '#e879f9', '#94a3b8'];

export default function RoutePage({ ym, airport, destination, setDestination, meta, dark }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (!ym || !destination) return;
    let cancelled = false;
    setLoading(true);
    api.getRoute({ destination, airport, ym })
      .then(res => { if (!cancelled) setData(res); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ym, airport, destination]);

  const filteredDests = useMemo(() => {
    const list = meta?.destinations || [];
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 80);
    return list.filter(d =>
      d.destination.toLowerCase().includes(q) ||
      (d.iata && d.iata.toLowerCase().includes(q)) ||
      (d.icao && d.icao.toLowerCase().includes(q)) ||
      (d.en && d.en.toLowerCase().includes(q))
    ).sort((a, b) => {
      // Exact IATA or ICAO match first
      const aExact = a.iata?.toLowerCase() === q || a.icao?.toLowerCase() === q ? 1 : 0;
      const bExact = b.iata?.toLowerCase() === q || b.icao?.toLowerCase() === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return b.total_pax - a.total_pax;
    }).slice(0, 40);
  }, [meta, query]);

  const currentDestInfo = useMemo(() => {
    return (meta?.destinations || []).find(d => d.destination === destination);
  }, [meta, destination]);

  const textColor = dark ? '#cbd5e1' : '#334155';
  const gridColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  const tooltipBg = dark ? '#0f172a' : '#ffffff';
  const tooltipBorder = dark ? '#334155' : '#e2e8f0';

  const shareOption = useMemo(() => {
    if (!data?.airlines?.length) return null;
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => `<b>${p.name}</b><br/>載客：${fmtNum(p.value)} 人 (${p.percent}%)<br/>載客率：${p.data.lf}%`,
      },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '70%'],
          center: ['50%', '44%'],
          itemStyle: { borderRadius: 5, borderColor: dark ? '#0f172a' : '#fff', borderWidth: 2 },
          label: { show: true, color: textColor, fontSize: 11, formatter: '{b}\n{d}%' },
          data: data.airlines.map((a, i) => ({
            name: a.airline,
            value: a.pax,
            lf: a.load_factor,
            itemStyle: { color: PALETTE[i % PALETTE.length] },
          })),
        },
      ],
    };
  }, [data, dark]);

  const scatterOption = useMemo(() => {
    if (!data?.airlines?.length) return null;
    const maxPax = Math.max(...data.airlines.map(a => a.pax), 1);
    return {
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textColor },
        formatter: (p) => {
          const a = p.data.raw;
          return `<div class="font-semibold mb-1">${a.airline}</div>
            <div>座位供給：<b>${fmtNum(a.seats)}</b> 位</div>
            <div>載客人數：<b>${fmtNum(a.pax)}</b> 人</div>
            <div>載客率：<b>${a.load_factor}%</b></div>
            <div>平均單機：${a.avg_seats} 座</div>`;
        },
      },
      grid: { left: 54, right: 24, top: 24, bottom: 44 },
      xAxis: {
        type: 'value',
        name: '座位供給數',
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: fmtCompact },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        name: '載客率 %',
        nameTextStyle: { color: textColor },
        min: (v) => Math.max(0, Math.floor(v.min / 10) * 10 - 10),
        max: 100,
        axisLabel: { color: textColor, formatter: '{value}%' },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          type: 'scatter',
          data: data.airlines.map((a, i) => ({
            value: [a.seats, a.load_factor],
            symbolSize: Math.max(18, Math.sqrt(a.pax / maxPax) * 52),
            itemStyle: { color: PALETTE[i % PALETTE.length], opacity: 0.85 },
            label: { show: true, position: 'top', formatter: a.airline, color: textColor, fontSize: 11 },
            raw: a,
          })),
        },
      ],
    };
  }, [data, dark]);

  const battleHistoryOption = useMemo(() => {
    if (!data?.history?.length) return null;
    const allYms = data.history.map(h => h.ym);
    const series = (data.topHistAirlines || []).map((airline, idx) => {
      const map = new Map((data.airlineHistory[airline] || []).map(r => [r.ym, r.pax]));
      return {
        name: airline,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: PALETTE[idx % PALETTE.length] },
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
      legend: { type: 'scroll', top: 0, textStyle: { color: textColor } },
      grid: { left: 56, right: 20, top: 38, bottom: 52 },
      dataZoom: [
        { type: 'inside', start: 50, end: 100 },
        { type: 'slider', height: 20, bottom: 6, borderColor: 'transparent', textStyle: { color: textColor } },
      ],
      xAxis: { type: 'category', data: allYms, axisLabel: { color: textColor } },
      yAxis: {
        type: 'value',
        name: '月載客人數',
        nameTextStyle: { color: textColor },
        axisLabel: { color: textColor, formatter: fmtCompact },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series,
    };
  }, [data, dark]);

  const totalPax = data?.airlines?.reduce((s, a) => s + a.pax, 0) || 0;
  const totalSeats = data?.airlines?.reduce((s, a) => s + a.seats, 0) || 0;
  const totalFlights = data?.airlines?.reduce((s, a) => s + a.flights, 0) || 0;
  const avgLf = totalSeats > 0 ? ((totalPax / totalSeats) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Route Picker */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 160)}
              onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredDests.length > 0) {
                  setDestination(filteredDests[0].destination);
                  setQuery('');
                  setShowSuggest(false);
                }
              }}
              placeholder="搜尋中文、IATA (KIX) 或 ICAO (RJBB)..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-sky-500"
            />
            {showSuggest && query.trim() && (
              <div className="absolute z-40 mt-1.5 w-full max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDests.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-400">找不到符合的航點</div>
                ) : (
                  filteredDests.slice(0, 12).map(d => (
                    <button
                      key={d.destination}
                      type="button"
                      onMouseDown={() => {
                        setDestination(d.destination);
                        setQuery('');
                        setShowSuggest(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-sky-500/10 flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">{d.destination}</span>
                        {d.en && <span className="ml-1.5 text-slate-400">{d.en}</span>}
                      </div>
                      {d.iata && (
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 shrink-0">
                          {d.iata} / {d.icao}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <select
            value={destination}
            onChange={e => setDestination(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
          >
            {filteredDests.map(d => (
              <option key={d.destination} value={d.destination}>
                {d.iata ? `[${d.iata}] ` : ''}{d.destination}{d.icao ? ` (${d.icao})` : ''} · {fmtCompact(d.total_pax)}
              </option>
            ))}
          </select>
          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold text-slate-900 dark:text-white text-base">{destination}</span>
            {currentDestInfo?.iata && (
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 font-semibold">
                {currentDestInfo.iata} / {currentDestInfo.icao}
              </span>
            )}
            {currentDestInfo?.en && (
              <span className="hidden sm:inline text-slate-400">{currentDestInfo.en}</span>
            )}
            <span>· {fmtYmRoc(ym)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ROUTES.map(r => (
            <button
              key={r}
              onClick={() => setDestination(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                destination === r
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-sky-500/20'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 text-center text-slate-400 animate-pulse">載入航線戰況中...</div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">當月總載客</div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{fmtNum(totalPax)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">航線平均載客率</div>
              <div className="text-2xl font-bold mt-1 tabular-nums text-emerald-400">{avgLf}%</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">總飛行架次</div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{fmtNum(totalFlights)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">執飛航空公司</div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{data?.airlines?.length || 0} 家</div>
            </div>
          </div>

          {data?.airlines?.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-10 text-center text-slate-400">
              {destination} 在 {fmtYmRoc(ym)}（{airport}）無定期航班紀錄，但下方仍可檢視歷史開航軌跡。
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">航空公司市占率分佈</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">誰在「{destination}」航線吃下最大塊餅？</p>
                <EChart option={shareOption} height={330} />
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">競爭定位象限（供給量 vs 載客率）</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">越右上代表「運能大又塞滿」，氣泡大小為載客人數</p>
                <EChart option={scatterOption} height={330} />
              </div>
            </div>
          )}

          {/* Historical Airline Battle */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
              「{destination}」主要航空公司歷年消長戰況
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              追蹤歷年累計前 6 大航空在此航線的每月載客變化（可拖曳下方時間軸回顧至 2009 年）
            </p>
            {battleHistoryOption ? (
              <EChart option={battleHistoryOption} height={340} />
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">無歷史數據</div>
            )}
          </div>

          {/* Detail Table */}
          {data?.airlines?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">各航司詳細營運數據</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-2">航空公司</th>
                      <th className="py-2.5 px-2 text-right">市占率</th>
                      <th className="py-2.5 px-2 text-right">載客人數</th>
                      <th className="py-2.5 px-2 text-right">座位總數</th>
                      <th className="py-2.5 px-2 text-right">飛行架次</th>
                      <th className="py-2.5 px-2 text-right">合計載客率</th>
                      <th className="py-2.5 px-2 text-right">入境載客率</th>
                      <th className="py-2.5 px-2 text-right">出境載客率</th>
                      <th className="py-2.5 px-2 text-right">推估機型</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {data.airlines.map(a => (
                      <tr key={a.airline} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-2 font-medium">{a.airline}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-sky-400 font-semibold">{a.marketShare}%</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.pax)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{fmtNum(a.seats)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{fmtNum(a.flights)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{a.load_factor}%</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.lf_in}%</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.lf_out}%</td>
                        <td className="py-2.5 px-2 text-right text-xs">
                          <span className={`px-2 py-0.5 rounded-md ${a.avg_seats >= 260 ? 'bg-violet-500/15 text-violet-400' : 'bg-slate-500/15 text-slate-400'}`}>
                            {a.avg_seats}座 · {a.avg_seats >= 260 ? '廣體' : '窄體'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
