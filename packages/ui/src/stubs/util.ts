/**
 * Browser stub for Node.js 'util' module
 * Provides minimal compatibility for Solana libs
 */

// debuglog returns a no-op function in browser
export function debuglog(_section: string): (...args: any[]) => void {
  return () => {};
}

// inspect just converts to string in browser
export function inspect(obj: any, _options?: any): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// promisify stub
export function promisify<T extends (...args: any[]) => any>(fn: T): (...args: any[]) => Promise<any> {
  return (...args: any[]) => {
    return new Promise((resolve, reject) => {
      fn(...args, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };
}

// TextEncoder/Decoder are available in browser
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

// format stub (simplified printf-style)
export function format(fmt: string, ...args: any[]): string {
  let i = 0;
  return fmt.replace(/%[sdjoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (i >= args.length) return match;
    const arg = args[i++];
    switch (match) {
      case '%s': return String(arg);
      case '%d': return Number(arg).toString();
      case '%j': return JSON.stringify(arg);
      case '%o':
      case '%O': return inspect(arg);
      default: return match;
    }
  });
}

// inherits stub
export function inherits(ctor: any, superCtor: any): void {
  if (superCtor) {
    ctor.super_ = superCtor;
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  }
}

// deprecate stub - just returns the function
export function deprecate<T extends (...args: any[]) => any>(fn: T, _msg: string): T {
  return fn;
}

// isDeepStrictEqual stub
export function isDeepStrictEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// types namespace
export const types = {
  isArrayBuffer: (val: any): val is ArrayBuffer => val instanceof ArrayBuffer,
  isTypedArray: (val: any): boolean => ArrayBuffer.isView(val) && !(val instanceof DataView),
  isUint8Array: (val: any): val is Uint8Array => val instanceof Uint8Array,
};

export default {
  debuglog,
  inspect,
  promisify,
  format,
  inherits,
  deprecate,
  isDeepStrictEqual,
  TextEncoder,
  TextDecoder,
  types,
};
