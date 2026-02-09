// Polyfills for Node.js modules in browser
import { Buffer } from 'buffer'
import process from 'process'
import events from 'events'

// Make Buffer available globally before anything else
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).process = process;
  (window as any).EventEmitter = events.EventEmitter;
}

// Ensure global is defined
if (typeof global === 'undefined') {
  ;(window as any).global = window
}

export {}
