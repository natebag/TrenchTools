/**
 * Browser stub for Node.js 'fs' module
 * Returns empty/noop implementations for browser compatibility
 * These functions will throw if actually called at runtime
 */

const notAvailable = (name: string) => {
  return (..._args: any[]) => {
    console.warn(`fs.${name} called in browser - not available`);
    throw new Error(`fs.${name} is not available in browser`);
  };
};

const notAvailableSync = (name: string) => {
  return (..._args: any[]): never => {
    console.warn(`fs.${name} called in browser - not available`);
    throw new Error(`fs.${name} is not available in browser`);
  };
};

const notAvailableAsync = (name: string) => {
  return async (..._args: any[]): Promise<never> => {
    console.warn(`fs.${name} called in browser - not available`);
    throw new Error(`fs.${name} is not available in browser`);
  };
};

// Sync functions
export const existsSync = (_path: string): boolean => {
  console.warn('fs.existsSync called in browser - returning false');
  return false;
};
export const readFileSync = notAvailableSync('readFileSync');
export const writeFileSync = notAvailableSync('writeFileSync');
export const appendFileSync = notAvailableSync('appendFileSync');
export const mkdirSync = notAvailableSync('mkdirSync');
export const rmdirSync = notAvailableSync('rmdirSync');
export const unlinkSync = notAvailableSync('unlinkSync');
export const readdirSync = notAvailableSync('readdirSync');
export const statSync = notAvailableSync('statSync');
export const lstatSync = notAvailableSync('lstatSync');
export const copyFileSync = notAvailableSync('copyFileSync');
export const renameSync = notAvailableSync('renameSync');
export const accessSync = notAvailableSync('accessSync');
export const chmodSync = notAvailableSync('chmodSync');
export const chownSync = notAvailableSync('chownSync');

// Async callback functions
export const readFile = notAvailable('readFile');
export const writeFile = notAvailable('writeFile');
export const appendFile = notAvailable('appendFile');
export const mkdir = notAvailable('mkdir');
export const rmdir = notAvailable('rmdir');
export const unlink = notAvailable('unlink');
export const readdir = notAvailable('readdir');
export const stat = notAvailable('stat');
export const lstat = notAvailable('lstat');
export const copyFile = notAvailable('copyFile');
export const rename = notAvailable('rename');
export const access = notAvailable('access');
export const chmod = notAvailable('chmod');
export const chown = notAvailable('chown');
export const open = notAvailable('open');
export const close = notAvailable('close');
export const fstat = notAvailable('fstat');
export const read = notAvailable('read');
export const write = notAvailable('write');
export const ftruncate = notAvailable('ftruncate');
export const futimes = notAvailable('futimes');
export const fsync = notAvailable('fsync');
export const fdatasync = notAvailable('fdatasync');
export const realpath = notAvailable('realpath');
export const link = notAvailable('link');
export const symlink = notAvailable('symlink');
export const readlink = notAvailable('readlink');
export const truncate = notAvailable('truncate');
export const utimes = notAvailable('utimes');
export const watch = notAvailable('watch');
export const watchFile = notAvailable('watchFile');
export const unwatchFile = notAvailable('unwatchFile');

// Stream functions
export const createReadStream = notAvailable('createReadStream');
export const createWriteStream = notAvailable('createWriteStream');

// Promises API
export const promises = {
  readFile: notAvailableAsync('promises.readFile'),
  writeFile: notAvailableAsync('promises.writeFile'),
  appendFile: notAvailableAsync('promises.appendFile'),
  mkdir: notAvailableAsync('promises.mkdir'),
  rmdir: notAvailableAsync('promises.rmdir'),
  rm: notAvailableAsync('promises.rm'),
  unlink: notAvailableAsync('promises.unlink'),
  readdir: notAvailableAsync('promises.readdir'),
  stat: notAvailableAsync('promises.stat'),
  lstat: notAvailableAsync('promises.lstat'),
  copyFile: notAvailableAsync('promises.copyFile'),
  rename: notAvailableAsync('promises.rename'),
  access: notAvailableAsync('promises.access'),
  chmod: notAvailableAsync('promises.chmod'),
  chown: notAvailableAsync('promises.chown'),
  open: notAvailableAsync('promises.open'),
  realpath: notAvailableAsync('promises.realpath'),
  link: notAvailableAsync('promises.link'),
  symlink: notAvailableAsync('promises.symlink'),
  readlink: notAvailableAsync('promises.readlink'),
  truncate: notAvailableAsync('promises.truncate'),
  utimes: notAvailableAsync('promises.utimes'),
};

// Constants
export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  COPYFILE_EXCL: 1,
  COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE_FORCE: 4,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOATIME: 262144,
  O_NOFOLLOW: 131072,
  O_SYNC: 1052672,
  O_DSYNC: 4096,
  O_DIRECT: 16384,
  O_NONBLOCK: 2048,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFCHR: 8192,
  S_IFBLK: 24576,
  S_IFIFO: 4096,
  S_IFLNK: 40960,
  S_IFSOCK: 49152,
  S_IRWXU: 448,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRWXG: 56,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IRWXO: 7,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1,
};

export default {
  // Sync
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  readdirSync,
  statSync,
  lstatSync,
  copyFileSync,
  renameSync,
  accessSync,
  chmodSync,
  chownSync,
  // Async callback
  readFile,
  writeFile,
  appendFile,
  mkdir,
  rmdir,
  unlink,
  readdir,
  stat,
  lstat,
  copyFile,
  rename,
  access,
  chmod,
  chown,
  open,
  close,
  fstat,
  read,
  write,
  ftruncate,
  futimes,
  fsync,
  fdatasync,
  realpath,
  link,
  symlink,
  readlink,
  truncate,
  utimes,
  watch,
  watchFile,
  unwatchFile,
  // Streams
  createReadStream,
  createWriteStream,
  // Promises
  promises,
  // Constants
  constants,
};
