// people-gpt-champion/app/analytics/components/EmailEngagementFunnelChart.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

interface FunnelDataPoint {
  name: string;
  value: number;
}

const EmailEngagementFunnelChart = () => {
  const [funnelData, setFunnelData] = useState<FunnelDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(30);


  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/analytics/outreach/email-stats?period=${periodDays}d`);
        if (!response.ok) {
          throw new Error(`Failed to fetch email engagement data: ${response.statusText}`);
        }
        const stats = await response.json(); // { sent, delivered, opened, clicked, periodDays }

        const dataForChart: FunnelDataPoint[] = [
          { name: 'Sent', value: stats.sent },
          { name: 'Delivered', value: stats.delivered },
          { name: 'Opened', value: stats.opened },
          { name: 'Clicked', value: stats.clicked },
        ];
        setFunnelData(dataForChart);
        setPeriodDays(stats.periodDays); // Update period days from response if needed
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setFunnelData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [periodDays]); // Refetch if periodDays changes, though not implemented here to change it

  if (loading) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>Loading Email Engagement Funnel...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  if (funnelData.length === 0) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>No email engagement data available.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 350 }}>
      <h2 className="text-xl font-semibold mb-2">Email Engagement Funnel (Last {periodDays} Days)</h2>
      <ResponsiveContainer>
        <BarChart
          data={funnelData}
          layout="vertical" // Funnel-like appearance with vertical layout
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis dataKey="name" type="category" width={80} />
          <Tooltip formatter={(value: number) => [value, 'Count']} />
          <Legend />
          <Bar dataKey="value" fill="#8884d8" name="Engagement Count" barSize={35}>
            <LabelList dataKey="value" position="right" style={{ fill: 'black' }}/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EmailEngagementFunnelChart;
