"use client";

import React, { useState, useEffect, useCallback } from 'react';
import OutreachModal from '@/components/OutreachModal';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { useSession } from "next-auth/react"; // Import useSession
// Added import -- REMOVED
import { Role } from '@prisma/client'; // Import Role enum

// New Component Imports
import SearchInput from '../components/SearchInput';
import CandidateCard from '../components/CandidateCard'; // Removed alias
import ChatInput from '../components/ChatInput';
import ChatMessageDisplay, { Message } from '../components/ChatMessageDisplay';
import FilterPanel, { FilterCategory, FilterOption } from '../components/FilterPanel';


// Define Candidate and related types based on schemas.ts (existing)
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
  const { data: session, status } = useSession(); // Use the hook
  const userRole = session?.user?.role; // Get role from session

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [weights, setWeights] = useState({
    w_skill: 0.4,
    w_experience: 0.3,
    w_culture: 0.3,
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]); // For existing API-driven search results
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]); // For existing outreach modal selection from search results
  const [isOutreachModalOpen, setIsOutreachModalOpen] = useState(false);
  const [testErrorThrown, setTestErrorThrown] = useState(false); // Sentry test error

// Utility function for percentile calculation
const calculatePercentileRanks = (candidates: Candidate[]): Candidate[] => {
  if (!candidates || candidates.length === 0) {
    return [];
  }
  // Ensure candidates have match_score, filter out those that don't for safety if necessary
  const validCandidates = candidates.filter(c => typeof c.match_score === 'number');
  if (validCandidates.length === 0) {
    // If no candidates have a valid score, return original candidates with default percentile_rank
    return candidates.map(c => ({ ...c, percentile_rank: c.percentile_rank !== undefined ? c.percentile_rank : 0 }));
  }

  const maxScore = Math.max(...validCandidates.map(c => c.match_score));

  return candidates.map(candidate => {
    if (typeof candidate.match_score !== 'number') {
      return { ...candidate, percentile_rank: candidate.percentile_rank !== undefined ? candidate.percentile_rank : 0 }; // Default for candidates without a score
    }

    let numStrictlyLess = 0;
    if (validCandidates.length > 1) {
      numStrictlyLess = validCandidates.filter(c => c.match_score < candidate.match_score).length;
    }

    let percentile;
    // validCandidates.length will be at least 1 if we reached here and candidate.match_score is a number
    if (candidate.match_score === maxScore) {
      percentile = 100;
    } else if (validCandidates.length === 1) { // Single candidate with a score is 100th percentile
      percentile = 100;
    } else {
      // Denominator should be (validCandidates.length - 1)
      // However, if all remaining candidates have the same score as the current one,
      // and it's not the maxScore, this could lead to division by zero if validCandidates.length -1 is 0
      // The logic of (numStrictlyLess / (denominator)) handles cases where multiple candidates exist.
      // If validCandidates.length is 1, it's caught by the previous condition.
      // If all candidates have the same score, numStrictlyLess will be 0, so percentile will be 0 (unless it's maxScore).
      // This seems to be the intended logic from the original implementation.
      const denominator = validCandidates.length -1;
      percentile = denominator > 0 ? (numStrictlyLess / denominator) * 100 : 100; // if only one candidate, or all same score below max, treat as 100 to avoid div by 0 for this specific interpretation. Original code implied this for single item lists.
    }
    return { ...candidate, percentile_rank: parseFloat(percentile.toFixed(1)) };
  });
};

  // State for new UI components
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, any>>({});
  const [newSearchResults, setNewSearchResults] = useState<Candidate[]>([]);
  const [isNewSearchLoading, setIsNewSearchLoading] = useState(false);
  const [newSearchError, setNewSearchError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { id: 'welcome', text: 'Welcome to the chat! Type a message below.', sender: 'system', timestamp: new Date() }
  ]);
  // selectedCandidateIds will be used for the OutreachModal as selectedIdsForModal logic (already exists)

  // State for resume upload
  const [selectedResumes, setSelectedResumes] = useState<FileList | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedCandidateIds, setUploadedCandidateIds] = useState<string[]>([]);

  const throwTestError = () => {
    setTestErrorThrown(true); // Optional: give some UI feedback
    throw new Error("Sentry Test Error - Client Side - " + new Date().toISOString());
  };

  const handleResumeFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedResumes(event.target.files);
      setUploadStatus(null); // Reset status on new file selection
      setUploadError(null);
      setUploadedCandidateIds([]);
    }
  };

  const handleResumeUpload = async () => {
    if (!selectedResumes || selectedResumes.length === 0) {
      setUploadError("Please select one or more resume files to upload.");
      return;
    }

    setUploadStatus("Uploading...");
    setUploadError(null);
    setUploadedCandidateIds([]);

    const formData = new FormData();
    for (let i = 0; i < selectedResumes.length; i++) {
      formData.append("resumes", selectedResumes[i]);
    }

    try {
      const response = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
        // Headers are not strictly necessary for FormData, browser sets it
        // headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result = await response.json(); // This should be IParseResumeApiResponse

      if (!response.ok && response.status !== 207) { // Standard HTTP error, excluding 207
        throw new Error(result.error || `API Error: ${response.status} ${response.statusText}`);
      }

      if (response.status === 207 && result.results && Array.isArray(result.results)) {
        // Handle 207 Multi-Status for batch uploads
        const successfulUploads: string[] = [];
        const failedUploads: { file: string; message: string }[] = [];

        result.results.forEach((item: { status: string; file: string; candidateId?: string; message?: string }) => {
          if (item.status === 'success' && item.candidateId) {
            successfulUploads.push(item.candidateId);
          } else if (item.status === 'error') {
            failedUploads.push({ file: item.file, message: item.message || 'Unknown error' });
          }
        });

        setUploadedCandidateIds(successfulUploads);

        let statusMsg = result.message || ''; // Start with the overall message from API
        if (successfulUploads.length > 0) {
          statusMsg += ` Successfully uploaded ${successfulUploads.length} resume(s).`;
        }
        if (failedUploads.length > 0) {
          statusMsg += ` ${failedUploads.length} file(s) failed to upload.`;
          const errorDetails = failedUploads.map(f => `${f.file}: ${f.message}`).join('; ');
          setUploadError(`Failed uploads: ${errorDetails}`);
        } else {
          setUploadError(null); // Clear previous errors if all succeed this time
        }
        setUploadStatus(statusMsg.trim());

        if (successfulUploads.length > 0) {
          setSelectedResumes(null); // Clear selection if at least one was successful
        }

      } else if (response.ok) { // For non-207 success, or if API falls back to simpler success for single files
        // This part attempts to handle a potential single success response (legacy or alternative path)
        // It's less likely if the API always uses 207 for consistency, even for single files.
        if (result.success && result.candidate_ids && Array.isArray(result.candidate_ids)) { // Original check
          setUploadStatus(`Successfully uploaded and parsed ${result.candidate_ids.length} resume(s).`);
          setUploadedCandidateIds(result.candidate_ids);
          setSelectedResumes(null);
        } else if (result.message) { // Generic message from API
          setUploadStatus(result.message);
        } else {
          setUploadStatus("Upload completed, but response format was unexpected.");
        }
      } else {
        // If response.ok is false and it's not a 207 that was handled above,
        // this means it's an error status code that wasn't caught by the first `if (!response.ok ...)`
        // (e.g. if result.error was not present for some reason).
        // This path is less likely to be hit given the initial `!response.ok` check.
        throw new Error(result.error || `API Error: ${response.status} ${response.statusText}`);
      }

    } catch (err: any) {
      setUploadError(err.message || "An unknown error occurred during upload.");
      setUploadStatus(null); // Clear status message on error
    }
  };

  const handleSendMessage = (text: string) => {
    const newUserMessage: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setChatMessages(prev => [...prev, newUserMessage]);
    // Dummy AI response
    setTimeout(() => {
      const aiResponse: Message = { id: (Date.now() + 1).toString(), text: `AI received: "${text}"`, sender: 'ai', timestamp: new Date() };
      setChatMessages(prev => [...prev, aiResponse]);
    }, 500);
  };

  const sampleFiltersData: FilterCategory[] = [
    { id: 'availability', label: 'Availability', type: 'select', options: [{value: 'now', label: 'Available Now'}, {value: 'next_month', label: 'Next Month'}] },
    { id: 'skills', label: 'Key Skills', type: 'multiselect', options: [{value: 'react', label: 'React'}, {value: 'node', label: 'Node.js'}, {value: 'python', label: 'Python'}, {value: 'typescript', label: 'TypeScript'}, {value: 'java', label: 'Java'}] },
    { id: 'experience', label: 'Min Experience (Years)', type: 'select', options: [{value: '1', label: '1+'}, {value: '3', label: '3+'}, {value: '5', label: '5+'}] },
    { id: 'remote', label: 'Remote Only', type: 'checkbox', options: [{value: 'true', label: 'Yes'}] }
  ];

  const executeNewSearch = useCallback(async (currentQuery: string, currentFilters: Record<string, any>) => {
    if (!currentQuery && Object.keys(currentFilters).length === 0) {
      setNewSearchResults([]);
      setNewSearchError(null);
      setIsNewSearchLoading(false); // Ensure loading is false if no action taken
      return;
    }
    setIsNewSearchLoading(true);
    setNewSearchError(null);
    try {
      const payload = {
        query: currentQuery,
        filters: currentFilters,
        weights: weights, // Using weights from legacy state for now
      };
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: SearchApiResponse = await response.json(); // SearchApiResponse is already defined
      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }

      let fetchedCandidates = data.candidates || [];
      fetchedCandidates = calculatePercentileRanks(fetchedCandidates);
      setNewSearchResults(fetchedCandidates);
    } catch (err: any) {
      setNewSearchError(err.message || 'Failed to fetch new search results.');
      setNewSearchResults([]);
    } finally {
      setIsNewSearchLoading(false);
    }
  }, [weights]); // Dependency: weights (from legacy state)

  const debouncedExecuteNewSearch = useCallback(debounce(executeNewSearch, 700), [executeNewSearch]);

  const handleNewSearchTrigger = (query: string) => {
    setActiveSearchQuery(query);
    executeNewSearch(query, appliedFilters); // Non-debounced for direct search action
  };

  const handleNewFilterChange = (filterId: string, value: any) => {
    const newFilters = { ...appliedFilters };
    if (value === undefined || (Array.isArray(value) && value.length === 0) || value === '') {
      delete newFilters[filterId];
    } else {
      newFilters[filterId] = value;
    }
    setAppliedFilters(newFilters);
    // Debounce API call when filters change
    debouncedExecuteNewSearch(activeSearchQuery, newFilters);
  };

  const handleCandidateSelection = (candidateId: string) => {
    setSelectedCandidateIds(prevSelectedIds =>
      prevSelectedIds.includes(candidateId)
        ? prevSelectedIds.filter(id => id !== candidateId) // Deselect
        : [...prevSelectedIds, candidateId] // Select
    );
  };

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
      fetchedCandidates = calculatePercentileRanks(fetchedCandidates);
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

    // If there's an active search query or applied filters for the new search UI,
    // re-trigger the search with the new weights.
    // executeNewSearch will use the 'weights' state which was just updated.
    if (activeSearchQuery || Object.keys(appliedFilters).length > 0) {
      debouncedExecuteNewSearch(activeSearchQuery, appliedFilters);
    } else {
      // Optional: If you want to clear results when weights change and there's no active query/filter
      // setNewSearchResults([]);
      // Or, do nothing, and the weights will apply to the next search.
      // For now, let's do nothing if no active search/filter, to avoid clearing results unnecessarily.
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
    // Use dark:bg-neutral-900 for overall page background for better contrast with components in dark mode
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-12">

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 dark:text-neutral-100">Candidate Search & Outreach</h1>
          <ThemeSwitcher />
        </div>
    <div style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      {status === "loading" && <p>Loading session...</p>}
      {session && (
        <div style={{ padding: "10px", marginBottom: "10px", backgroundColor: "#e6f7ff", border: "1px solid #91d5ff", borderRadius: "4px" }}>
          <p>Welcome, {session.user?.name || session.user?.email}! (Role: {userRole || 'Unknown'})</p>
        </div>
      )}

      {/* Conditional UI for ADMIN role */}
      {userRole === Role.ADMIN && (
        <div style={{ padding: "10px", marginBottom: "20px", backgroundColor: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "4px" }}>
          <h2>Admin Controls</h2>
          <p>Special administrative actions can be placed here.</p>
          <button style={{padding: "8px 12px", marginRight: "10px", backgroundColor: "orange", color: "white", border: "none", borderRadius: "4px"}}>Admin Action Button</button>

          {/* Resume Upload Section - Visible only to ADMIN */}
          <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #ffe58f" }}>
            <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Upload Resumes</h3>
            <input
              type="file"
              multiple
              onChange={handleResumeFileChange}
              accept=".pdf,.docx" // Specify acceptable file types - aligned with backend
              style={{ display: 'block', marginBottom: '10px' }}
            />
            <button
              onClick={handleResumeUpload}
              disabled={!selectedResumes || selectedResumes.length === 0 || uploadStatus === "Uploading..."}
              style={{
                padding: "10px 15px",
                backgroundColor: (uploadStatus === "Uploading..." || !selectedResumes || selectedResumes.length === 0) ? "#ccc" : "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: (uploadStatus === "Uploading..." || !selectedResumes || selectedResumes.length === 0) ? "not-allowed" : "pointer"
              }}
            >
              {uploadStatus === "Uploading..." ? "Uploading..." : "Upload Selected Resumes"}
            </button>
            {uploadStatus && !uploadError && <p style={{ color: 'green', marginTop: '10px' }}>{uploadStatus}</p>}
            {uploadedCandidateIds.length > 0 && (
              <p style={{ marginTop: '5px' }}>Candidate IDs: {uploadedCandidateIds.join(', ')}</p>
            )}
            {uploadError && <p style={{ color: 'red', marginTop: '10px' }}>Error: {uploadError}</p>}
          </div>
        </div>
      )}

      <h1>Candidate Search</h1>

      {/* Example of disabling a button based on role */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
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
        <button
          onClick={() => {
            if (selectedCandidateIds.length > 0) {
              setIsOutreachModalOpen(true);
            }
          }}
          // Align outreach button with API permissions (ADMIN or RECRUITER)
          disabled={selectedCandidateIds.length === 0 || !(userRole === Role.ADMIN || userRole === Role.RECRUITER)}
          title={!(userRole === Role.ADMIN || userRole === Role.RECRUITER) ? "Outreach available for Admin/Recruiter roles only" : "Initiate outreach to selected candidates"}
          style={{
            padding: '10px 15px',
            fontSize: '16px',
            cursor: (selectedCandidateIds.length === 0 || !(userRole === Role.ADMIN || userRole === Role.RECRUITER)) ? 'not-allowed' : 'pointer',
            border: 'none',
            backgroundColor: (selectedCandidateIds.length === 0 || !(userRole === Role.ADMIN || userRole === Role.RECRUITER)) ? '#ccc' : '#28a745',
            color: 'white',
            borderRadius: '4px',
            marginLeft: '10px'
          }}
        >
          Initiate Outreach ({selectedCandidateIds.length})
        </button>
      </div>

      {/* Example of hiding an element for non-ADMIN users */}
      {userRole === Role.ADMIN && (
        <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f0f0f0' }}>
            <p>This entire section is visible only to ADMIN users.</p>
        </div>
      )}

      {/* New RBAC UI Examples */}
      <div style={{marginTop: "20px", marginBottom: "20px", padding: "15px", border: "1px solid #ccc", borderRadius: "4px"}}>
        <h2 style={{marginTop: 0}}>Role-Specific Features</h2>

        {/* Example 2: Recruiter/Admin Feature Button */}
        {(userRole === Role.ADMIN || userRole === Role.RECRUITER) && (
          <button style={{padding: "10px 15px", marginRight:"10px", backgroundColor: "teal", color: "white", border: "none", borderRadius: "4px"}}>
            Access Candidate Database
          </button>
        )}

        {/* Example 3: Feature Disabled for Basic User */}
        <button
          style={{
            padding: "10px 15px",
            backgroundColor: (userRole === Role.USER || !session) ? "#aaa" : "purple",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: (userRole === Role.USER || !session) ? "not-allowed" : "pointer"
          }}
          disabled={userRole === Role.USER || !session}
          title={(userRole === Role.USER || !session) ? "This action requires Recruiter or Admin privileges." : "Perform an advanced action."}
        >
          Perform Advanced Action {(userRole === Role.USER || !session) ? "(Disabled)" : ""}
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

        {/* Sentry Test Area */}
        <div className="my-4 p-4 border border-dashed border-red-500 dark:border-red-700 rounded-md bg-white dark:bg-neutral-800">
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Sentry Test Area</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
            Click the button below to throw a test error. If Sentry is configured with a valid DSN,
            this error should be reported to your Sentry dashboard.
          </p>
          <button
            onClick={throwTestError}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out active:bg-red-700"
          >
            Throw Client-Side Test Error
          </button>
          {testErrorThrown && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              A test error was thrown. Check your Sentry dashboard (if DSN is configured) and the browser console.
            </p>
          )}
        </div>

        {/* Existing Candidate Search and Filtering (Legacy) - Keep for now or phase out */}
        <section aria-labelledby="legacy-search-heading" className="p-4 md:p-6 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
          <h2 id="legacy-search-heading" className="text-2xl font-semibold mb-4 text-neutral-800 dark:text-neutral-100">Legacy Candidate Search</h2>
          <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
            <input
              type="text"
              value={query} // Existing state for legacy search
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search query (legacy)"
              aria-label="Legacy Search Query"
              className="flex-grow p-3 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none text-neutral-700 dark:text-neutral-200"
            />
            <button
              onClick={handleSearch} // Existing handler
              disabled={isLoading} // Disable legacy search button when loading
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out disabled:bg-blue-400 dark:disabled:bg-blue-800 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Searching...' : 'Search (Legacy)'}
            </button>
            <button
              onClick={() => {
                if (selectedCandidateIds.length > 0) {
                  setIsOutreachModalOpen(true);
                }
              }}
              disabled={selectedCandidateIds.length === 0 || !(userRole === Role.ADMIN || userRole === Role.RECRUITER)}
              title={!(userRole === Role.ADMIN || userRole === Role.RECRUITER) ? "Outreach available for Admin/Recruiter roles only" : "Initiate outreach to selected candidates"}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out disabled:bg-neutral-400 dark:disabled:bg-neutral-600 disabled:cursor-not-allowed"
            >
              Initiate Outreach ({selectedCandidateIds.length})
            </button>
          </div>
          <div className="p-4 bg-neutral-50 dark:bg-neutral-700 rounded-lg border dark:border-neutral-600">
            <h3 className="text-lg font-medium mb-2 text-neutral-700 dark:text-neutral-200">Adjust Scoring Weights (Sum to 1)</h3>
            {(['w_skill', 'w_experience', 'w_culture'] as (keyof typeof weights)[]).map(weightKey => (
              <div key={weightKey} className="mb-3">
                <label htmlFor={weightKey} className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 capitalize">
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
                  className="w-full h-2 bg-neutral-200 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500 dark:accent-blue-400"
                />
              </div>
            ))}
          </div>
          {isLoading && <p className="text-center mt-4 p-3 text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-600">Loading legacy results...</p>}
          {apiError && <p className="text-center mt-4 text-red-600 dark:text-red-400 p-3 bg-red-100 dark:bg-red-800 border border-red-500 dark:border-red-700 rounded-md">Error: {apiError}</p>}
          {!isLoading && !apiError && candidates.length === 0 && searchTerm && (
            <p className="text-center mt-4 p-3 text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-600">No candidates found for "{searchTerm}" (legacy).</p>
          )}
           {/* Existing candidates list display - simplified for brevity, assuming it's styled adequately or will be removed */}
          {candidates.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3 text-neutral-800 dark:text-neutral-100">Search Results for "{searchTerm}" (Legacy)</h3>
              <ul className="space-y-4">
                {candidates.slice(0,3).map(candidate => ( // Show only top 3 for brevity in this combined view
                  <li key={candidate.id} className="p-4 bg-neutral-50 dark:bg-neutral-700 rounded-lg shadow border dark:border-neutral-600 flex items-start space-x-3">
                     <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onChange={() => handleCandidateSelection(candidate.id)}
                        aria-label={`Select candidate ${candidate.name || 'unnamed'}`}
                        className="mt-1 h-4 w-4 text-blue-600 border-neutral-300 dark:border-neutral-500 rounded focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-neutral-600"
                      />
                    <div>
                      <h4 className="font-semibold text-neutral-800 dark:text-neutral-100">{candidate.name || 'N/A'} <span className="text-sm text-neutral-600 dark:text-neutral-300">({candidate.title || 'N/A'})</span></h4>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">Score: {candidate.match_score?.toFixed(2)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>


        {/* New UI Components Section */}
        <section aria-labelledby="new-components-heading" className="mb-8 p-4 md:p-6 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
          <h2 id="new-components-heading" className="text-2xl font-semibold mb-6 text-neutral-800 dark:text-neutral-100">New Component Integration Area</h2>

          <div className="mb-8"> {/* This div could be a <section> too if Candidate Search & Listing is a major sub-region */}
            <h3 className="text-xl font-semibold mb-4 text-neutral-700 dark:text-neutral-200">Candidate Search & Listing (New)</h3>
            <div className="md:flex md:space-x-6">
              <div className="md:w-1/3 mb-6 md:mb-0">
                <FilterPanel filters={sampleFiltersData} appliedFilters={appliedFilters} onFilterChange={handleNewFilterChange} />
              </div>
              <div className="md:w-2/3">
                <SearchInput
                  onSearch={handleNewSearchTrigger}
                  placeholder="Search candidates (new)..."
                  initialValue={activeSearchQuery} // Keep SearchInput in sync if query can be set externally
                  isLoading={isNewSearchLoading} // Pass loading state to new SearchInput
                />
                {isNewSearchLoading && <p className="mt-4 text-center p-3 text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-600">Loading new results...</p>}
                {newSearchError && <p className="mt-4 text-center text-red-600 dark:text-red-400 p-3 bg-red-100 dark:bg-red-800 border border-red-500 dark:border-red-700 rounded-md">Error: {newSearchError}</p>}
                {!isNewSearchLoading && !newSearchError && newSearchResults.length === 0 && (activeSearchQuery || Object.keys(appliedFilters).length > 0) && (
                  <p className="mt-4 text-center p-3 text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-600">No candidates found for the current criteria.</p>
                )}
                {!isNewSearchLoading && !newSearchError && newSearchResults.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {newSearchResults.map(candidate => (
                      <div key={candidate.id} className="flex items-start space-x-3 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow-md transition-shadow">
                        <input
                          type="checkbox"
                          checked={selectedCandidateIds.includes(candidate.id)}
                          onChange={() => handleCandidateSelection(candidate.id)} // Reuse existing handler
                          aria-label={`Select candidate ${candidate.name || 'unnamed'}`}
                          className="mt-1 h-4 w-4 text-blue-600 border-neutral-300 dark:border-neutral-500 rounded focus:ring-blue-500 dark:focus:ring-offset-0 dark:focus:ring-offset-neutral-800 bg-white dark:bg-neutral-700 cursor-pointer"
                        />
                        <div className="flex-grow"> {/* This div ensures CandidateCard takes remaining space */}
                          <CandidateCard
                            candidate={candidate}
                            onViewDetails={() => console.log('View details for new candidate:', candidate.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-700 my-8"></div>

          <section aria-labelledby="chat-example-heading">
            <h3 id="chat-example-heading" className="text-xl font-semibold mb-4 text-neutral-700 dark:text-neutral-200">Chat Example (New)</h3>
            <div className="h-[450px] flex flex-col border border-neutral-300 dark:border-neutral-600 rounded-lg shadow">
              <ChatMessageDisplay messages={chatMessages} />
              <ChatInput onSendMessage={handleSendMessage} />
            </div>
          </section>
        </section>


        {isOutreachModalOpen && (
          <OutreachModal
            isOpen={isOutreachModalOpen}
            onClose={() => setIsOutreachModalOpen(false)}
            selectedCandidateIds={selectedCandidateIds} // Uses the existing selectedCandidateIds from legacy search results
          />
        )}
      </div>
    </div>
  );
}
