'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Define a type for the expected API response data (matching the mock API)
interface FairnessMetrics {
  demographicParity: {
    [group: string]: number[];
  };
  equalOpportunity: {
    [group: string]: number[];
  };
  timestamps: string[];
  alertThresholds?: {
    representation?: {
      metric: string;
      minPercentage?: number;
      maxDifferencePercentage?: number;
    };
  };
}

// Mock data similar to what the API would return, to ensure chart renders without live API call in this example
const mockApiData: FairnessMetrics = {
  demographicParity: {
    'Group A': [0.20, 0.22, 0.21],
    'Group B': [0.18, 0.20, 0.19],
    'Group C': [0.21, 0.21, 0.22],
    'Overall': [0.19, 0.21, 0.20],
  },
  equalOpportunity: {
    'Group A': [0.80, 0.82, 0.81],
    'Group B': [0.78, 0.79, 0.80],
    'Group C': [0.81, 0.81, 0.82],
  },
  timestamps: ['Q1 2024', 'Q2 2024', 'Q3 2024'],
  alertThresholds: {
    representation: {
      metric: "selectionRate",
      minPercentage: 0.15,
      maxDifferencePercentage: 0.10,
    },
  },
};

const FairnessDashboardPage: React.FC = () => {
  const [fairnessData, setFairnessData] = useState<FairnessMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In a real application, you would fetch data from your API endpoint:
    // fetch('/api/fairness-metrics')
    //   .then(res => {
    //     if (!res.ok) {
    //       throw new Error(`Failed to fetch fairness metrics: ${res.status} ${res.statusText}`);
    //     }
    //     return res.json();
    //   })
    //   .then((data: FairnessMetrics) => {
    //     setFairnessData(data);
    //     setLoading(false);
    //   })
    //   .catch(err => {
    //     console.error("Error fetching fairness data:", err);
    //     setError(err.message);
    //     setLoading(false);
    //   });

    // For this placeholder, we use mock data directly.
    setFairnessData(mockApiData);
    setLoading(false);
  }, []);

  // Transform data for Recharts
  const demographicParityChartData = fairnessData?.timestamps.map((time, index) => {
    const entry: { name: string; [group: string]: number | string } = { name: time };
    if (fairnessData?.demographicParity) {
      for (const group in fairnessData.demographicParity) {
        entry[group] = fairnessData.demographicParity[group][index];
      }
    }
    return entry;
  });

  const equalOpportunityChartData = fairnessData?.timestamps.map((time, index) => {
    const entry: { name: string; [group: string]: number | string } = { name: time };
    if (fairnessData?.equalOpportunity) {
      for (const group in fairnessData.equalOpportunity) {
        entry[group] = fairnessData.equalOpportunity[group][index];
      }
    }
    return entry;
  });

  // Colors for chart lines/bars - extend as needed
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F'];

  // Conceptual: Check for alert conditions based on the latest data
  let alertMessage = '';
  if (fairnessData) {
    const latestDemographicParity = demographicParityChartData?.[demographicParityChartData.length - 1];
    const thresholds = fairnessData.alertThresholds?.representation;
    if (latestDemographicParity && thresholds && thresholds.minPercentage) {
      const rates = Object.entries(latestDemographicParity)
                          .filter(([key]) => key !== 'name' && key !== 'Overall')
                          .map(([, value]) => value as number);

      const minRate = Math.min(...rates);
      if (minRate < thresholds.minPercentage) {
        alertMessage = `Alert: A demographic group's representation (${minRate.toFixed(2)}) is below the ${thresholds.minPercentage*100}% threshold.`;
      }
      // Further alert logic for maxDifferencePercentage could be added here.
    }
  }


  if (loading) {
    return <div className="p-6 text-center">Loading fairness data...</div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">Error: {error}</div>;
  }

  if (!fairnessData) {
    return <div className="p-6 text-center">No fairness data available.</div>;
  }

  return (
    <div className="container mx-auto p-6 bg-neutral-50 dark:bg-neutral-900 min-h-screen">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-100">Fairness Monitoring Dashboard</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          This dashboard provides a conceptual overview of fairness metrics.
          Currently, it displays mock data. A full implementation requires robust data collection,
          metric calculation, and storage infrastructure.
        </p>
      </header>

      {alertMessage && (
        <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-700 border border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-50 rounded-md">
          <h3 className="font-semibold">Fairness Alert</h3>
          <p>{alertMessage}</p>
        </div>
      )}

      <section className="mb-12 p-6 bg-white dark:bg-neutral-800 shadow-lg rounded-lg border border-neutral-200 dark:border-neutral-700">
        <h2 className="text-xl font-semibold text-neutral-700 dark:text-neutral-200 mb-4">Demographic Parity (Selection Rates)</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Demographic parity aims for similar selection rates across different groups.
          The chart below shows hypothetical selection rates over time.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={demographicParityChartData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 0.5]} tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`} />
            <Tooltip formatter={(value: number) => `${(value * 100).toFixed(1)}%`} />
            <Legend />
            {Object.keys(fairnessData.demographicParity).map((group, index) => (
              <Line key={group} type="monotone" dataKey={group} stroke={colors[index % colors.length]} activeDot={{ r: 8 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="p-6 bg-white dark:bg-neutral-800 shadow-lg rounded-lg border border-neutral-200 dark:border-neutral-700">
        <h2 className="text-xl font-semibold text-neutral-700 dark:text-neutral-200 mb-4">Equal Opportunity (True Positive Rates)</h2>
         <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Equal opportunity aims for similar true positive rates (correctly identifying qualified candidates) across groups.
          The chart below shows hypothetical TPRs.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={equalOpportunityChartData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 1]} tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`} />
            <Tooltip formatter={(value: number) => `${(value * 100).toFixed(1)}%`} />
            <Legend />
            {Object.keys(fairnessData.equalOpportunity).map((group, index) => (
              <Bar key={group} dataKey={group} fill={colors[index % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>

      <footer className="mt-12 text-center text-xs text-neutral-500 dark:text-neutral-400">
        <p>
          **Note on Alerting**: Real-time alerts for fairness metric deviations (e.g., if representation for a group
          falls below a defined threshold like {fairnessData.alertThresholds?.representation?.minPercentage && (fairnessData.alertThresholds.representation.minPercentage*100)+'%'}, or if the difference between groups exceeds a threshold)
          would typically be configured via backend processes that monitor aggregated metrics.
          These alerts could trigger notifications via email, Slack, or an internal incident management system.
          The yellow alert box on this page is a conceptual demonstration.
        </p>
      </footer>
    </div>
  );
};

export default FairnessDashboardPage;
