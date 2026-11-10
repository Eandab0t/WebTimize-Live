'use strict';

// Minimal Chrome DevTools Protocol client with no dependencies: Node 24 ships a global WebSocket.
// Only the pieces the browser experiments need are implemented.

const http = require('node:http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`${url} -> HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`${url} returned invalid JSON: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error(`${url} timed out`)));
  });
}

async function waitFor(fn, { timeout = 20000, interval = 250, label = 'condition' } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

class CDP {
  static async connect(wsUrl) {
    const client = new CDP(wsUrl);
    await client.opened;
    return client;
  }

  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', (event) => reject(new Error(`WebSocket error: ${event.message || 'unknown'}`)), { once: true });
    });
    this.ws.addEventListener('message', (event) => this.#receive(event));
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  #receive(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (code ${message.error.code})`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    const handlers = this.listeners.get(message.method);
    if (handlers) {
      for (const handler of handlers) handler(message.params, message.sessionId);
    }
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
    return () => {
      const handlers = this.listeners.get(method) || [];
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  }

  send(method, params = {}, sessionId = undefined, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP connection is closed'));
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeout} ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      try { this.ws.close(); } catch { /* already gone */ }
    }
  }
}

module.exports = { CDP, getJson, waitFor };
