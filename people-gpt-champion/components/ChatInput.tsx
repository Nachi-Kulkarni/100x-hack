'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  placeholder?: string;
  isLoading?: boolean; // To disable input/button during processing
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  placeholder = 'Type your message...',
  isLoading = false,
}) => {
  const [message, setMessage] = useState('');

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim());
      setMessage(''); // Clear input after sending
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent newline on Enter
      handleSendMessage();
    }
  };

  return (
    <div className="flex items-start p-2 bg-neutral-50 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
      <textarea
        value={message}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        rows={2} // Start with 2 rows, can expand
        aria-label="Type your message"
        className="flex-grow p-2 mr-2 text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
        disabled={isLoading}
      />
      <button
        onClick={handleSendMessage}
        disabled={isLoading || !message.trim()}
        className="p-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Send message"
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  );
};

export default ChatInput;
