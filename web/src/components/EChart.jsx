import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function EChart({ option, height = 340, className = '', onChartClick }) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    instanceRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart || !option) return;
    chart.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart || !onChartClick) return;
    chart.off('click');
    chart.on('click', onChartClick);
    return () => {
      chart.off('click');
    };
  }, [onChartClick]);

  return <div ref={containerRef} style={{ height }} className={`w-full ${className}`} />;
}
