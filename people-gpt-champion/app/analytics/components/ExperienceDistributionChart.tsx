// people-gpt-champion/app/analytics/components/ExperienceDistributionChart.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ExperienceData {
  years: string; // Matches the API output key
  count: number;
}

// Define the desired order of experience bins
const experienceBinOrder = [
  '0-2 Years',
  '3-5 Years',
  '6-8 Years',
  '9-11 Years',
  '12+ Years',
  'Unknown',
];

const ExperienceDistributionChart = () => {
  const [experienceData, setExperienceData] = useState<ExperienceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/analytics/experience');
        if (!response.ok) {
          throw new Error(`Failed to fetch experience data: ${response.statusText}`);
        }
        let data: ExperienceData[] = await response.json();

        // Sort data according to predefined bin order
        data.sort((a, b) => {
          return experienceBinOrder.indexOf(a.years) - experienceBinOrder.indexOf(b.years);
        });

        setExperienceData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setExperienceData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">Loading Experience Distribution...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-red-600 dark:text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (experienceData.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">No experience data available.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] bg-white dark:bg-neutral-800 p-4 rounded-lg shadow border border-neutral-200 dark:border-neutral-700">
      <h2 className="text-lg sm:text-xl font-semibold mb-2 text-neutral-900 dark:text-neutral-100">Experience Distribution</h2>
      <ResponsiveContainer>
        <BarChart
          data={experienceData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="years" stroke="#6b7280" className="dark:stroke-neutral-400 text-xs" /> {/* Ensure this matches the data structure */}
          <YAxis allowDecimals={false} stroke="#6b7280" className="dark:stroke-neutral-400" />
          <Tooltip
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '0.375rem' }}
            itemStyle={{ color: '#374151' }}
            cursor={{ fill: 'rgba(209, 213, 219, 0.3)' }}
          />
          <Legend wrapperStyle={{ color: '#374151' }} />
          <Bar dataKey="count" fill="#82ca9d" name="Candidate Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ExperienceDistributionChart;
