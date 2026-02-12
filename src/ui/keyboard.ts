import { EventEmitter } from 'events';
import { getConfig } from '../config/index.js';

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export type KeyHandler = (key: KeyEvent) => void | Promise<void>;

/**
 * Keyboard input handler for interactive modes
 */
export class KeyboardHandler extends EventEmitter {
  private handlers: Map<string, KeyHandler> = new Map();
  private isListening = false;

  constructor() {
    super();
  }

  /**
   * Start listening for keyboard input
   */
  start(): void {
    if (this.isListening) return;

    // Enable raw mode for character-by-character input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', this.handleInput.bind(this));
    this.isListening = true;
  }

  /**
   * Stop listening for keyboard input
   */
  stop(): void {
    if (!this.isListening) return;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('data');
    this.isListening = false;
  }

  /**
   * Register a key handler
   */
  on(key: string, handler: KeyHandler): this {
    this.handlers.set(key.toLowerCase(), handler);
    return this;
  }

  /**
   * Remove a key handler
   */
  off(key: string): this {
    this.handlers.delete(key.toLowerCase());
    return this;
  }

  /**
   * Handle raw input
   */
  private handleInput(data: string): void {
    const key = this.parseKey(data);
    this.emit('key', key);

    // Check for specific handlers
    const keyName = this.getKeyName(key);
    const handler = this.handlers.get(keyName);

    if (handler) {
      handler(key);
    }

    // Always emit the raw key name
    this.emit(keyName, key);
  }

  /**
   * Parse raw input into a KeyEvent
   */
  private parseKey(data: string): KeyEvent {
    const key: KeyEvent = {
      name: '',
      ctrl: false,
      meta: false,
      shift: false,
      sequence: data,
    };

    // Handle special sequences
    if (data === '\x03') {
      key.name = 'c';
      key.ctrl = true;
    } else if (data === '\x1B') {
      key.name = 'escape';
    } else if (data === '\r' || data === '\n') {
      key.name = 'return';
    } else if (data === '\t') {
      key.name = 'tab';
    } else if (data === '\x7F') {
      key.name = 'backspace';
    } else if (data === ' ') {
      key.name = 'space';
    } else if (data === '\x1B[A') {
      key.name = 'up';
    } else if (data === '\x1B[B') {
      key.name = 'down';
    } else if (data === '\x1B[C') {
      key.name = 'right';
    } else if (data === '\x1B[D') {
      key.name = 'left';
    } else if (data === '\x1B[Z') {
      key.name = 'tab';
      key.shift = true;
    } else if (data.length === 1) {
      key.name = data.toLowerCase();
      key.shift = data !== data.toLowerCase();

      // Check for ctrl+letter
      const code = data.charCodeAt(0);
      if (code >= 1 && code <= 26) {
        key.ctrl = true;
        key.name = String.fromCharCode(code + 96);
      }
    } else {
      key.name = data;
    }

    return key;
  }

  /**
   * Get a normalized key name for handler lookup
   */
  private getKeyName(key: KeyEvent): string {
    let name = '';

    if (key.ctrl) name += 'ctrl+';
    if (key.meta) name += 'meta+';
    if (key.shift) name += 'shift+';

    name += key.name;

    return name.toLowerCase();
  }
}

/**
 * Create shortcuts help text from config
 */
export const getShortcutsHelp = (): Array<{ key: string; action: string }> => {
  const shortcuts = getConfig().shortcuts;

  return [
    { key: shortcuts.quit, action: 'Quit' },
    { key: shortcuts.help, action: 'Help' },
    { key: shortcuts.refresh, action: 'Refresh' },
    { key: shortcuts.copy, action: 'Copy to clipboard' },
    { key: shortcuts.create, action: 'Create/Select' },
    { key: shortcuts.back, action: 'Back' },
    { key: '↑/↓', action: 'Navigate' },
    { key: shortcuts.nextProject, action: 'Next project' },
  ];
};

// Export singleton
export const keyboard = new KeyboardHandler();
