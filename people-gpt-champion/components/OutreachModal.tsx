import React, { useState, useEffect } // Added useEffect
from 'react';

// Define a type for the template structure
// Note: `body` is added to EmailTemplateVersion for direct template usage
interface EmailTemplateVersion {
  id: string;
  subject: string;
  body: string;
  versionNumber: number;
  isArchived?: boolean; // Added from schema for filtering
}
interface EmailTemplate {
  id: string;
  name: string;
  versions: EmailTemplateVersion[];
}

// For candidate profile data structure (align with OutreachProfileResponseSchema)
interface CandidateProfile {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    headline?: string | null;
    keySkills?: string[] | null;
    experienceSummary?: string | null;
    educationSummary?: string | null;
}

interface GeneratedContent {
  candidateId: string;
  candidateName?: string; // Store name for display
  subject?: string;
  body?: string;
  error?: string;
  isLoading: boolean;
}

interface OutreachModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCandidateIds: string[];
}

const OutreachModal: React.FC<OutreachModalProps> = ({ isOpen, onClose, selectedCandidateIds }) => {
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'slack' | 'sms' | null>(null);
  const [contentStrategy, setContentStrategy] = useState<'ai' | 'template' | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<string>('neutral');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [generatedContents, setGeneratedContents] = useState<GeneratedContent[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // State for sending process
  interface SendStatus {
    candidateId: string;
    isSending: boolean;
    sendSuccess?: boolean;
    sendError?: string;
  }
  const [sendStatuses, setSendStatuses] = useState<SendStatus[]>([]);
  const [isBatchSending, setIsBatchSending] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && selectedChannel === 'email') {
      const fetchTemplates = async () => {
        setIsLoadingTemplates(true);
        try {
          const response = await fetch('/api/email-templates');
          if (!response.ok) {
            throw new Error('Failed to fetch email templates');
          }
          // Assuming API returns an array of templates directly, not nested under a 'templates' key.
          // Based on /api/email-templates.ts, it returns EmailTemplateApiResponseSchema[]
          const data: EmailTemplate[] = await response.json();
          setEmailTemplates(data || []);
        } catch (error) {
          console.error("Error fetching email templates:", error);
          setEmailTemplates([]);
        } finally {
          setIsLoadingTemplates(false);
        }
      };
      fetchTemplates();
    } else {
      setEmailTemplates([]);
      setSelectedTemplateId(null);
      // Content strategy is reset when channel changes, handled by button onClick
    }
  }, [isOpen, selectedChannel]);

  const handleChannelButtonClick = (channel: 'email' | 'slack' | 'sms') => {
    setSelectedChannel(channel);
    setContentStrategy(null);
    setSelectedTemplateId(null);
    setSelectedTone('neutral');
    setGeneratedContents([]);
    setIsGenerating(false);
    setSendStatuses([]); // Clear send statuses
    setIsBatchSending(false); // Reset batch sending flag
  };

  const handleContentChange = (candidateId: string, field: 'subject' | 'body', value: string) => {
    setGeneratedContents(prev =>
      prev.map(gc =>
        gc.candidateId === candidateId ? { ...gc, [field]: value, error: undefined } : gc // Clear error on edit
      )
    );
    // Also clear relevant sendStatus if content is edited after a send attempt
    setSendStatuses(prev => prev.filter(ss => ss.candidateId !== candidateId));
  };

  const handleGenerateContent = async () => {
    if (!selectedChannel || !contentStrategy || selectedCandidateIds.length === 0) return;
    if (contentStrategy === 'ai' && !selectedTone) return;
    if (contentStrategy === 'template' && selectedChannel === 'email' && !selectedTemplateId) return;

    setIsGenerating(true);
    setGeneratedContents(
      selectedCandidateIds.map(id => ({ candidateId: id, isLoading: true, candidateName: 'Loading...' }))
    );

    const newGeneratedContents: GeneratedContent[] = [];

    for (const candidateId of selectedCandidateIds) {
      let candidateProfile: CandidateProfile | null = null;
      let currentContent: Partial<GeneratedContent> = { candidateId, isLoading: true };

      try {
        const profileResponse = await fetch(`/api/candidate/${candidateId}/outreach-profile`);
        if (!profileResponse.ok) {
          const errorData = await profileResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch profile (${profileResponse.status})`);
        }
        candidateProfile = await profileResponse.json() as CandidateProfile;
        currentContent.candidateName = candidateProfile?.name || candidateId;
      } catch (error: any) {
        console.error(`Error fetching profile for ${candidateId}:`, error);
        newGeneratedContents.push({
            candidateId,
            isLoading: false,
            error: error.message || 'Failed to fetch profile',
            candidateName: candidateId
        });
        continue;
      }

      if (contentStrategy === 'template' && selectedChannel === 'email' && selectedTemplateId && candidateProfile) {
        const template = emailTemplates.find(t => t.id === selectedTemplateId);
        // TODO: Allow selecting a specific version, for now, use the first non-archived or just first.
        const version = template?.versions?.filter(v => !v.isArchived)[0] || template?.versions?.[0];
        if (version && candidateProfile) {
          newGeneratedContents.push({
            candidateId,
            candidateName: candidateProfile.name || candidateId,
            isLoading: false,
            subject: version.subject.replace(/{{name}}/gi, candidateProfile.name || 'colleague'),
            body: version.body.replace(/{{name}}/gi, candidateProfile.name || 'colleague'),
          });
        } else {
          newGeneratedContents.push({
              candidateId,
              isLoading: false,
              error: 'Selected template version not found.',
              candidateName: candidateProfile.name || candidateId
            });
        }
      } else if (contentStrategy === 'ai' && candidateProfile) {
        const generatePayload: any = {
          channel: selectedChannel,
          tone: selectedTone,
          outreachProfile: candidateProfile, // Pass the fetched profile
          vars: {}, // Add other dynamic vars if any from UI
          // Assuming 'template' field in generate-outreach means a category.
          // If using AI to personalize a specific template type, derive this:
          template: selectedChannel === 'email' ? 'job_opp' : (selectedChannel === 'slack' ? 'networking_dm' : 'intro_sms'),
        };

        try {
          const response = await fetch('/api/generate-outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(generatePayload),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `Failed to generate content (${response.status})`);
          }
          const data = await response.json();
          newGeneratedContents.push({
            candidateId,
            candidateName: candidateProfile.name || candidateId,
            isLoading: false,
            subject: data.subject,
            body: data.body || data.message,
          });
        } catch (error: any) {
          console.error(`Error generating AI content for ${candidateId}:`, error);
          newGeneratedContents.push({
              candidateId,
              isLoading: false,
              error: error.message || 'Failed to generate AI content',
              candidateName: candidateProfile.name || candidateId
            });
        }
      } else {
         // Should not happen if buttons are disabled correctly, but as a fallback:
         newGeneratedContents.push({
            candidateId,
            isLoading: false,
            error: 'Configuration incomplete for generation.',
            candidateName: candidateProfile?.name || candidateId,
         });
      }
    }
    setGeneratedContents(newGeneratedContents);
    setIsGenerating(false);
  };

  const isGenerateButtonDisabled = () => {
    if (selectedCandidateIds.length === 0 || !selectedChannel || !contentStrategy || isGenerating || isBatchSending) return true;
    if (contentStrategy === 'ai' && !selectedTone) return true;
    if (contentStrategy === 'template' && selectedChannel === 'email' && !selectedTemplateId) return true;
    return false;
  };

  const handleSendAll = async () => {
    if (!selectedChannel || generatedContents.length === 0) return;

    setIsBatchSending(true);
    const initialSendStatuses = generatedContents
      .filter(gc => !gc.error && !gc.isLoading)
      .map(gc => ({ candidateId: gc.candidateId, isSending: true, sendSuccess: undefined, sendError: undefined }));
    setSendStatuses(initialSendStatuses);

    for (const content of generatedContents) {
      if (content.error || content.isLoading) continue; // Skip errored or still loading (shouldn't happen if button logic is correct)

      let contactInfo: CandidateProfile | null = null;
      try {
        // Re-fetch profile to get latest contact details (email, phone)
        // This assumes profile.email and profile.phone are the sources.
        // For Slack, profile needs to contain a slackUserId. This is not in current CandidateProfile.
        // For this example, we'll assume if channel is slack, candidateProfile.id IS the slack user ID for simplicity,
        // or that it might be in a field like candidateProfile.slack_user_id
        const profileResponse = await fetch(`/api/candidate/${content.candidateId}/outreach-profile`);
        if (!profileResponse.ok) {
          const errorData = await profileResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch profile for contact info (${profileResponse.status})`);
        }
        // The API returns the profile directly, not nested under 'profile' key
        contactInfo = await profileResponse.json() as CandidateProfile;
      } catch (error: any) {
        console.error(`Error fetching profile for sending to ${content.candidateId}:`, error);
        setSendStatuses(prev => prev.map(ss =>
            ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Failed to get contact info' } : ss
        ));
        continue;
      }

      if (!contactInfo) { // Should be caught by above, but defensive
        setSendStatuses(prev => prev.map(ss =>
            ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Profile data unavailable.' } : ss
        ));
        continue;
      }

      const sendPayload: any = { candidateId: content.candidateId };
      let sendApiUrl = '';

      if (selectedChannel === 'email') {
        sendApiUrl = '/api/send-email';
        if (!contactInfo.email) {
            setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Email address missing.' } : ss));
            continue;
        }
        sendPayload.to = contactInfo.email;
        sendPayload.subject = content.subject;
        sendPayload.body = content.body;
        // If A/B testing with templates, pass templateVersionId
        if (contentStrategy === 'template' && selectedTemplateId) {
          const template = emailTemplates.find(t => t.id === selectedTemplateId);
          // Assuming first non-archived version is used if not more specific version selection is implemented
          const version = template?.versions?.filter(v => !v.isArchived)[0] || template?.versions?.[0];
          if (version) sendPayload.templateVersionId = version.id;
          else {
            setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Valid template version for A/B tracking not found.' } : ss));
            continue;
          }
        } else {
          // If AI generated, there's no templateVersionId from current modal state for A/B tracking.
          // This might need a different way to categorize/track AI generated emails if A/B testing those.
          // For now, it will send without templateVersionId which is fine if EmailOutreach schema allows it to be optional,
          // OR if send-email API handles it. Current send-email API requires templateVersionId.
          // This indicates a potential mismatch if AI content needs to be sent via /api/send-email.
          // Quick Fix for now: If AI, it shouldn't use /api/send-email designed for templates, or send-email needs adjustment.
          // For now, let's assume AI content is sent with a "default" or "AI-generated" templateVersionId placeholder if required by API.
          // This is a simplification: a real system might have a different send endpoint or method for non-template emails.
           // For now, let's assume we need a templateVersionId to make the call to /api/send-email.
           // This is a flaw in current design if we are sending fully AI generated content via /api/send-email
           // that expects a templateVersionId for A/B tracking.
           // A real solution would be a generic email send API or make templateVersionId truly optional for logging.
           // Given current /api/send-email, this path will fail if contentStrategy is 'ai'.
           // The task implies /api/send-email is used.
           // So, for 'ai' strategy, we must acknowledge this problem.
           // For now, we will only allow 'template' strategy to actually call /api/send-email.
           // This means AI generated emails can't be sent with current /api/send-email.
           // This needs to be addressed in a design review.
           // WORKAROUND: For now, let's assume for 'ai' we still need a template for tracking.
           // This is not ideal. The `send-email` API should be more flexible OR we need a new one.
           // For this exercise, I'll make templateVersionId conditional. The API will fail if it's AI.
           // This will be noted in the report.
           // A better approach for AI would be to have a generic logging in send-email that doesn't require template ID,
           // or a different logging mechanism.
           // For now, we'll assume the user is guided to use 'template' if they want to use /api/send-email for A/B.
           // OR, for 'ai' generated content, we would NOT pass a templateVersionId, and the API would need to handle that.
           // Let's assume the latter and make the templateVersionId in payload conditional.
           // The `/api/send-email` already requires templateVersionId. This means AI generated emails cannot be sent
           // via this specific API route as it's tied to A/B template testing.
           // This is a design constraint we've hit.
           // The subtask asks to use `/api/send-email`.
           // Let's assume if strategy is 'ai', we are just previewing, not sending via this button for email.
           // This is not ideal. Let's proceed with trying to send, and it might fail validation if templateVersionId is missing.
           // Or, the UI should enforce that for email, you *must* pick a template for the send to be tracked.
           // The prompt for generate-outreach does not imply it uses a specific template version for AI.
           // This makes the "Send All" for AI generated emails via /api/send-email problematic.
            if (!sendPayload.templateVersionId && contentStrategy === 'ai') {
                 console.warn("AI content for email cannot be sent via /api/send-email without a templateVersionId for A/B tracking in current setup.");
                 setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'AI Email send not fully supported by send-email A/B tracking.' } : ss));
                 continue;
            }
        }
      } else if (selectedChannel === 'slack') {
        sendApiUrl = '/api/send-slack-message';
        // Assuming candidateProfile.id could be a placeholder for slackUserId if not explicitly available
        const slackUserId = (contactInfo as any).slack_user_id || contactInfo.id; // Example: check for specific field or fallback
        if (!slackUserId) {
            setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Slack User ID missing.' } : ss));
            continue;
        }
        sendPayload.userId = slackUserId;
        sendPayload.message = content.body;
      } else if (selectedChannel === 'sms') {
        sendApiUrl = '/api/send-sms';
        if (!contactInfo.phone) {
            setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Phone number missing.' } : ss));
            continue;
        }
        sendPayload.to = contactInfo.phone;
        sendPayload.body = content.body;
      }

      if (!sendApiUrl) { // Should be caught by earlier checks
          setSendStatuses(prev => prev.map(ss => ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: 'Invalid channel or configuration.' } : ss));
          continue;
      }

      try {
        const response = await fetch(sendApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sendPayload),
        });
        const responseData = await response.json().catch(() => ({ success: false, error: `Non-JSON response from ${sendApiUrl}`}));
        if (!response.ok || !responseData.success) {
          throw new Error(responseData.error || responseData.message || `Failed to send ${selectedChannel}`);
        }
        setSendStatuses(prev => prev.map(ss =>
          ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: true } : ss
        ));
      } catch (error: any) {
        console.error(`Error sending ${selectedChannel} to ${content.candidateId}:`, error);
        setSendStatuses(prev => prev.map(ss =>
          ss.candidateId === content.candidateId ? { ...ss, isSending: false, sendSuccess: false, sendError: error.message } : ss
        ));
      }
    }
    setIsBatchSending(false);
  };

  const isSendAllButtonDisabled = () => {
    if (isBatchSending || isGenerating) return true;
    if (generatedContents.length === 0) return true;
    // Check if any content is still loading or had a generation error
    if (generatedContents.some(gc => gc.isLoading || gc.error)) return true;
    // Check if any content has a pending send status that hasn't completed (either success or error)
    if (generatedContents.some(gc => {
        const status = sendStatuses.find(ss => ss.candidateId === gc.candidateId);
        return status?.isSending; // Disabled if any are currently sending
    })) return true;

    return false;
  };


  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto text-neutral-900 dark:text-neutral-100">
        <h2 className="text-2xl font-semibold mb-4">Outreach Configuration</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">Selected Candidates: {selectedCandidateIds.join(', ')}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">Count: {selectedCandidateIds.length}</p>

        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Select Channel:</h3>
          <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:space-x-2">
            <button
              onClick={() => handleChannelButtonClick('email')}
              className={`${selectedChannel === 'email' ? 'px-3 py-2 m-1 border border-blue-500 bg-blue-500 text-white rounded-md' : 'px-3 py-2 m-1 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
            >
              Email
            </button>
            <button
              onClick={() => handleChannelButtonClick('slack')}
              className={`${selectedChannel === 'slack' ? 'px-3 py-2 m-1 border border-blue-500 bg-blue-500 text-white rounded-md' : 'px-3 py-2 m-1 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
            >
              Slack
            </button>
            <button
              onClick={() => handleChannelButtonClick('sms')}
              className={`${selectedChannel === 'sms' ? 'px-3 py-2 m-1 border border-blue-500 bg-blue-500 text-white rounded-md' : 'px-3 py-2 m-1 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
            >
              SMS
            </button>
          </div>
        </div>

        {selectedChannel && (
          <div className="mb-6 p-4 border-t border-neutral-200 dark:border-neutral-700">
            <h3 className="text-lg font-medium mb-2">Content Strategy for {selectedChannel.toUpperCase()}:</h3>
            <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:space-x-2">
              <button
                onClick={() => setContentStrategy('ai')}
                className={`${contentStrategy === 'ai' ? 'px-3 py-2 m-1 border border-blue-500 bg-blue-500 text-white rounded-md' : 'px-3 py-2 m-1 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
              >
                Generate with AI
              </button>
              {selectedChannel === 'email' && (
                <button
                  onClick={() => setContentStrategy('template')}
                  className={`${contentStrategy === 'template' ? 'px-3 py-2 m-1 border border-blue-500 bg-blue-500 text-white rounded-md' : 'px-3 py-2 m-1 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                >
                  Use Email Template
                </button>
              )}
            </div>
          </div>
        )}

        {contentStrategy === 'ai' && (
          <div className="mb-6 p-4 border-t border-neutral-200 dark:border-neutral-700">
            <h4 className="text-md font-medium mb-2" id="tone-select-label">Select Tone:</h4>
            <select
              value={selectedTone}
              onChange={(e) => setSelectedTone(e.target.value)}
              aria-labelledby="tone-select-label"
              className="w-full p-2 my-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 focus:ring-blue-500 focus:border-blue-500 text-neutral-700 dark:text-neutral-200"
            >
              <option value="neutral">Neutral</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
              <option value="persuasive">Persuasive</option>
            </select>
          </div>
        )}

        {selectedChannel === 'email' && contentStrategy === 'template' && (
          <div className="mb-6 p-4 border-t border-neutral-200 dark:border-neutral-700">
            <h4 className="text-md font-medium mb-2" id="template-select-label">Select Email Template:</h4>
            {isLoadingTemplates ? (
              <p className="text-neutral-600 dark:text-neutral-300">Loading templates...</p>
            ) : emailTemplates.length > 0 ? (
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                aria-labelledby="template-select-label"
                className="w-full p-2 my-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 focus:ring-blue-500 focus:border-blue-500 text-neutral-700 dark:text-neutral-200"
              >
                <option value="" disabled>-- Select a template --</option>
                {emailTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-neutral-600 dark:text-neutral-300">No email templates found or failed to load.</p>
            )}
            {selectedTemplateId && emailTemplates.find(t => t.id === selectedTemplateId)?.versions.filter(v => !v.isArchived).length > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Using first available version of template: {emailTemplates.find(t => t.id === selectedTemplateId)?.versions.filter(v => !v.isArchived)[0]?.subject.substring(0,50)}...
              </p>
            )}
          </div>
        )}

        <div className="my-6 p-4 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={handleGenerateContent}
            disabled={isGenerateButtonDisabled()}
            className={`${isGenerateButtonDisabled() ? 'px-4 py-2 w-full text-sm font-medium rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed' : 'px-4 py-2 w-full text-sm font-medium rounded-md bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white transition-colors'}`}
          >
            {isGenerating ? 'Generating...' : 'Generate & Preview Content'}
          </button>
        </div>

        {generatedContents.length > 0 && (
          <div className="my-6 p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-4">
            <h3 className="text-lg font-medium">Preview:</h3>
            {generatedContents.map((content) => (
              <div key={content.candidateId} className="my-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-700">
                <h4 className="text-md font-semibold mb-2">For: {content.candidateName || content.candidateId}</h4>
                {content.isLoading && <p className="text-neutral-600 dark:text-neutral-300">Loading content...</p>}
                {content.error && <p className="text-red-500 dark:text-red-400">Error: {content.error}</p>}
                {!content.isLoading && !content.error && (
                  <div className="space-y-3">
                    {selectedChannel === 'email' && (
                      <div>
                        <label htmlFor={`subject-${content.candidateId}`} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Subject:</label>
                        <input
                          type="text"
                          id={`subject-${content.candidateId}`}
                          value={content.subject || ''}
                          onChange={(e) => handleContentChange(content.candidateId, 'subject', e.target.value)}
                          disabled={sendStatuses.find(s => s.candidateId === content.candidateId)?.isSending}
                          className="w-full p-2 my-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-600 focus:ring-blue-500 focus:border-blue-500 text-neutral-700 dark:text-neutral-200 disabled:bg-neutral-100 dark:disabled:bg-neutral-500"
                        />
                      </div>
                    )}
                    <div>
                      <label htmlFor={`body-${content.candidateId}`} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{selectedChannel === 'email' ? 'Body:' : 'Message:'}</label>
                      <textarea
                        id={`body-${content.candidateId}`}
                        value={content.body || ''}
                        rows={selectedChannel === 'email' ? 7 : 4}
                        onChange={(e) => handleContentChange(content.candidateId, 'body', e.target.value)}
                        disabled={sendStatuses.find(s => s.candidateId === content.candidateId)?.isSending}
                        className="w-full p-2 my-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-600 focus:ring-blue-500 focus:border-blue-500 text-neutral-700 dark:text-neutral-200 resize-y disabled:bg-neutral-100 dark:disabled:bg-neutral-500"
                      />
                    </div>
                  </div>
                )}
                {/* Display Send Status for this item */}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.isSending) &&
                  <p className="mt-2 text-sm font-semibold text-blue-600 dark:text-blue-400">Sending...</p>}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.sendSuccess === true) &&
                  <p className="mt-2 text-sm font-semibold text-green-600 dark:text-green-400">Sent successfully!</p>}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.sendSuccess === false) &&
                  <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">Send failed: {sendStatuses.find(ss => ss.candidateId === content.candidateId)?.sendError}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-600 hover:bg-neutral-700 text-white dark:bg-neutral-500 dark:hover:bg-neutral-600 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSendAll}
            disabled={isSendAllButtonDisabled()}
            className={`${isSendAllButtonDisabled() ? 'px-4 py-2 text-sm font-medium rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed' : 'px-4 py-2 text-sm font-medium rounded-md bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white transition-colors'}`}
          >
            {isBatchSending ? 'Sending...' : `Send All (${generatedContents.filter(gc => !gc.isLoading && !gc.error && !(sendStatuses.find(ss => ss.candidateId === gc.candidateId)?.sendSuccess)).length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutreachModal;
