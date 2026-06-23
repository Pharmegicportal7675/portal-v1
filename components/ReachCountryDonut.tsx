'use client';

import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COUNTRY_SEGMENT_COLORS = [
  '#064e3b',
  '#2563eb',
  '#059669',
  '#b45309',
  '#7c3aed',
  '#db2777',
  '#0891b2',
];

type ReachCountryDonutProps = {
  data: { name: string; value: number }[];
  accentColor: string;
};

export default function ReachCountryDonut({ data, accentColor }: ReachCountryDonutProps) {
  if (data.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-[11px] text-slate-400 font-medium">
        No client country data yet.
      </div>
    );
  }

  return (
    <div className="pt-3">
      <ResponsiveContainer width="100%" height={176}>
        <PieChart margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="48%"
            innerRadius={36}
            outerRadius={52}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={
                  index === 0
                    ? accentColor
                    : COUNTRY_SEGMENT_COLORS[index % COUNTRY_SEGMENT_COLORS.length]
                }
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Legend
            iconSize={8}
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
