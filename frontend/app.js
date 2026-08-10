/**
 * High-Performance, Zero-Latency Vanilla JS Chat Architecture
 * Decoupled, Predictive, & Invisible UX
 */

class SSEManager {
  constructor(onToken, onDone, onError, onStatusChange) {
    this.onToken = onToken;
    this.onDone = onDone;
    this.onError = onError;
    this.onStatusChange = onStatusChange;
    this.eventSource = null;
    this.activeTaskId = null;
    this.lastOffset = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(taskId, offset = 0) {
    this.close();
    this.activeTaskId = taskId;
    this.lastOffset = offset;

    const url = `/api/chat/stream/${encodeURIComponent(taskId)}?offset=${this.lastOffset}`;
    this.eventSource = new EventSource(url);

    this.ifStatus('connecting');

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.ifStatus('connected');
    };

    this.eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.t === 'token') {
          this.lastOffset = data.o;
          this.onToken(data.d, data.o);
        } else if (data.t === 'done') {
          this.close();
          this.ifStatus('connected');
          this.onDone(data);
        }
      } catch (err) {
        console.warn('Malformed SSE data:', err);
      }
    };

    this.eventSource.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        this.close();
        this.ifStatus('connected');
        this.onDone(data);
      } catch (err) {
        this.close();
        this.onDone({ status: 'completed' });
      }
    });

    this.eventSource.onerror = (err) => {
      this.close();
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.ifStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 5000);
        setTimeout(() => {
          if (this.activeTaskId === taskId) {
            this.connect(taskId, this.lastOffset);
          }
        }, delay);
      } else {
        this.ifStatus('offline');
        this.onError('Connection interrupted. Tap to retry.');
      }
    };
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  ifStatus(status) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status);
    }
  }
}

class UIManager {
  constructor() {
    this.chatContainer = document.getElementById('chat-container');
    this.userInput = document.getElementById('user-input');
    this.sendBtn = document.getElementById('send-btn');
    this.statusDot = document.getElementById('status-dot');
    this.activeAiBubble = null;

    this.setupInputEvents();
  }

  setupInputEvents() {
    // Expandable textarea
    this.userInput.addEventListener('input', () => {
      this.userInput.style.height = 'auto';
      this.userInput.style.height = Math.min(this.userInput.scrollHeight, 160) + 'px';
      
      const hasText = this.userInput.value.trim().length > 0;
      this.sendBtn.classList.toggle('active', hasText);
    });

    // Enter key submits (Shift+Enter for newline)
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.userInput.value.trim().length > 0) {
          this.sendBtn.click();
        }
      }
    });
  }

  addUserMessage(text) {
    const group = document.createElement('div');
    group.className = 'msg-group';
    
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble msg-user';
    bubble.textContent = text;

    group.appendChild(bubble);
    this.chatContainer.appendChild(group);
    this.scrollToBottom(true);
  }

  createAiMessageBubble() {
    const group = document.createElement('div');
    group.className = 'msg-group';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble msg-ai pulse-cursor';
    bubble.textContent = '';

    group.appendChild(bubble);
    this.chatContainer.appendChild(group);
    this.activeAiBubble = bubble;
    this.scrollToBottom(true);
    return bubble;
  }

  appendTokenToAiBubble(bubble, text) {
    if (!bubble) return;
    bubble.textContent += text;
    this.scrollToBottom(false);
  }

  setAiBubbleFullText(bubble, fullText) {
    if (!bubble) return;
    bubble.textContent = fullText;
    this.scrollToBottom(false);
  }

  finalizeAiBubble(bubble) {
    if (bubble) {
      bubble.classList.remove('pulse-cursor');
    }
    this.activeAiBubble = null;
  }

  scrollToBottom(force = false) {
    if (!this.chatContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = this.chatContainer;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

    if (force || isNearBottom) {
      this.chatContainer.scrollTo({
        top: scrollHeight,
        behavior: force ? 'instant' : 'smooth'
      });
    }
  }

  clearInput() {
    this.userInput.value = '';
    this.userInput.style.height = 'auto';
    this.sendBtn.classList.remove('active');
  }

  updateConnectionStatus(status) {
    if (!this.statusDot) return;
    this.statusDot.className = 'status-dot';
    if (status === 'reconnecting') {
      this.statusDot.classList.add('reconnecting');
    } else if (status === 'offline') {
      this.statusDot.classList.add('offline');
    }
  }
}

class VisibilityObserver {
  constructor(onForegroundSync) {
    this.onForegroundSync = onForegroundSync;
    this.setupListener();
  }

  setupListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onForegroundSync();
      }
    });

    window.addEventListener('online', () => this.onForegroundSync());
  }
}

class ChatController {
  constructor() {
    this.ui = new UIManager();
    this.currentTaskId = null;
    this.currentAiBubble = null;
    this.tokenOffset = 0;

    this.sse = new SSEManager(
      (token, offset) => this.handleToken(token, offset),
      (donePayload) => this.handleDone(donePayload),
      (errMsg) => this.handleError(errMsg),
      (status) => this.ui.updateConnectionStatus(status)
    );

    this.visibilityObserver = new VisibilityObserver(() => this.handleForegroundReconcile());

    this.setupSendHandler();
  }

  setupSendHandler() {
    this.ui.sendBtn.addEventListener('click', () => {
      const prompt = this.ui.userInput.value.trim();
      if (!prompt) return;

      this.ui.clearInput();
      this.sendPrompt(prompt);
    });
  }

  async sendPrompt(prompt) {
    this.ui.addUserMessage(prompt);
    this.currentAiBubble = this.ui.createAiMessageBubble();
    this.tokenOffset = 0;

    try {
      // 1. Instant Decoupled Send (<10ms TTFB)
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!res.ok) throw new Error('Failed to send message');
      const data = await res.json();
      
      this.currentTaskId = data.task_id;

      // 2. Connect SSE for real-time token stream
      this.sse.connect(this.currentTaskId, 0);
    } catch (err) {
      console.error('Send error:', err);
      if (this.currentAiBubble) {
        this.currentAiBubble.textContent = 'Failed to connect to server. Please check your connection.';
        this.ui.finalizeAiBubble(this.currentAiBubble);
      }
    }
  }

  handleToken(token, offset) {
    if (!this.currentAiBubble) return;
    this.tokenOffset = offset;
    this.ui.appendTokenToAiBubble(this.currentAiBubble, token);
  }

  handleDone(donePayload) {
    if (this.currentAiBubble) {
      this.ui.finalizeAiBubble(this.currentAiBubble);
    }
    this.currentTaskId = null;
  }

  handleError(errMsg) {
    if (this.currentAiBubble && !this.currentAiBubble.textContent) {
      this.currentAiBubble.textContent = errMsg;
      this.ui.finalizeAiBubble(this.currentAiBubble);
    }
  }

  async handleForegroundReconcile() {
    if (!this.currentTaskId || !this.currentAiBubble) return;

    try {
      // Predictive Pre-fetch check upon return from background
      const res = await fetch(`/api/chat/preview/${encodeURIComponent(this.currentTaskId)}`);
      if (!res.ok) return;

      const data = await res.json();
      if (!data || data.status === 'not_found') return;

      if (data.full_text) {
        this.ui.setAiBubbleFullText(this.currentAiBubble, data.full_text);
        this.tokenOffset = data.token_count || this.tokenOffset;
      }

      if (data.status === 'completed' || data.status === 'failed') {
        this.ui.finalizeAiBubble(this.currentAiBubble);
        this.currentTaskId = null;
        this.sse.close();
      } else if (data.status === 'generating') {
        // Resume stream from current token offset
        this.sse.connect(this.currentTaskId, this.tokenOffset);
      }
    } catch (err) {
      console.warn('Foreground reconcile check failed:', err);
    }
  }
}

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.chatApp = new ChatController();
});
