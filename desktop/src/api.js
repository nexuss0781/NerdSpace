import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const getSettings = () => invoke('get_settings')
export const selectRootFolder = () => invoke('select_root_folder')
export const setRootFolder = (rootPath) =>
  invoke('set_root_folder', { root_path: rootPath })
export const createProject = (rootPath, name) =>
  invoke('create_project', { root_path: rootPath, name })
export const deleteProject = (path) => invoke('delete_project', { path })
export const renameProject = (oldPath, newName) =>
  invoke('rename_project', { old_path: oldPath, new_name: newName })
export const setProjectWebsite = (path, websiteUrl) =>
  invoke('set_project_website', { path, website_url: websiteUrl })
export const listProjects = () => invoke('list_projects')
export const listEntries = (dirPath) =>
  invoke('list_entries', { dir_path: dirPath })
export const readFile = (path) => invoke('read_file', { path })
export const writeFile = (path, content) =>
  invoke('write_file', { path, content })
export const createFile = (dirPath, name, content = '') =>
  invoke('create_file', { dir_path: dirPath, name, content })
export const createFolder = (dirPath, name) =>
  invoke('create_folder', { dir_path: dirPath, name })
export const deleteFsItem = (path) => invoke('delete_file', { path })
export const renameFsItem = (oldPath, newPath) =>
  invoke('rename_file', { old_path: oldPath, new_path: newPath })
export const startWatching = () => invoke('start_watching')

export const onFsChange = (cb) =>
  listen('fs-change', (event) => cb(event.payload))
export const onFsError = (cb) =>
  listen('fs-error', (event) => cb(event.payload))
