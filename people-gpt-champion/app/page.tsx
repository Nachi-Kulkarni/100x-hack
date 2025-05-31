"use client";

import React, { useState, useEffect, useCallback } from 'react';

// Define Candidate and related types based on schemas.ts
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

// Updated Candidate interface to match Zod CandidateSchema (Task 8)
interface Candidate {
  id: string;
  name?: string | null;
  title?: string | null;

  phone?: string | null;
  address?: string | null;

  skills?: string[] | null;
  workExperience?: WorkExperienceEntry[] | null;
  education?: EducationEntry[] | null;
  certifications?: string[] | null;

  raw_resume_text?: string | null;

  // Scoring fields - these are generally expected to be present after backend processing
  match_score: number;
  skill_match: number;
  experience_relevance: number;
  cultural_fit: number;
  score_breakdown: ScoreBreakdown;
  percentile_rank: number; // Calculated client-side, but API sends a placeholder
  reasoning?: string | null;

  source_url?: string | null; // Can be URL or '#'
  pinecone_score?: number;
}

interface SearchApiResponse {
  candidates?: Candidate[];
  parsedQuery?: any;
  message?: string;
  error?: string; // For API generated errors
}

// Debounce function
const debounce = <F extends (...args: any[]) => any>(func: F, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

// Simple ProgressBar Component
const ProgressBar = ({ score, tooltipText, barColor = '#4CAF50', label }: { score: number; tooltipText: string; barColor?: string, label: string }) => {
  const widthPercentage = Math.max(0, Math.min(score * 100, 100));
  return (
    <div style={{ marginBottom: '5px' }}>
      <div style={{ fontSize: '12px', color: '#555' }}>{label}: {score.toFixed(2)}</div>
      <div
        title={tooltipText}
        style={{
          border: '1px solid #ccc',
          height: '18px',
          width: '100%', // Use full width of its container
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${widthPercentage}%`,
            height: '100%',
            backgroundColor: barColor,
            transition: 'width 0.3s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '10px',
          }}
        >
          {/* Optional: text inside bar, e.g. score.toFixed(2) */}
        </div>
      </div>
    </div>
  );
};


export default function HomePage() {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [weights, setWeights] = useState({
    w_skill: 0.4,
    w_experience: 0.3,
    w_culture: 0.3,
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async (currentQuery: string, currentWeights: typeof weights) => {
    if (!currentQuery) {
      setCandidates([]);
      return;
    }
    setIsLoading(true);
    setApiError(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery, weights: currentWeights }),
      });
      const data: SearchApiResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }

      let fetchedCandidates = data.candidates || [];
      if (fetchedCandidates.length > 0) {
        const maxScore = Math.max(...fetchedCandidates.map(c => c.match_score));

        fetchedCandidates = fetchedCandidates.map(candidate => {
          let numStrictlyLess = 0;
          if (fetchedCandidates.length > 1) { // Only relevant if more than one candidate
            numStrictlyLess = fetchedCandidates.filter(c => c.match_score < candidate.match_score).length;
          }

          let percentile;
          if (fetchedCandidates.length === 0) { // Should not happen if inside this block
            percentile = 0;
          } else if (candidate.match_score === maxScore) {
            percentile = 100;
          } else if (fetchedCandidates.length === 1) { // Single candidate is 100th (covered by maxScore too)
            percentile = 100;
          } else {
            // Avoid division by zero if length is 1 (though caught by previous condition)
            percentile = (numStrictlyLess / (fetchedCandidates.length - 1)) * 100;
          }

          return { ...candidate, percentile_rank: parseFloat(percentile.toFixed(1)) };
        });
      }
      setCandidates(fetchedCandidates);

      if (data.message) console.log(data.message);
    } catch (err: any) {
      setApiError(err.message || 'Failed to fetch candidates.');
      setCandidates([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed 'weights' from dependencies as it's passed as an argument

  const debouncedFetchCandidates = useCallback(debounce(fetchCandidates, 500), [fetchCandidates]);

  const handleSearch = () => {
    setSearchTerm(query);
    fetchCandidates(query, weights);
  };

  const handleWeightChange = (sliderName: keyof typeof weights, value: number) => {
    const newWeights = { ...weights };
    // ... (rest of the weight adjustment logic from previous step, assumed correct and stable)
    const otherSliders: (keyof typeof weights)[] = (Object.keys(newWeights) as (keyof typeof weights)[])
        .filter(k => k !== sliderName);

    let adjustedValue = Math.max(0, Math.min(1, value));
    newWeights[sliderName] = adjustedValue;

    let remainingSum = 1 - adjustedValue;
    if (remainingSum < 0) remainingSum = 0;

    const currentSumOfOthers = otherSliders.reduce((sum, k) => sum + (newWeights[k] || 0), 0); // Ensure newWeights[k] is not undefined if logic runs before full init

    if (currentSumOfOthers === 0 && otherSliders.length > 0) {
      const valPerSlider = remainingSum / otherSliders.length;
      otherSliders.forEach(k => newWeights[k] = valPerSlider);
    } else if (otherSliders.length > 0) {
      const ratio = remainingSum / currentSumOfOthers;
      otherSliders.forEach(k => newWeights[k] = (newWeights[k] || 0) * ratio);
    }

    let tempSum = (newWeights.w_skill || 0) + (newWeights.w_experience || 0) + (newWeights.w_culture || 0);

    // Normalize to ensure sum is exactly 1 and handle potential floating point issues
    if (tempSum === 0) { // Avoid division by zero, reset to defaults or equal distribution
        newWeights.w_skill = 1/3;
        newWeights.w_experience = 1/3;
        newWeights.w_culture = 1/3;
    } else {
        newWeights.w_skill = (newWeights.w_skill || 0) / tempSum;
        newWeights.w_experience = (newWeights.w_experience || 0) / tempSum;
        // Assign the last one to make up the difference to 1, to avoid sum being 0.99999... or 1.0000...1
        newWeights.w_culture = 1 - newWeights.w_skill - newWeights.w_experience;
    }

    // Final clamp for safety, though normalization should handle it.
    newWeights.w_skill = Math.max(0, Math.min(1, newWeights.w_skill));
    newWeights.w_experience = Math.max(0, Math.min(1, newWeights.w_experience));
    newWeights.w_culture = Math.max(0, Math.min(1, newWeights.w_culture));

    // If due to clamping the sum is off again, re-adjust the last one slightly (most likely w_culture)
    const finalSumCheck = newWeights.w_skill + newWeights.w_experience + newWeights.w_culture;
    if (Math.abs(finalSumCheck - 1) > 0.00001) { // Small tolerance
        newWeights.w_culture += (1 - finalSumCheck);
        newWeights.w_culture = Math.max(0, Math.min(1, newWeights.w_culture)); // Re-clamp last one
        // If still off, it means first two are too large. Force w_skill and w_experience to allow w_culture to be >=0
        if (newWeights.w_skill + newWeights.w_experience > 1) {
            const excess = (newWeights.w_skill + newWeights.w_experience) - 1;
            // Reduce proportionally from skill and experience
            const sumSkillExp = newWeights.w_skill + newWeights.w_experience;
            if (sumSkillExp > 0) { // Avoid division by zero
                 newWeights.w_skill -= excess * (newWeights.w_skill / sumSkillExp);
                 newWeights.w_experience -= excess * (newWeights.w_experience / sumSkillExp);
            } else { // Should not happen if they were > 1
                 newWeights.w_skill = 0.5; newWeights.w_experience = 0.5; // Fallback
            }
            newWeights.w_skill = Math.max(0, Math.min(1, newWeights.w_skill));
            newWeights.w_experience = Math.max(0, Math.min(1, newWeights.w_experience));
        }
        newWeights.w_culture = 1 - newWeights.w_skill - newWeights.w_experience;
    }

    setWeights(newWeights);

    if (searchTerm) {
      debouncedFetchCandidates(searchTerm, newWeights);
    }
  };

  useEffect(() => {
    const sum = Object.values(weights).reduce((acc, val) => acc + val, 0);
    if (Math.abs(sum - 1) > 0.001) {
      console.warn("Correcting weights sum on load to defaults");
      setWeights({ w_skill: 0.4, w_experience: 0.3, w_culture: 0.3 });
    }
  }, []);


  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Candidate Search</h1>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter search query"
          style={{ width: 'calc(70% - 5px)', padding: '10px', marginRight: '10px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button
          onClick={handleSearch}
          style={{ padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: 'none', backgroundColor: '#007bff', color: 'white', borderRadius: '4px' }}
        >
          Search
        </button>
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
        <h3 style={{marginTop: 0}}>Adjust Scoring Weights (Sum to 1)</h3>
        {(['w_skill', 'w_experience', 'w_culture'] as (keyof typeof weights)[]).map(weightKey => (
          <div key={weightKey} style={{marginBottom: '10px'}}>
            <label htmlFor={weightKey} style={{display: 'block', marginBottom: '3px', fontSize: '14px', color: '#333'}}>
              {weightKey.replace('w_', '').replace('_', ' ')}: {weights[weightKey].toFixed(2)}
            </label>
            <input
              type="range"
              id={weightKey}
              min="0"
              max="1"
              step="0.01"
              value={weights[weightKey]}
              onChange={(e) => handleWeightChange(weightKey, parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        ))}
      </div>

      {isLoading && <p style={{textAlign: 'center', fontSize: '18px'}}>Loading...</p>}
      {apiError && <p style={{ color: 'red', textAlign: 'center', border: '1px solid red', padding: '10px', borderRadius: '4px' }}>Error: {apiError}</p>}

      {!isLoading && !apiError && candidates.length === 0 && searchTerm && (
        <p style={{textAlign: 'center', fontSize: '16px'}}>No candidates found for "{searchTerm}".</p>
      )}

      {candidates.length > 0 && (
        <div>
          <h2 style={{borderBottom: '2px solid #eee', paddingBottom: '10px'}}>Search Results for "{searchTerm}"</h2>
          <div style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
            Using weights: Skill ({weights.w_skill.toFixed(2)}), Experience ({weights.w_experience.toFixed(2)}), Culture ({weights.w_culture.toFixed(2)})
          </div>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {candidates.map(candidate => (
              <li key={candidate.id} style={{ marginBottom: '15px', padding: '15px', border: '1px solid #eee', borderRadius: '4px', backgroundColor: 'white' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h3 style={{margin: '0 0 5px 0'}}>
                      {candidate.name || 'N/A'}
                      <span style={{fontSize: '14px', color: '#555'}}> ({candidate.title || 'N/A'})</span>
                    </h3>
                    {candidate.source_url && candidate.source_url !== '#' && (
                        <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize: '12px'}}>Source</a>
                    )}
                </div>
                <p style={{margin: '5px 0', fontSize: '14px', fontWeight: 'bold'}}>
                  Overall Match Score: {candidate.match_score.toFixed(3)}
                </p>
                <p style={{margin: '5px 0', fontSize: '12px', color: '#333'}}>
                  Percentile Rank: {candidate.percentile_rank.toFixed(1)}%
                  <span title={`This candidate scores higher than ${candidate.percentile_rank.toFixed(1)}% of other candidates in this list.`} style={{cursor: 'help'}}> (?)</span>
                </p>
                {/* Optionally display a few skills */}
                {candidate.skills && candidate.skills.length > 0 && (
                  <p style={{margin: '5px 0', fontSize: '12px', color: '#444'}}>
                    Skills: {candidate.skills.slice(0, 3).join(', ')}{candidate.skills.length > 3 ? '...' : ''}
                  </p>
                )}

                <div style={{ margin: '10px 0' }}>
                  <ProgressBar
                    label="Skill Match"
                    score={candidate.skill_match}
                    tooltipText={`Skill Match Score: ${candidate.skill_match.toFixed(2)} - Alignment with required skills. Weight: ${weights.w_skill.toFixed(2)}.`}
                    barColor="#2196F3" // Blue
                  />
                  <ProgressBar
                    label="Experience Relevance"
                    score={candidate.experience_relevance}
                    tooltipText={`Experience Relevance Score: ${candidate.experience_relevance.toFixed(2)} - Relevance of past experience. Weight: ${weights.w_experience.toFixed(2)}.`}
                    barColor="#4CAF50" // Green
                  />
                  <ProgressBar
                    label="Cultural Fit"
                    score={candidate.cultural_fit}
                    tooltipText={`Cultural Fit Score: ${candidate.cultural_fit.toFixed(2)} - Potential cultural alignment. Weight: ${weights.w_culture.toFixed(2)}.`}
                    barColor="#FFC107" // Amber
                  />
                </div>
                <p style={{margin: '5px 0 0 0', fontSize: '12px', color: '#666'}}>
                  <span style={{fontWeight:"bold"}}>Reasoning:</span> {candidate.reasoning || 'N/A'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
