// people-gpt-champion/app/analytics/components/EducationBreakdownChart.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EducationData {
  name: string; // Matches API: e.g., "Bachelor's", "Master's"
  value: number; // Matches API: e.g., count of candidates
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#A28DFF', '#FF8D6E'];

const EducationBreakdownChart = () => {
  const [educationData, setEducationData] = useState<EducationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/analytics/education');
        if (!response.ok) {
          throw new Error(`Failed to fetch education data: ${response.statusText}`);
        }
        const data: EducationData[] = await response.json();
        setEducationData(data); // Data is already sorted by value from API
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setEducationData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>Loading Education Breakdown...</p>
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

  if (educationData.length === 0) {
    return (
      <div style={{ width: '100%', height: 300 }} className="flex items-center justify-center">
        <p>No education data available.</p>
      </div>
    );
  }

  // Custom label for Pie chart to avoid clutter if slices are too small
  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }: any) => {
    if (percent * 100 < 5) return null; // Don't render label for slices less than 5%
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };


  return (
    <div style={{ width: '100%', height: 350 }}> {/* Increased height for legend */}
      <h2 className="text-xl font-semibold mb-2">Education Breakdown</h2>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={educationData}
            cx="50%"
            cy="50%"
            labelLine={false}
            // label={renderCustomizedLabel} // Using this custom label
            label={(entry) => entry.name} // Simpler label for now, or use custom above
            outerRadius={100} // Adjusted radius
            fill="#8884d8"
            dataKey="value" // Key for the numerical value of the slice
            nameKey="name"  // Key for the name of the slice (used in Tooltip/Legend)
          >
            {educationData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [`${value} candidates`, name]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EducationBreakdownChart;
