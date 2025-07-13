document.addEventListener('DOMContentLoaded', function() {
    // DOM
    const chatContainer = document.getElementById('chat-container');
    const promptInput = document.getElementById('prompt');
    const submitBtn = document.getElementById('submit');
    const uploadBtn = document.getElementById('upload-btn');
    const fileUpload = document.getElementById('file-upload');
    const voiceBtn = document.getElementById('voice-btn');
    const newChatBtn = document.getElementById('new-chat');

    // State
    let isRecording = false;
    let recognition;
    let currentFile = null;
    let currentChatId = getCurrentChatId();
    let chats = loadAllChats();
    let abortController = new AbortController();

    // Init
    initializeChat();
    setupEvents();

    function initializeChat() {
        if (!chats[currentChatId]) {
            chats[currentChatId] = {
                id: currentChatId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [{
                    sender: 'ai',
                    text: "Hello! I'm PDB AI, your advanced assistant. How can I help you today?",
                    timestamp: new Date().toISOString()
                }]
            };
            saveAllChats();
        }
        renderChat(currentChatId);
    }

    function setupEvents() {
        submitBtn.addEventListener('click', sendMessage);
        promptInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        uploadBtn.addEventListener('click', () => fileUpload.click());
        fileUpload.addEventListener('change', handleFileUpload);
        voiceBtn.addEventListener('click', toggleVoiceRecording);
        newChatBtn.addEventListener('click', startNewChat);
        document.addEventListener('click', handleCopyClick);
    }

    async function sendMessage() {
        const text = promptInput.value.trim();
        if (!text && !currentFile) return;

        abortController.abort();
        abortController = new AbortController();

        // Add user message
        const userMsg = {
            sender: 'user',
            text,
            file: currentFile,
            timestamp: new Date().toISOString()
        };
        addMessage(userMsg);

        promptInput.value = '';
        currentFile = null;
        uploadBtn.classList.remove('active');

        // Typing indicator
        const typingId = showTypingIndicator();

        try {
            const responseText = await getAIResponse(chats[currentChatId].messages);
            removeTypingIndicator(typingId);

            const aiMsg = {
                sender: 'ai',
                text: responseText,
                timestamp: new Date().toISOString()
            };
            addMessage(aiMsg);
        } catch (err) {
            removeTypingIndicator(typingId);
            console.error("API error:", err);
            addMessage({
                sender: 'ai',
                text: "Sorry, I encountered an error. Please try again.",
                timestamp: new Date().toISOString()
            });
        }
    }

    async function getAIResponse(messages) {
        // Combine conversation history
        const prompt = messages.map(m => `${m.sender}: ${m.text}`).join('\n');

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { parts: [{ text: prompt }] }
                ]
            }),
            signal: abortController.signal
        });

        if (!res.ok) throw new Error(`API failed: ${res.status}`);
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }

    function addMessage(msg) {
        chats[currentChatId].messages.push(msg);
        chats[currentChatId].updatedAt = new Date().toISOString();
        saveAllChats();
        renderMessage(msg);
    }

    function renderChat(id) {
        chatContainer.innerHTML = '';
        (chats[id]?.messages || []).forEach(renderMessage);
    }

    function renderMessage(msg) {
        const div = document.createElement('div');
        div.className = `message ${msg.sender}-message`;

        const avatar = document.createElement('img');
        avatar.className = 'avatar';
        avatar.src = msg.sender === 'user' ? 'user-avatar.png' : 'ai-avatar.png';
        avatar.alt = `${msg.sender} avatar`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (msg.text) contentDiv.innerHTML = formatText(msg.text);

        if (msg.file) {
            if (msg.file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.className = 'message-image';
                img.src = msg.file.url;
                contentDiv.appendChild(img);
            } else {
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                fileInfo.innerHTML = `<p><i class="fas fa-file"></i> ${msg.file.name}</p>
                                      <small>${formatSize(msg.file.size)}</small>`;
                contentDiv.appendChild(fileInfo);
            }
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = formatTime(msg.timestamp);
        contentDiv.appendChild(timeDiv);

        div.appendChild(avatar);
        div.appendChild(contentDiv);
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showTypingIndicator() {
        const id = `typing-${Date.now()}`;
        chatContainer.insertAdjacentHTML('beforeend', `
            <div class="message ai-message" id="${id}">
                <img src="ai-avatar.png" class="avatar" alt="AI avatar">
                <div class="message-content typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>`);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return id;
    }

    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        currentFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            url: URL.createObjectURL(file)
        };
        uploadBtn.classList.add('active');
    }

    function formatText(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\*(.*?)\*/g, '<em>$1</em>')
                   .replace(/```([\s\S]*?)```/g, '<div class="code-block">$1<button class="copy-btn">Copy</button></div>')
                   .replace(/\n/g, '<br>');
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function toggleVoiceRecording() {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Voice input not supported in your browser");
            return;
        }
        if (isRecording) {
            stopRecording();
            voiceBtn.classList.remove('active');
        } else {
            startRecording();
            voiceBtn.classList.add('active');
        }
    }

    function startRecording() {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onstart = () => isRecording = true;
        recognition.onresult = e => promptInput.value = e.results[0][0].transcript;
        recognition.onerror = e => {
            console.error("Voice error:", e.error);
            isRecording = false;
            voiceBtn.classList.remove('active');
        };
        recognition.onend = () => {
            isRecording = false;
            voiceBtn.classList.remove('active');
        };
        recognition.start();
    }

    function stopRecording() {
        if (recognition) recognition.stop();
        isRecording = false;
    }

    function startNewChat() {
        currentChatId = 'chat-' + Date.now();
        chats[currentChatId] = {
            id: currentChatId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [{
                sender: 'ai',
                text: "Hello! I'm PDB AI, your advanced assistant. How can I help you today?",
                timestamp: new Date().toISOString()
            }]
        };
        saveAllChats();
        renderChat(currentChatId);
        resetInput();
    }

    function resetInput() {
        if (isRecording) stopRecording();
        promptInput.value = '';
        currentFile = null;
        uploadBtn.classList.remove('active');
        abortController.abort();
        abortController = new AbortController();
    }

    function getCurrentChatId() {
        let id = localStorage.getItem('currentChatId');
        if (!id) {
            id = 'chat-' + Date.now();
            localStorage.setItem('currentChatId', id);
        }
        return id;
    }
     const API_KEY = "AIzaSyD1zLT-rvpMfDn9Vjz3X40zgsbLO6DEIBI";
     const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY;


    function loadAllChats() {
        const data = localStorage.getItem('pdb-ai-chats');
        return data ? JSON.parse(data) : {};
    }

    function saveAllChats() {
        localStorage.setItem('pdb-ai-chats', JSON.stringify(chats));
        localStorage.setItem('currentChatId', currentChatId);
    }

    function handleCopyClick(e) {
        if (e.target.classList.contains('copy-btn')) {
            const code = e.target.parentElement.textContent.replace('Copy', '').trim();
            navigator.clipboard.writeText(code)
                .then(() => {
                    e.target.textContent = 'Copied!';
                    setTimeout(() => e.target.textContent = 'Copy', 2000);
                })
                .catch(err => {
                    console.error("Copy failed:", err);
                    e.target.textContent = 'Error';
                });
        }
    }
});
