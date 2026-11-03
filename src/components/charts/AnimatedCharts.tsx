import React from 'react';

export interface DailyChartPoint {
  label: string;
  firstTime: number;
  revision: number;
}

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export const StudyBarChart: React.FC<{ data: DailyChartPoint[]; compact?: boolean }> = ({ data, compact = false }) => {
  const max = Math.max(30, ...data.map(d => d.firstTime + d.revision));
  return (
    <div className={`study-bars ${compact ? 'study-bars-compact' : ''}`} role="img" aria-label="Daily study time split between first-time study and revision">
      {data.map((item, index) => {
        const total = item.firstTime + item.revision;
        const firstHeight = (item.firstTime / max) * 100;
        const revisionHeight = (item.revision / max) * 100;
        return (
          <div className="study-bar-column" key={item.label}>
            <div className="study-bar-value">{total ? formatMinutes(total) : '—'}</div>
            <div className="study-bar-track">
              <div className="study-bar-stack" style={{ height: `${Math.max(total ? 3 : 0, (total / max) * 100)}%`, animationDelay: `${index * 65}ms` }}>
                <div className="study-bar-revision" style={{ height: total ? `${(revisionHeight / (firstHeight + revisionHeight)) * 100}%` : '0%' }} />
                <div className="study-bar-first" style={{ height: total ? `${(firstHeight / (firstHeight + revisionHeight)) * 100}%` : '0%' }} />
              </div>
            </div>
            <span className="study-bar-label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const DONUT_COLORS = ['#2563eb', '#8b5cf6', '#0d9488', '#f59e0b', '#ec4899', '#64748b'];

export const AnimatedDonut: React.FC<{ data: { label: string; value: number }[]; centerValue?: string; centerLabel?: string }> = ({ data, centerValue, centerLabel = 'Total time' }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let accumulated = 0;
  const segments = data.filter(item => item.value > 0).map((item, index) => {
    const start = accumulated;
    const portion = total ? (item.value / total) * 100 : 0;
    accumulated += portion;
    return { ...item, start, portion, color: DONUT_COLORS[index % DONUT_COLORS.length] };
  });
  return (
    <div className="donut-layout">
      <div className="donut-visual">
        <svg viewBox="0 0 120 120" role="img" aria-label={`Study distribution across ${segments.length} categories`}>
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeOpacity=".09" strokeWidth="13" />
          {segments.map((segment, index) => (
            <circle key={segment.label} className="donut-segment" cx="60" cy="60" r="46" fill="none" stroke={segment.color} strokeWidth="13" strokeLinecap="round"
              strokeDasharray={`${segment.portion * 2.89} 289`} strokeDashoffset={-segment.start * 2.89}
              transform="rotate(-90 60 60)" style={{ animationDelay: `${index * 100}ms` }} />
          ))}
        </svg>
        <div className="donut-center">
          <strong>{centerValue ?? (total ? formatMinutes(total) : '0m')}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="donut-legend">
        {segments.map(segment => (
          <div className="donut-legend-row" key={segment.label}>
            <span className="donut-dot" style={{ background: segment.color }} />
            <span className="donut-legend-name">{segment.label}</span>
            <strong>{Math.round((segment.value / total) * 100)}%</strong>
          </div>
        ))}
        {!segments.length && <p className="chart-empty-copy">No study time recorded yet.</p>}
      </div>
    </div>
  );
};

export const ActivityHeatmap: React.FC<{ data: { date: string; minutes: number }[] }> = ({ data }) => {
  const values = new Map(data.map(item => [item.date, item.minutes]));
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - 83);
  start.setDate(start.getDate() - start.getDay());
  const days: { key: string; minutes: number; date: Date }[] = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({ key, minutes: values.get(key) ?? 0, date: new Date(date) });
  }
  const level = (minutes: number) => minutes === 0 ? 0 : minutes < 30 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4;
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-months"><span>12 weeks of activity</span><span>Less <i className="heatmap-cell level-0" /><i className="heatmap-cell level-1" /><i className="heatmap-cell level-2" /><i className="heatmap-cell level-3" /><i className="heatmap-cell level-4" /> More</span></div>
      <div className="heatmap-grid" role="img" aria-label="Study activity heatmap for the last twelve weeks">
        {days.map(day => (
          <span key={day.key} className={`heatmap-cell level-${level(day.minutes)}`} title={`${day.key}: ${formatMinutes(day.minutes)}`} />
        ))}
      </div>
      <div className="heatmap-foot"><span>Each square represents one day</span><span>{data.filter(d => d.minutes > 0).length} active days in recorded data</span></div>
    </div>
  );
};

export const ProgressRing: React.FC<{ value: number; label?: string; size?: number }> = ({ value, label = 'complete', size = 76 }) => {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" aria-label={`${safeValue}% ${label}`}>
        <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="6" />
        <circle className="progress-ring-value" cx="36" cy="36" r={radius} fill="none" stroke="#2563eb" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safeValue / 100)} transform="rotate(-90 36 36)" />
      </svg>
      <strong>{Math.round(safeValue)}%</strong>
    </div>
  );
};

export { formatMinutes };
