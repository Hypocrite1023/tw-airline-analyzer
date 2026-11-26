import { useEffect, useState, useCallback } from 'react';
import {
  Plane, BarChart3, MapPin, Building2, TrendingUp, Database, Sun, Moon, Calendar, Filter, Package, Clock
} from 'lucide-react';
import { api, fmtYmRoc } from './api';
import OverviewPage from './pages/OverviewPage';
import RoutePage from './pages/RoutePage';
import AirlinePage from './pages/AirlinePage';
import TrendsPage from './pages/TrendsPage';
import CargoPage from './pages/CargoPage';
import OtpPage from './pages/OtpPage';
import SyncPage from './pages/SyncPage';

const TABS = [
  { id: 'overview', label: '市場總覽', icon: BarChart3 },
  { id: 'route', label: '航線戰況室', icon: MapPin },
  { id: 'airline', label: '航司競技場', icon: Building2 },
  { id: 'trends', label: '18年趨勢', icon: TrendingUp },
  { id: 'cargo', label: '貨運分析', icon: Package },
  { id: 'otp', label: '準點與取消', icon: Clock },
  { id: 'sync', label: '資料同步', icon: Database },
];

export default function App() {
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState('overview');
  const [meta, setMeta] = useState(null);
  const [ym, setYm] = useState('');
  const [airport, setAirport] = useState('ALL');
  const [routeType, setRouteType] = useState('ALL');
  const [destination, setDestination] = useState('大阪');
  const [selectedAirlines, setSelectedAirlines] = useState(['中華', '長榮', '星宇', '台灣虎航']);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const loadMeta = useCallback(() => {
    api.getMeta()
      .then(res => {
        setMeta(res);
        setYm(prev => prev || res.summary?.maxYm || '');
        setError(null);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const handleSelectRoute = (dest) => {
    setDestination(dest);
    setTab('route');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectAirline = (airline) => {
    setSelectedAirlines(prev => [airline, ...prev.filter(a => a !== airline)].slice(0, 6));
    setTab('airline');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpMonth = (targetYm) => {
    setYm(targetYm);
    setTab('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-15 gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
                <Plane className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-sm sm:text-base tracking-tight leading-none">
                  TW Airline Analyzer
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  台灣民航載客率大數據 ({meta?.summary?.minYm?.slice(0, 4) || '2009'}–{meta?.summary?.maxYm?.slice(0, 4) || '2026'})
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1">
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                      active
                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Theme Toggle */}
            <button
              onClick={() => setDark(d => !d)}
              title="切換深色 / 淺色模式"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 hover:border-sky-500/50 transition"
            >
              {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
          </div>

          {/* Mobile Tabs */}
          <div className="flex md:hidden overflow-x-auto gap-1 pb-2.5">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition ${
                    active ? 'bg-sky-500 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Global Filter Bar (Taiwan views) */}
      {['overview', 'route', 'airline', 'trends'].includes(tab) && meta && (
        <div className="border-b border-slate-200 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-500 dark:text-slate-400">統計月份：</span>
              <select
                value={ym}
                onChange={e => setYm(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium focus:outline-none focus:border-sky-500"
              >
                {meta.months.map(m => (
                  <option key={m.ym} value={m.ym}>
                    {fmtYmRoc(m.ym)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-500 dark:text-slate-400">機場：</span>
              <select
                value={airport}
                onChange={e => setAirport(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium focus:outline-none focus:border-sky-500"
              >
                {meta.airports.map(a => (
                  <option key={a.code} value={a.code}>{a.label}</option>
                ))}
              </select>
            </div>

            {tab === 'overview' && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400">板塊：</span>
                <select
                  value={routeType}
                  onChange={e => setRouteType(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="ALL">全部航線</option>
                  <option value="國際航線(含港澳)">國際航線(含港澳)</option>
                  <option value="兩岸航線">兩岸航線</option>
                </select>
              </div>
            )}

            <div className="ml-auto hidden sm:block text-slate-400">
              資料來源：交通部民用航空局 (CAA) · 共 {meta.summary.totalMonths} 個月
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-400 text-sm">
            無法連線後端 API：{error}
          </div>
        ) : !meta ? (
          <div className="py-24 text-center text-slate-400 animate-pulse">初始化台灣航空大數據平台...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewPage
                ym={ym}
                airport={airport}
                routeType={routeType}
                dark={dark}
                onSelectRoute={handleSelectRoute}
                onSelectAirline={handleSelectAirline}
              />
            )}
            {tab === 'route' && (
              <RoutePage
                ym={ym}
                airport={airport}
                destination={destination}
                setDestination={setDestination}
                meta={meta}
                dark={dark}
              />
            )}
            {tab === 'airline' && (
              <AirlinePage
                ym={ym}
                airport={airport}
                selectedAirlines={selectedAirlines}
                setSelectedAirlines={setSelectedAirlines}
                meta={meta}
                dark={dark}
                onSelectRoute={handleSelectRoute}
              />
            )}
            {tab === 'trends' && (
              <TrendsPage
                ym={ym}
                airport={airport}
                dark={dark}
                onSelectRoute={handleSelectRoute}
              />
            )}
            {tab === 'cargo' && <CargoPage dark={dark} />}
            {tab === 'otp' && <OtpPage dark={dark} />}
            {tab === 'sync' && (
              <SyncPage
                meta={meta}
                onRefreshMeta={loadMeta}
                onJumpMonth={handleJumpMonth}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
