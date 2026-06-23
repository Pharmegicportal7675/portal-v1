'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Users, Clock, ChevronRight, Building2 } from 'lucide-react';
import Link from 'next/link';

const ReachCountryDonut = dynamic(() => import('./ReachCountryDonut'), {
  ssr: false,
  loading: () => (
    <div className="h-36 flex items-center justify-center text-[11px] text-slate-400 font-medium">
      Loading chart…
    </div>
  ),
});

interface ReachStat {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  count: number;
  percent: number;
  countryChartData: { name: string; value: number }[];
}

interface AdminDashboardProps {
  stats: {
    totalClients: number;
    pendingTcc: number;
  };
  reachStats: ReachStat[];
}

export default function AdminDashboard({ stats, reachStats }: AdminDashboardProps) {
  const cards = [
    {
      title: 'Total Clients',
      value: stats.totalClients,
      description: 'Registered compliance corporations',
      icon: Users,
      color: 'text-sky-600',
      bgColor: 'bg-sky-50',
      href: '/admin/clients',
    },
    {
      title: 'Pending TCC',
      value: stats.pendingTcc,
      description: 'Applications awaiting review',
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      href: '/admin/approvals',
    },
  ];

  return (
    <div className="space-y-8 animate-slide-in">
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Compliance Analytics</h1>
        <p className="text-sm text-slate-500 font-medium">
          Pharmegic Healthcare registry and certificate monitoring console.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.title} href={c.href}>
              <Card className="hover:shadow-md transition-all duration-300 border-slate-100 group cursor-pointer relative overflow-hidden h-full">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                        {c.title}
                      </span>
                      <span className="text-2xl font-black text-slate-800 block">{c.value}</span>
                    </div>
                    <div className={`p-2.5 rounded-lg ${c.bgColor} ${c.color} shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-500 transition-colors flex items-center gap-0.5">
                    <span>{c.description}</span>
                    <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border-slate-100 shadow-xs">
        <CardHeader>
          <CardTitle>Regulatory Registrations</CardTitle>
          <CardDescription>Active clients by REACH framework with country distribution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            {reachStats.map((reach) => (
              <div
                key={reach.key}
                className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${reach.bgColor}`}>
                    <Building2 className={`h-4 w-4 ${reach.textColor}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${reach.textColor}`}>
                    {reach.label}
                  </span>
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-800">{reach.count}</div>
                  <div className="text-xs font-semibold text-slate-400">active clients</div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${reach.percent}%`, backgroundColor: reach.color }}
                    />
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {reach.percent}% of total portfolio
                  </p>
                </div>

                <div className="pt-0 mt-0 border-t border-slate-100">
                  
                  <ReachCountryDonut data={reach.countryChartData} accentColor={reach.color} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
