// File System Access API types (Chrome/Edge only)
interface FileSystemDirectoryHandle {
  readonly kind: 'directory'
  readonly name: string
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
  getFileHandle(name: string): Promise<FileSystemFileHandle>
}

interface FileSystemFileHandle {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}
