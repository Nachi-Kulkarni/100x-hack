'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react'; // Using an existing icon library

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  isLoading?: boolean;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  placeholder = 'Search...',
  initialValue = '',
  isLoading = false,
}) => {
  const [query, setQuery] = useState<string>(initialValue);

  // Sync query with initialValue if it changes externally
  React.useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleSearch = () => {
    if (query.trim() && !isLoading) { // Prevent search if loading
      onSearch(query.trim());
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) { // Prevent search if loading
      handleSearch();
    }
  };

  return (
    <div className={`flex items-center w-full max-w-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-sm overflow-hidden ${isLoading ? 'opacity-70' : ''}`}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        aria-label="Search query"
        className="flex-grow p-3 text-neutral-700 dark:text-neutral-200 bg-transparent focus:outline-none disabled:cursor-not-allowed"
        disabled={isLoading}
      />
      <button
        onClick={handleSearch}
        className="p-3 text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Search"
        disabled={isLoading || !query.trim()}
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5 text-neutral-500 dark:text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <Search size={20} />
        )}
      </button>
    </div>
  );
};

export default SearchInput;
