// Debugging: Confirm script loads
console.log('script.js loaded!');

// Generate a unique session ID for this user session
const sessionId = localStorage.getItem('sessionId') || crypto.randomUUID();
localStorage.setItem('sessionId', sessionId);

const workerBaseUrl = 'https://cf-ai-security-analyzer-worker.prajw81020.workers.dev';

const urlInput = document.getElementById('urlInput');
const analyzeButton = document.getElementById('analyzeButton');
const reportContent = document.getElementById('reportContent');
const noReportMessage = document.getElementById('noReportMessage');
const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
const chatButton = document.getElementById('chatButton');

async function callWorker(endpoint, method, body) {
    console.log(`[callWorker] Calling endpoint: ${endpoint} with method: ${method}`);
    const headers = {
        'X-Session-ID': sessionId,
        'Content-Type': 'application/json',
    };

    const options = {
        method: method,
        headers: headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    return fetch(`${workerBaseUrl}${endpoint}`, options);
}

async function analyzeUrl() {
    console.log('[analyzeUrl] Function started.');
    const url = urlInput.value.trim();
    if (!url) {
        console.log('[analyzeUrl] URL input is empty.');
        alert('Please enter a URL to analyze.');
        return;
    }

    reportContent.textContent = 'Analyzing...';
    noReportMessage.style.display = 'none';
    chatHistory.innerHTML = ''; // Clear chat history on new analysis

    try {
        console.log('[analyzeUrl] Calling callWorker for /analyze.');
        const response = await callWorker('/analyze', 'POST', { targetUrl: url });
        console.log('[analyzeUrl] Response from callWorker:', response);
        if (response.ok) {
            const report = await response.text();
            reportContent.textContent = report;
            // Add initial analysis to chat history as AI response
        } else {
            const errorText = await response.text();
            reportContent.textContent = `Error: ${errorText}`;
            addMessageToChat('ai', `Error during analysis: ${errorText}`);
        }
    } catch (error) {
        console.error('[analyzeUrl] Caught error during analysis:', error);
        reportContent.textContent = `Network error: ${error.message}`;
        addMessageToChat('ai', `Network error during analysis: ${error.message}`);
    }
}

async function sendChatMessage() {
    console.log('[sendChatMessage] Function started.');
    const question = chatInput.value.trim();
    if (!question) {
        return;
    }

    addMessageToChat('user', question);
    chatInput.value = '';

    // Add a loading indicator
    const loadingMessage = addMessageToChat('ai', 'AI is thinking...', true);

    try {
        console.log('[sendChatMessage] Calling callWorker for /chat.');
        const response = await callWorker('/chat', 'POST', { question: question });
        console.log('[sendChatMessage] Response from callWorker:', response);
        if (response.ok) {
            const answer = await response.text();
            updateLoadingMessage(loadingMessage, answer);
        } else {
            const errorText = await response.text();
            updateLoadingMessage(loadingMessage, `Error: ${errorText}`);
        }
    } catch (error) {
        console.error('[sendChatMessage] Caught error during chat:', error);
        updateLoadingMessage(loadingMessage, `Network error: ${error.message}`);
    }
}

function addMessageToChat(sender, message, isLoading = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', sender);
    messageDiv.textContent = message;
    if (isLoading) {
        messageDiv.classList.add('loading-indicator');
    }
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
    return messageDiv;
}

function updateLoadingMessage(messageDiv, newContent) {
    messageDiv.textContent = newContent;
    messageDiv.classList.remove('loading-indicator');
    chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
}

analyzeButton.addEventListener('click', () => {
    console.log('[Event Listener] Analyze button clicked!');
    analyzeUrl();
});
chatButton.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
});

// Optionally, load existing session data when the page loads
async function loadSessionData() {
    console.log('[loadSessionData] Attempting to load session data.');
    try {
        console.log('[loadSessionData] Calling callWorker for /getSessionData.');
        const response = await callWorker('/getSessionData', 'GET');
        console.log('[loadSessionData] Response from callWorker (getSessionData):', response);
        if (response.ok) {
            const sessionData = await response.json();
            if (sessionData.analysisReport) {
                reportContent.textContent = sessionData.analysisReport;
                noReportMessage.style.display = 'none';
            }
            if (sessionData.chatHistory && sessionData.chatHistory.length > 0) {
                sessionData.chatHistory.forEach((msg) => {
                    addMessageToChat(msg.role, msg.content);
                });
            }
        } else {
            console.error('Failed to load session data:', await response.text());
        }
    } catch (error) {
        console.error('Network error loading session data:', error);
    }
}

loadSessionData();