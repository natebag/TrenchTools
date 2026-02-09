/**
 * Browser stub for Node.js 'events' module
 * Minimal EventEmitter implementation
 */

type Listener = (...args: any[]) => void;

export class EventEmitter {
  private events: Map<string | symbol, Listener[]> = new Map();

  on(event: string | symbol, listener: Listener): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  off(event: string | symbol, listener: Listener): this {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  once(event: string | symbol, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    return this.on(event, wrapper);
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const listeners = this.events.get(event);
    if (listeners && listeners.length > 0) {
      listeners.forEach(listener => listener.apply(this, args));
      return true;
    }
    return false;
  }

  addListener(event: string | symbol, listener: Listener): this {
    return this.on(event, listener);
  }

  removeListener(event: string | symbol, listener: Listener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listeners(event: string | symbol): Listener[] {
    return this.events.get(event) || [];
  }

  listenerCount(event: string | symbol): number {
    return this.listeners(event).length;
  }

  setMaxListeners(_n: number): this {
    // No-op in browser
    return this;
  }

  getMaxListeners(): number {
    return 10; // Default
  }

  eventNames(): (string | symbol)[] {
    return Array.from(this.events.keys());
  }

  prependListener(event: string | symbol, listener: Listener): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.unshift(listener);
    return this;
  }

  prependOnceListener(event: string | symbol, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    return this.prependListener(event, wrapper);
  }
}

export default EventEmitter;
