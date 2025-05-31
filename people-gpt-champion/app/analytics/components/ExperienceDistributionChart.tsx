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
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>Loading Experience Distribution...</p>
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

  if (experienceData.length === 0) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>No experience data available.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <h2 className="text-xl font-semibold mb-2">Experience Distribution</h2>
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
          <XAxis dataKey="years" /> {/* Ensure this matches the data structure */}
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#82ca9d" name="Candidate Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ExperienceDistributionChart;
