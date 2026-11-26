import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function DeltaBadge({ label, value, suffix = '%' }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isZero = value === 0;
  const color = isZero
    ? 'text-slate-400 bg-slate-500/10'
    : isUp
      ? 'text-emerald-400 bg-emerald-500/15'
      : 'text-rose-400 bg-rose-500/15';
  const Icon = isZero ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label} {isUp ? '+' : ''}{value}{suffix}
    </span>
  );
}

export default function KpiCard({ title, value, subtitle, icon: Icon, accent = 'sky', mom, yoy, deltaSuffix = '%' }) {
  const accentMap = {
    sky: 'from-sky-500/20 to-blue-600/5 text-sky-400 border-sky-500/20',
    emerald: 'from-emerald-500/20 to-teal-600/5 text-emerald-400 border-emerald-500/20',
    violet: 'from-violet-500/20 to-purple-600/5 text-violet-400 border-violet-500/20',
    amber: 'from-amber-500/20 to-orange-600/5 text-amber-400 border-amber-500/20',
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 p-5 shadow-sm backdrop-blur transition hover:border-sky-500/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl bg-gradient-to-br border ${accentMap[accent] || accentMap.sky}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      {(mom !== undefined || yoy !== undefined) && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          <DeltaBadge label="MoM" value={mom} suffix={deltaSuffix} />
          <DeltaBadge label="YoY" value={yoy} suffix={deltaSuffix} />
        </div>
      )}
    </div>
  );
}
