// people-gpt-champion/app/analytics/components/SkillsDistributionChart.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SkillData {
  name: string;
  count: number;
}

const SkillsDistributionChart = () => {
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/analytics/skills');
        if (!response.ok) {
          throw new Error(`Failed to fetch skills data: ${response.statusText}`);
        }
        const data: SkillData[] = await response.json();
        setSkillsData(data.slice(0, 15)); // Display top 15 skills
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setSkillsData([]); // Clear data on error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">Loading Skills Distribution...</p>
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

  if (skillsData.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">No skills data available.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] bg-white dark:bg-neutral-800 p-4 rounded-lg shadow border border-neutral-200 dark:border-neutral-700">
      <h2 className="text-lg sm:text-xl font-semibold mb-2 text-neutral-900 dark:text-neutral-100">Skills Distribution (Top 15)</h2>
      <ResponsiveContainer>
        <BarChart
          data={skillsData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={70} stroke="#6b7280" className="dark:stroke-neutral-400 text-xs" /> {/* Adjust XAxis for better label display */}
          <YAxis allowDecimals={false} stroke="#6b7280" className="dark:stroke-neutral-400" />
          <Tooltip
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '0.375rem' }}
            itemStyle={{ color: '#374151' }}
            cursor={{ fill: 'rgba(209, 213, 219, 0.3)' }}
          />
          <Legend wrapperStyle={{ color: '#374151' }} />
          <Bar dataKey="count" fill="#8884d8" name="Candidate Count"/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SkillsDistributionChart;
