// people-gpt-champion/app/analytics/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import SkillsDistributionChart from './components/SkillsDistributionChart';
import ExperienceDistributionChart from './components/ExperienceDistributionChart';
import EducationBreakdownChart from './components/EducationBreakdownChart';
import KpiCard from './components/KpiCard';
import EmailEngagementFunnelChart from './components/EmailEngagementFunnelChart'; // Import the new chart

const AnalyticsDashboardPage = () => {
  // Existing KPI states
  const [totalCandidates, setTotalCandidates] = useState<number | string>('...');
  const [avgSkills, setAvgSkills] = useState<number | string>('...');
  const [newCandidates30d, setNewCandidates30d] = useState<number | string>('...');

  // New Email Outreach KPI states
  const [emailSent30d, setEmailSent30d] = useState<number | string>('...');
  const [emailOpenRate30d, setEmailOpenRate30d] = useState<number | string>('...');
  const [emailCtr30d, setEmailCtr30d] = useState<number | string>('...');
  // Optional: separate loading/error states for these new KPIs if granular feedback is needed
  // const [emailKpiLoading, setEmailKpiLoading] = useState(true);
  // const [emailKpiError, setEmailKpiError] = useState<string | null>(null);


  useEffect(() => {
    // Fetch existing KPI data
    const fetchGeneralKpiData = async () => {
      try {
        const [totalRes, newRes, avgRes] = await Promise.all([
          fetch('/api/analytics/kpi/total-candidates'),
          fetch('/api/analytics/kpi/new-candidates-30d'),
          fetch('/api/analytics/kpi/avg-skills'),
        ]);

        if (totalRes.ok) setTotalCandidates((await totalRes.json()).count);
        else setTotalCandidates('Error');

        if (newRes.ok) setNewCandidates30d((await newRes.json()).count);
        else setNewCandidates30d('Error');

        if (avgRes.ok) setAvgSkills((await avgRes.json()).average);
        else setAvgSkills('Error');

      } catch (error) {
        console.error("Failed to fetch general KPI data", error);
        setTotalCandidates('Error');
        setNewCandidates30d('Error');
        setAvgSkills('Error');
      }
    };

    // Fetch Email Outreach KPI data
    const fetchEmailOutreachKpiData = async () => {
      // setEmailKpiLoading(true); // If using separate loading state
      // setEmailKpiError(null);
      try {
        const response = await fetch('/api/analytics/outreach/email-stats?period=30d');
        if (!response.ok) {
          throw new Error(`Failed to fetch email outreach stats: ${response.statusText}`);
        }
        const stats = await response.json(); // { sent, delivered, opened, clicked, periodDays }

        setEmailSent30d(stats.sent);

        const openRate = stats.delivered > 0 ? (stats.opened / stats.delivered) * 100 : 0;
        setEmailOpenRate30d(openRate.toFixed(1) + '%');

        const ctr = stats.delivered > 0 ? (stats.clicked / stats.delivered) * 100 : 0;
        setEmailCtr30d(ctr.toFixed(1) + '%');

      } catch (error) {
        console.error("Failed to fetch email outreach KPI data", error);
        // setEmailKpiError(error instanceof Error ? error.message : 'Unknown error');
        setEmailSent30d('Error');
        setEmailOpenRate30d('Error');
        setEmailCtr30d('Error');
      } finally {
        // setEmailKpiLoading(false); // If using separate loading state
      }
    };

    fetchGeneralKpiData();
    fetchEmailOutreachKpiData();
  }, []);

  return (
    <div className="container mx-auto p-4">
      {/* ... (header and KPI sections) ... */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
      </header>

      {/* KPI Cards Section - Extended */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Key Metrics (Candidate Pool)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-6"> {/* Adjusted grid */}
          <KpiCard title="Total Candidates" value={totalCandidates.toLocaleString()} description="In system" />
          <KpiCard title="Avg. Skills" value={avgSkills.toLocaleString()} description="Per candidate" />
          <KpiCard title="New Candidates" value={newCandidates30d.toLocaleString()} description="Last 30 days" />
        </div>

        <h2 className="text-xl font-semibold mb-3">Email Outreach Performance (Last 30 Days)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4"> {/* Adjusted grid */}
          <KpiCard title="Emails Sent" value={emailSent30d.toLocaleString()} />
          <KpiCard title="Email Open Rate" value={emailOpenRate30d} />
          <KpiCard title="Email CTR" value={emailCtr30d} description="Based on delivered" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Detailed Analysis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <SkillsDistributionChart />
          <ExperienceDistributionChart />
          <EducationBreakdownChart />
        </div>

        {/* New Email Engagement Funnel Chart Section */}
        <div className="mt-6 bg-white shadow rounded-lg p-4"> {/* Added a card-like container */}
          <EmailEngagementFunnelChart />
        </div>
      </section>
    </div>
  );
};

export default AnalyticsDashboardPage;
