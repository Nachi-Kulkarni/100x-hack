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
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>Outreach Configuration</h2>
        <p>Selected Candidates: {selectedCandidateIds.join(', ')}</p>
        <p>Count: {selectedCandidateIds.length}</p>

        <div>
          <h3>Select Channel:</h3>
          <button
            onClick={() => handleChannelButtonClick('email')}
            style={selectedChannel === 'email' ? styles.activeButton : styles.button}
          >
            Email
          </button>
          <button
            onClick={() => handleChannelButtonClick('slack')}
            style={selectedChannel === 'slack' ? styles.activeButton : styles.button}
          >
            Slack
          </button>
          <button
            onClick={() => handleChannelButtonClick('sms')}
            style={selectedChannel === 'sms' ? styles.activeButton : styles.button}
          >
            SMS
          </button>
        </div>

        {selectedChannel && (
          <div style={styles.section}>
            <h3>Content Strategy for {selectedChannel.toUpperCase()}:</h3>
            <button
              onClick={() => setContentStrategy('ai')}
              style={contentStrategy === 'ai' ? styles.activeButton : styles.button}
            >
              Generate with AI
            </button>
            {selectedChannel === 'email' && (
              <button
                onClick={() => setContentStrategy('template')}
                style={contentStrategy === 'template' ? styles.activeButton : styles.button}
              >
                Use Email Template
              </button>
            )}
          </div>
        )}

        {contentStrategy === 'ai' && (
          <div style={styles.section}>
            <h4>Select Tone:</h4>
            <select
              value={selectedTone}
              onChange={(e) => setSelectedTone(e.target.value)}
              style={styles.select}
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
          <div style={styles.section}>
            <h4>Select Email Template:</h4>
            {isLoadingTemplates ? (
              <p>Loading templates...</p>
            ) : emailTemplates.length > 0 ? (
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>-- Select a template --</option>
                {emailTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            ) : (
              <p>No email templates found or failed to load.</p>
            )}
            {/* TODO: Better version selection UI - for now, using first non-archived version */}
            {selectedTemplateId && emailTemplates.find(t => t.id === selectedTemplateId)?.versions.filter(v => !v.isArchived).length > 0 && (
              <p style={{fontSize: '0.8em', color: '#555'}}>
                Using first available version of template: {emailTemplates.find(t => t.id === selectedTemplateId)?.versions.filter(v => !v.isArchived)[0]?.subject.substring(0,50)}...
              </p>
            )}
          </div>
        )}

        <div style={styles.section}>
          <button
            onClick={handleGenerateContent}
            disabled={isGenerateButtonDisabled()}
            style={isGenerateButtonDisabled() ? styles.disabledButton : styles.actionButton}
          >
            {isGenerating ? 'Generating...' : 'Generate & Preview Content'}
          </button>
        </div>

        {generatedContents.length > 0 && (
          <div style={styles.section}>
            <h3>Preview:</h3>
            {generatedContents.map((content, index) => (
              <div key={content.candidateId} style={styles.previewItem}>
                <h4>For: {content.candidateName || content.candidateId}</h4>
                {content.isLoading && <p>Loading content...</p>}
                {content.error && <p style={{color: 'red'}}>Error: {content.error}</p>}
                {!content.isLoading && !content.error && (
                  <>
                    {selectedChannel === 'email' && (
                      <div style={{marginBottom: '5px'}}>
                        <strong>Subject:</strong>
                        <input
                          type="text"
                          value={content.subject || ''}
                          style={styles.inputField}
                          onChange={(e) => handleContentChange(content.candidateId, 'subject', e.target.value)}
                          disabled={sendStatuses.find(s => s.candidateId === content.candidateId)?.isSending}
                        />
                      </div>
                    )}
                    <div>
                      <strong>{selectedChannel === 'email' ? 'Body:' : 'Message:'}</strong>
                      <textarea
                        value={content.body || ''}
                        rows={selectedChannel === 'email' ? 7 : 4}
                        style={styles.textareaField}
                        onChange={(e) => handleContentChange(content.candidateId, 'body', e.target.value)}
                        disabled={sendStatuses.find(s => s.candidateId === content.candidateId)?.isSending}
                      />
                    </div>
                  </>
                )}
                {/* Display Send Status for this item */}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.isSending) &&
                  <p style={{color: styles.actionButton.backgroundColor, fontWeight: 'bold'}}>Sending...</p>}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.sendSuccess === true) &&
                  <p style={{color: 'green', fontWeight: 'bold'}}>Sent successfully!</p>}
                {sendStatuses.find(ss => ss.candidateId === content.candidateId && ss.sendSuccess === false) &&
                  <p style={{color: 'red', fontWeight: 'bold'}}>Send failed: {sendStatuses.find(ss => ss.candidateId === content.candidateId)?.sendError}</p>}
              </div>
            ))}
          </div>
        )}

        <div style={{marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'space-between'}}>
          <button onClick={onClose} style={{...styles.button, backgroundColor: '#6c757d', color: 'white'}}>Close</button>
          <button
            onClick={handleSendAll}
            style={isSendAllButtonDisabled() ? styles.disabledButton : styles.actionButton}
            disabled={isSendAllButtonDisabled()}
          >
            {isBatchSending ? 'Sending...' : `Send All (${generatedContents.filter(gc => !gc.isLoading && !gc.error).length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

// Basic styling (can be improved later)
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    minWidth: '500px', // Increased minWidth
    maxWidth: '60%',  // Adjusted maxWidth
    maxHeight: '90vh', // Added maxHeight
    overflowY: 'auto', // Added for scrollability
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
  },
  section: { // Added style for sections
    marginTop: '15px',
    paddingTop: '10px',
    borderTop: '1px solid #f0f0f0'
  },
  button: {
    padding: '8px 12px',
    margin: '0 5px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  activeButton: {
    padding: '8px 12px',
    margin: '0 5px',
    cursor: 'pointer',
    border: '1px solid #007bff',
    backgroundColor: '#007bff',
    color: 'white',
    borderRadius: '4px',
  },
  closeButton: {
    marginTop: '20px',
    padding: '10px 15px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  actionButton: { // Style for primary actions like Generate/Send
    padding: '10px 15px',
    margin: '0 5px',
    cursor: 'pointer',
    border: '1px solid #007bff',
    backgroundColor: '#007bff',
    color: 'white',
    borderRadius: '4px',
  },
  disabledButton: { // Style for disabled buttons
    padding: '10px 15px',
    margin: '0 5px',
    cursor: 'not-allowed',
    border: '1px solid #ccc',
    backgroundColor: '#e9ecef',
    color: '#6c757d',
    borderRadius: '4px',
  },
  select: {
    width: '100%',
    padding: '8px',
    margin: '5px 0 15px 0',
    borderRadius: '4px',
    border: '1px solid #ccc',
    boxSizing: 'border-box'
  },
  previewItem: {
    marginBottom: '15px',
    padding: '10px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    backgroundColor: '#f9f9f9',
  },
  inputField: { // Style for editable subject
    width: 'calc(100% - 16px)', // Adjust for padding
    padding: '8px',
    margin: '5px 0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  textareaField: { // Style for editable body/message
    width: 'calc(100% - 16px)', // Adjust for padding
    padding: '8px',
    margin: '5px 0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box',
    minHeight: '80px',
  }
};

export default OutreachModal;
