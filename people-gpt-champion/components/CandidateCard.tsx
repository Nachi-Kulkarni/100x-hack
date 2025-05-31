'use client';

import React from 'react';
import { Briefcase, Mail, Phone, Star, UserCircle, TrendingUp, Info, BarChart3, Percent } from 'lucide-react'; // Added new icons

// Define Candidate and related types based on page.tsx
interface ScoreBreakdown {
  skill_match: number;
  experience_relevance: number;
  cultural_fit: number;
}

// Local frontend interface for WorkExperience, matching Zod schema
interface WorkExperienceEntry {
  title?: string | null;
  company?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

// Local frontend interface for Education, matching Zod schema
interface EducationEntry {
  school?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  endDate?: string | null;
}

// Updated Candidate interface to match Zod CandidateSchema (Task 8 from page.tsx)
export interface Candidate {
  id: string;
  name?: string | null;
  title?: string | null;
  email?: string; // Kept for basic info
  phone?: string; // Kept for basic info
  summary?: string; // Keep existing summary if used, or it can be derived from raw_resume_text

  address?: string | null;
  skills?: string[] | null;
  workExperience?: WorkExperienceEntry[] | null;
  education?: EducationEntry[] | null;
  certifications?: string[] | null;
  raw_resume_text?: string | null;

  // Scoring fields
  match_score: number;
  skill_match: number; // This is often the same as score_breakdown.skill_match
  experience_relevance: number; // Same as score_breakdown.experience_relevance
  cultural_fit: number; // Same as score_breakdown.cultural_fit
  score_breakdown: ScoreBreakdown;
  percentile_rank: number;
  reasoning?: string | null;

  source_url?: string | null;
  pinecone_score?: number; // raw score from vector search if applicable
}


interface CandidateCardProps {
  candidate: Candidate;
  onViewDetails?: (id: string) => void;
}

// Simple ProgressBar Component (copied from page.tsx)
// Note: Ideally, this would be in a shared components directory
const ProgressBar = ({ score, tooltipText, barColor = 'bg-blue-500', label, showValue = true }: { score: number; tooltipText: string; barColor?: string; label: string; showValue?: boolean }) => {
  const widthPercentage = Math.max(0, Math.min(score * 100, 100)); // score is 0 to 1
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400 mb-0.5">
        <span>{label}</span>
        {showValue && <span>{(score * 100).toFixed(1)}%</span>}
      </div>
      <div
        title={tooltipText}
        className="h-2.5 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
      >
        <div
          style={{ width: `${widthPercentage}%` }}
          className={`h-full ${barColor} transition-all duration-300 ease-in-out rounded-full`}
        />
      </div>
    </div>
  );
};


const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onViewDetails }) => {
  // Helper to format score as percentage string
  const formatPercent = (score: number) => `${(score * 100).toFixed(1)}%`;

  return (
    <div className="bg-white dark:bg-neutral-800 shadow-lg rounded-lg p-6 border border-neutral-200 dark:border-neutral-700 hover:shadow-xl transition-shadow duration-300 ease-in-out flex flex-col justify-between">
      <div> {/* Main content wrapper */}
        <div className="flex items-start mb-4">
          <UserCircle size={48} className="text-blue-500 dark:text-blue-400 mr-4 flex-shrink-0" />
          <div className="flex-grow">
            <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">{candidate.name || 'N/A'}</h2>
            {candidate.title && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300 flex items-center">
                <Briefcase size={14} className="mr-2 flex-shrink-0" /> {candidate.title}
              </p>
            )}
          </div>
        </div>

        {/* Scoring Information Section */}
        <div className="mb-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
          <h3 className="text-md font-semibold text-neutral-700 dark:text-neutral-200 mb-3 flex items-center">
            <Star size={18} className="mr-2 text-yellow-500 dark:text-yellow-400" /> Scoring Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mb-3">
            <div className="flex items-center text-lg font-semibold text-blue-600 dark:text-blue-400">
              <BarChart3 size={20} className="mr-2 flex-shrink-0" />
              Overall Match: {formatPercent(candidate.match_score)}
            </div>
            <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-300 md:justify-end">
               <TrendingUp size={18} className="mr-2 flex-shrink-0" /> Top {candidate.percentile_rank.toFixed(1)}%
            </div>
          </div>

          <div className="space-y-3">
            <ProgressBar
              label="Skill Match"
              score={candidate.score_breakdown.skill_match}
              tooltipText={`Skill Match Score: ${formatPercent(candidate.score_breakdown.skill_match)}`}
              barColor="bg-green-500 dark:bg-green-600"
            />
            <ProgressBar
              label="Experience Relevance"
              score={candidate.score_breakdown.experience_relevance}
              tooltipText={`Experience Relevance Score: ${formatPercent(candidate.score_breakdown.experience_relevance)}`}
              barColor="bg-indigo-500 dark:bg-indigo-600"
            />
            <ProgressBar
              label="Cultural Fit"
              score={candidate.score_breakdown.cultural_fit}
              tooltipText={`Cultural Fit Score: ${formatPercent(candidate.score_breakdown.cultural_fit)}`}
              barColor="bg-amber-500 dark:bg-amber-600"
            />
          </div>

          {candidate.reasoning && (
            <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-600">
              <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-1 flex items-center">
                <Info size={14} className="mr-1.5 flex-shrink-0" /> Reasoning
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700 p-2 rounded-md">
                {candidate.reasoning}
              </p>
            </div>
          )}
        </div>

        {/* Existing details like summary, email, phone, skills */}
        {candidate.summary && (
          <p className="text-neutral-700 dark:text-neutral-200 mb-4 text-sm">
            {candidate.summary}
          </p>
        )}

        <div className="space-y-2 mb-4">
          {candidate.email && (
            <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-300">
              <Mail size={14} className="mr-2 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
              <a href={`mailto:${candidate.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 break-all">
                {candidate.email}
              </a>
            </div>
          )}
          {candidate.phone && (
            <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-300">
              <Phone size={14} className="mr-2 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
              <span>{candidate.phone}</span>
            </div>
          )}
        </div>

        {candidate.skills && candidate.skills.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Key Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.slice(0, 7).map((skill, index) => ( // Show a limited number of skills for brevity
                <span
                  key={index}
                  className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs rounded-full font-medium"
                >
                  {skill}
                </span>
              ))}
              {candidate.skills.length > 7 && (
                 <span className="text-xs text-neutral-500 dark:text-neutral-400 self-center">+{candidate.skills.length - 7} more</span>
              )}
            </div>
          </div>
        )}
      </div> {/* End of main content wrapper */}

      {onViewDetails && (
        <button
          onClick={() => onViewDetails(candidate.id)}
          className="w-full mt-auto pt-3 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-opacity-75 transition-colors"
        >
          View Full Profile
        </button>
      )}
    </div>
  );
};

export default CandidateCard;
