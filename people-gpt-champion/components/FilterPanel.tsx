'use client';

import React, { useState } from 'react';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

// Define types for filter structures
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterCategory {
  id: string; // e.g., 'status', 'location'
  label: string;
  type: 'select' | 'checkbox' | 'multiselect'; // Add 'multiselect' for multiple checkbox-like options
  options?: FilterOption[]; // For select and multiselect
}

interface FilterPanelProps {
  filters: FilterCategory[];
  appliedFilters: Record<string, any>; // e.g., { status: 'active', location: ['remote', 'ny'] }
  onFilterChange: (filterId: string, value: any) => void;
  onApplyFilters?: () => void; // Optional: if an explicit "Apply" button is desired
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  appliedFilters,
  onFilterChange,
  onApplyFilters,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // Initially open all sections
    const initialOpenState: Record<string, boolean> = {};
    filters.forEach(filter => initialOpenState[filter.id] = true);
    return initialOpenState;
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCheckboxChange = (filterId: string, optionValue: string, isChecked: boolean) => {
    const currentValues = (appliedFilters[filterId] as string[] | undefined) || [];
    let newValues;
    if (isChecked) {
      newValues = [...currentValues, optionValue];
    } else {
      newValues = currentValues.filter(val => val !== optionValue);
    }
    onFilterChange(filterId, newValues.length > 0 ? newValues : undefined); // Send undefined if empty
  };

  return (
    <div className="p-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm w-full">
      <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4 flex items-center">
        <Filter size={18} className="mr-2" />
        Filters
      </h3>
      {filters.map((filter) => (
        <div key={filter.id} className="mb-4">
          <button
            onClick={() => toggleSection(filter.id)}
            className="flex justify-between items-center w-full text-left text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1 focus:outline-none"
            aria-expanded={openSections[filter.id]}
          >
            {filter.label}
            {openSections[filter.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {openSections[filter.id] && (
            <div className="mt-2 space-y-2 pl-2 border-l border-neutral-300 dark:border-neutral-600">
              {filter.type === 'select' && filter.options && (
                <select
                  value={appliedFilters[filter.id] || ''}
                  onChange={(e) => onFilterChange(filter.id, e.target.value || undefined)}
                  aria-label={filter.label}
                  className="w-full p-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"
                >
                  <option value="">All</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {filter.type === 'checkbox' && filter.options && ( // Assuming single checkbox is a boolean filter
                <label className="flex items-center space-x-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={!!appliedFilters[filter.id]}
                    onChange={(e) => onFilterChange(filter.id, e.target.checked || undefined)}
                    className="h-4 w-4 text-blue-600 border-neutral-300 rounded focus:ring-blue-500 dark:focus:ring-blue-400 dark:bg-neutral-700 dark:border-neutral-600"
                  />
                  <span>{filter.options[0]?.label || filter.label}</span>
                </label>
              )}
              {filter.type === 'multiselect' && filter.options && (
                 filter.options.map((option) => (
                    <label key={option.value} className="flex items-center space-x-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300">
                      <input
                        type="checkbox"
                        checked={((appliedFilters[filter.id] as string[] | undefined) || []).includes(option.value)}
                        onChange={(e) => handleCheckboxChange(filter.id, option.value, e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-neutral-300 rounded focus:ring-blue-500 dark:focus:ring-blue-400 dark:bg-neutral-700 dark:border-neutral-600"
                      />
                      <span>{option.label}</span>
                    </label>
                 ))
              )}
            </div>
          )}
        </div>
      ))}
      {onApplyFilters && (
        <button
          onClick={onApplyFilters}
          className="w-full mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
        >
          Apply Filters
        </button>
      )}
    </div>
  );
};

export default FilterPanel;
