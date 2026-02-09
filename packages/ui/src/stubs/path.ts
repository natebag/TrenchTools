/**
 * Browser stub for Node.js 'path' module
 * Basic implementations that work in browser
 */

export function join(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export function basename(path: string, ext?: string): string {
  const base = path.split('/').pop() || '';
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function extname(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf('.');
  return dotIndex > 0 ? base.slice(dotIndex) : '';
}

export const sep = '/';
export const delimiter = ':';

export default {
  join,
  resolve,
  basename,
  dirname,
  extname,
  sep,
  delimiter,
};
