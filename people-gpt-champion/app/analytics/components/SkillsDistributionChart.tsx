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
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>Loading Skills Distribution...</p>
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

  if (skillsData.length === 0) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>No skills data available.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <h2 className="text-xl font-semibold mb-2">Skills Distribution (Top 15)</h2>
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
          <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={70} /> {/* Adjust XAxis for better label display */}
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#8884d8" name="Candidate Count"/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SkillsDistributionChart;
