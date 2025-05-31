'use client';

import React from 'react';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system'; // Or other relevant sender types
  timestamp?: Date;
}

interface ChatMessageDisplayProps {
  messages: Message[];
}

const ChatMessageDisplay: React.FC<ChatMessageDisplayProps> = ({ messages }) => {
  return (
    <div className="flex-grow p-4 space-y-4 overflow-y-auto bg-white dark:bg-neutral-900">
      {messages.length === 0 ? (
        <p className="text-center text-neutral-500 dark:text-neutral-400">No messages yet. Start the conversation!</p>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow ${
                msg.sender === 'user'
                  ? 'bg-blue-500 text-white dark:bg-blue-600'
                  : 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.timestamp && (
                 <p className={`text-xs mt-1 ${
                    msg.sender === 'user'
                      ? 'text-blue-200 dark:text-blue-300 text-right'
                      : 'text-neutral-500 dark:text-neutral-400 text-left'
                 }`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                 </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ChatMessageDisplay;
