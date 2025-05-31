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
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">Loading Education Breakdown...</p>
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

  if (educationData.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="p-4 text-neutral-600 dark:text-neutral-300">No education data available.</p>
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
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs">
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };


  return (
    <div className="w-full h-[350px] bg-white dark:bg-neutral-800 p-4 rounded-lg shadow border border-neutral-200 dark:border-neutral-700"> {/* Increased height for legend */}
      <h2 className="text-lg sm:text-xl font-semibold mb-2 text-neutral-900 dark:text-neutral-100">Education Breakdown</h2>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={educationData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel} // Using this custom label for better visibility
            outerRadius={100} // Adjusted radius
            fill="#8884d8"
            dataKey="value" // Key for the numerical value of the slice
            nameKey="name"  // Key for the name of the slice (used in Tooltip/Legend)
          >
            {educationData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value} candidates`, name]}
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '0.375rem' }}
            itemStyle={{ color: '#374151' }}
            cursor={{ fill: 'rgba(209, 213, 219, 0.3)' }}
          />
          <Legend wrapperStyle={{ color: '#374151' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EducationBreakdownChart;
