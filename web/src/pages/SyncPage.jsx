import { useEffect, useState, useMemo } from 'react';
import { Database, ShieldCheck, CalendarCheck2 } from 'lucide-react';
import { api, fmtNum } from '../api';

export default function SyncPage({ meta, onJumpMonth }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.getSyncStatus().then(setStatus).catch(console.error);
  }, []);

  const matrix = useMemo(() => {
    const list = status?.localMonths || meta?.months || [];
    const map = new Map(list.map(m => [m.ym, m]));
    const years = Array.from(new Set(list.map(m => Number(m.ym.split('-')[0])))).sort((a, b) => b - a);
    return { years, map };
  }, [status, meta]);

  const updatedText = status?.generatedAt
    ? new Date(status.generatedAt).toLocaleString('zh-TW', { hour12: false })
    : '-';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Database className="w-5 h-5 text-sky-400" />
              資料收錄與自動更新狀態（台灣民航局 CAA）
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              目前已收錄 <b>{meta?.summary?.totalMonths || 0}</b> 個月份（{meta?.summary?.minYm} ～ {meta?.summary?.maxYm}），
              共 <b>{fmtNum(meta?.summary?.totalRows || 0)}</b> 筆定期航線載客紀錄，並整合 18 年貨運（a=1738 / a=1736）與準點率（a=1750）統計。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              純靜態唯讀模式（零伺服器風險）
            </span>
            <span className="inline-flex items-center gap-1 text-slate-400">
              <CalendarCheck2 className="w-3.5 h-3.5" />
              資料建置時間：{updatedText}
            </span>
          </div>
        </div>
      </div>

      {/* Coverage Matrix */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5">
        <h3 className="font-semibold text-sm mb-1">歷年收錄月份總覽（點擊任一月份直接跳轉分析）</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          綠色方格顯示當月全台平均載客率，代表已完成下載、解析並通過民航局官方總計驗證
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-separate border-spacing-1">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left px-2 py-1">年份 (民國)</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="py-1">{i + 1}月</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.years.map(y => (
                <tr key={y}>
                  <td className="text-left px-2 py-1 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {y} <span className="text-slate-400 font-normal">({y - 1911}年)</span>
                  </td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const ymKey = `${y}-${String(i + 1).padStart(2, '0')}`;
                    const info = matrix.map.get(ymKey);
                    return (
                      <td key={i}>
                        {info ? (
                          <button
                            onClick={() => onJumpMonth && onJumpMonth(ymKey)}
                            title={`${ymKey}：${fmtNum(info.total_pax)} 人，載客率 ${info.load_factor}%`}
                            className="w-full py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 font-semibold tabular-nums transition"
                          >
                            {info.load_factor}%
                          </button>
                        ) : (
                          <div className="w-full py-1.5 rounded-md bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600">
                            -
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
