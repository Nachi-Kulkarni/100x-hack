'use client';

import React from 'react';
import { Briefcase, Mail, Phone, Star, UserCircle } from 'lucide-react'; // Using existing icons

// Define a type for the candidate data
export interface Candidate {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  summary?: string;
  // Add other relevant fields as needed
}

interface CandidateCardProps {
  candidate: Candidate;
  onViewDetails?: (id: string) => void; // Optional: for a button to view more details
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onViewDetails }) => {
  return (
    <div className="bg-white dark:bg-neutral-800 shadow-lg rounded-lg p-6 border border-neutral-200 dark:border-neutral-700 hover:shadow-xl transition-shadow duration-300 ease-in-out">
      <div className="flex items-center mb-4">
        <UserCircle size={48} className="text-blue-500 dark:text-blue-400 mr-4" />
        <div>
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">{candidate.name}</h2>
          {candidate.title && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 flex items-center">
              <Briefcase size={14} className="mr-2" /> {candidate.title}
            </p>
          )}
        </div>
      </div>

      {candidate.summary && (
        <p className="text-neutral-700 dark:text-neutral-200 mb-4 text-sm">
          {candidate.summary}
        </p>
      )}

      <div className="space-y-2 mb-4">
        {candidate.email && (
          <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-300">
            <Mail size={14} className="mr-2 text-neutral-500 dark:text-neutral-400" />
            <a href={`mailto:${candidate.email}`} className="hover:text-blue-600 dark:hover:text-blue-400">
              {candidate.email}
            </a>
          </div>
        )}
        {candidate.phone && (
          <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-300">
            <Phone size={14} className="mr-2 text-neutral-500 dark:text-neutral-400" />
            <span>{candidate.phone}</span>
          </div>
        )}
      </div>

      {candidate.skills && candidate.skills.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {candidate.skills.map((skill, index) => (
              <span
                key={index}
                className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 text-xs rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {onViewDetails && (
        <button
          onClick={() => onViewDetails(candidate.id)}
          className="w-full mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
        >
          View Details
        </button>
      )}
    </div>
  );
};

export default CandidateCard;
