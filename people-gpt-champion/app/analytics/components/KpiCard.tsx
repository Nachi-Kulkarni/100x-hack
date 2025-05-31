// people-gpt-champion/app/analytics/components/KpiCard.tsx
'use client';

import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, description }) => {
  return (
    <div className="bg-white dark:bg-neutral-800 shadow rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
      <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 truncate">{title}</h3>
      <p className="mt-1 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {description && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{description}</p>
      )}
    </div>
  );
};

export default KpiCard;
