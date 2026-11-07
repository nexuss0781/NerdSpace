import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  getSettings,
  selectRootFolder,
  setRootFolder,
  createProject,
  deleteProject,
  renameProject,
  setProjectWebsite,
  listProjects,
  listEntries,
  readFile,
  writeFile,
  createFile,
  createFolder,
  deleteFsItem,
  renameFsItem,
  startWatching,
  onFsChange,
  onFsError,
} from './api.js'

export default class App {
  constructor(container) {
    this.container = container
    this.settings = null
    this.view = 'settings' // settings | projects | entries | editor
    this.currentDir = null
    this.currentFile = null
    this.fileContent = ''
    this.projects = {}
    this.entries = []
    this.unlistenFs = null
    this.toastTimer = null
    // Current desktop app version (kept in sync with desktop/tauri.conf.json).
    this.CURRENT_VERSION = "0.1.2"
    // Offline-first release monitor state, persisted in localStorage.
    this.releaseMonitor = {
      checking: false,
      lastCheckedAt: null,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseNotes: null,
      error: null,
    }
    this.bindDelegation()
  }

  /* ------------------------------------------------------------------ */
  /*  Boot                                                              */
  /* ------------------------------------------------------------------ */

  async init() {
    this.render()
    await this.refreshSettings()
    this.loadReleaseMonitorState()
    if (this.settings && this.settings.root_path) {
      this.view = 'projects'
      await startWatching().catch((e) => console.warn('watch', e))
    }
    this.setupFsListeners()
    // Auto-check for a new release in the background (offline-safe).
    this.checkForUpdates().catch(() => {})
    this.render()
  }

  async refreshSettings() {
    try {
      this.settings = await getSettings()
      this.projects = this.settings.projects || {}
    } catch (e) {
      this.toast('Failed to load settings: ' + e)
    }
  }

  async setupFsListeners() {
    this.unlistenFs = await onFsChange(() => {
      // Real-time: refresh whatever is currently open.
      this.refreshCurrentView()
    })
    await onFsError((e) => {
      console.warn('fs watcher error', e.payload)
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Release monitor (offline-first, GitHub releases)                  */
  /* ------------------------------------------------------------------ */

  loadReleaseMonitorState() {
    try {
      const raw = localStorage.getItem('releaseMonitor')
      if (raw) {
        this.releaseMonitor = { ...this.releaseMonitor, ...JSON.parse(raw) }
      }
    } catch (e) {
      console.warn('release monitor: failed to load stored state', e)
    }
  }

  saveReleaseMonitorState() {
    try {
      localStorage.setItem('releaseMonitor', JSON.stringify(this.releaseMonitor))
    } catch (e) {
      console.warn('release monitor: failed to persist state', e)
    }
  }

  /**
   * Compare two semver-like version strings. Returns 1 if a > b, -1 if a < b,
   * 0 if equal. Non-numeric segments compare as 0.
   */
  compareVersions(a, b) {
    const parse = (v) => String(v).replace(/^v/, '').split('.').map(Number)
    const pa = parse(a)
    const pb = parse(b)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0
      const y = pb[i] || 0
      if (x > y) return 1
      if (x < y) return -1
    }
    return 0
  }

  /**
   * Check GitHub for the latest release and compare it to the app version.
   * Requires network only for this call; results are stored locally so the
   * app stays usable offline.
   */
  async checkForUpdates(manual = false) {
    this.releaseMonitor.checking = true
    this.releaseMonitor.error = null
    this.render()
    try {
      const res = await fetch(
        'https://api.github.com/repos/nexuss0781/NerdSpace/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } },
      )
      if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`)
      const data = await res.json()
      const latest = data.tag_name || data.name || ''
      const latestVersion = latest.replace(/^v/, '') || 'unknown'
      const updateAvailable = this.compareVersions(this.CURRENT_VERSION, latestVersion) < 0
      this.releaseMonitor = {
        checking: false,
        lastCheckedAt: new Date().toISOString(),
        latestVersion,
        updateAvailable,
        releaseUrl: data.html_url || null,
        releaseNotes: data.body || null,
        error: null,
      }
      this.saveReleaseMonitorState()
      if (manual) {
        if (updateAvailable) {
          this.toast(
            `Update available: v${latestVersion} (you have v${this.CURRENT_VERSION})`,
          )
        } else {
          this.toast(`You're on the latest version (v${this.CURRENT_VERSION})`)
        }
      }
    } catch (error) {
      this.releaseMonitor.checking = false
      this.releaseMonitor.error = String(error)
      this.saveReleaseMonitorState()
      if (manual) this.toast('Update check failed: ' + String(error))
    }
    this.render()
  }

  async refreshCurrentView() {
    try {
      this.settings = await getSettings()
      this.projects = this.settings.projects || {}
      if (this.view === 'entries' && this.currentDir) {
        await this.loadEntries(this.currentDir)
      } else if (this.view === 'projects') {
        // nothing to reload; projects derived from settings
      }
      this.render()
    } catch (e) {
      console.warn('refresh', e)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Delegated click handler                                           */
  /* ------------------------------------------------------------------ */

  bindDelegation() {
    this.container.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]')
      if (!btn) return
      ev.preventDefault()
      const action = btn.getAttribute('data-action')
      try {
        await this.handleAction(action, btn)
      } catch (e) {
        this.toast(e.message || String(e))
      }
    })
    this.container.addEventListener('input', (ev) => {
      if (ev.target.matches('#editor-content')) {
        this.fileContent = ev.target.value
      }
    })
  }

  async handleAction(action, btn) {
    const getStr = (k) => btn.getAttribute('data-' + k)
    switch (action) {
      case 'select-root': {
        const picked = await selectRootFolder()
        if (picked) await this.setRoot(picked)
        break
      }
      case 'change-root':
        this.settings = null
        this.view = 'settings'
        this.currentDir = null
        this.render()
        break
      case 'check-updates':
        this.checkForUpdates(true)
        break
      case 'new-project': {
        const name = prompt('Project name:')
        if (!name) return
        await createProject(this.settings.root_path, name)
        await this.refreshSettings()
        this.render()
        break
      }
      case 'wrap-website': {
        const name = prompt('Project name:')
        if (!name) return
        const url = prompt('Website URL (e.g. https://example.com):')
        if (!url) return
        await createProject(this.settings.root_path, name)
        await this.refreshSettings()
        const meta = Object.values(this.projects).find((m) => m.name === name)
        if (meta) {
          // find path by name is unreliable; instead re-fetch settings and match newest
        }
        // simpler: set website on the project we just created by matching name->path
        const settings = await getSettings()
        const entry = Object.entries(settings.projects).find(
          ([, m]) => m.name === name && m.website_url == null,
        )
        if (entry) {
          await setProjectWebsite(entry[0], url)
          await this.refreshSettings()
        }
        this.render()
        break
      }
      case 'open-project': {
        const path = getStr('path')
        await this.loadEntries(path)
        break
      }
      case 'set-website': {
        const path = getStr('path')
        const url = prompt('Website URL to wrap:', this.projects[path]?.website_url || '')
        if (url === null) return
        await setProjectWebsite(path, url || undefined)
        await this.refreshSettings()
        this.render()
        break
      }
      case 'rename-project': {
        const path = getStr('path')
        const meta = this.projects[path]
        const nw = prompt('New name:', meta ? meta.name : '')
        if (!nw) return
        await renameProject(path, nw)
        await this.refreshSettings()
        this.render()
        break
      }
      case 'delete-project': {
        const path = getStr('path')
        if (!confirm('Delete this project folder and everything inside?')) return
        await deleteProject(path)
        await this.refreshSettings()
        if (this.currentDir === path) this.view = 'projects'
        this.render()
        break
      }
      case 'open-website': {
        const path = getStr('path')
        const meta = this.projects[path]
        if (!meta?.website_url) {
          this.toast('No website URL set for this project')
          return
        }
        const label = 'website-' + btoa(unescape(encodeURIComponent(path))).replace(/[^a-z0-9]/gi, '-')
        try {
          new WebviewWindow(label, {
            url: meta.website_url,
            title: meta.name + ' - Website',
            width: 1000,
            height: 750,
            resizable: true,
          })
        } catch (e) {
          // window may already exist; try to focus by opening again is not possible,
          // so just notify
          this.toast('Could not open website window: ' + e)
        }
        break
      }
      case 'back-to-projects':
        this.view = 'projects'
        this.currentDir = null
        this.currentFile = null
        this.render()
        break
      case 'new-file': {
        const name = prompt('File name:')
        if (!name) return
        await createFile(this.currentDir, name)
        await this.loadEntries(this.currentDir)
        break
      }
      case 'new-folder': {
        const name = prompt('Folder name:')
        if (!name) return
        await createFolder(this.currentDir, name)
        await this.loadEntries(this.currentDir)
        break
      }
      case 'open-entry': {
        const path = getStr('path')
        const kind = getStr('kind')
        if (kind === 'folder') await this.loadEntries(path)
        else await this.openEditor(path)
        break
      }
      case 'go-back': {
        if (!this.currentDir) {
          this.view = 'projects'
          this.render()
          return
        }
        const parent = this.dirname(this.currentDir)
        if (!this.settings || parent === this.settings.root_path) {
          this.view = 'projects'
          this.currentDir = null
        } else {
          await this.loadEntries(parent)
        }
        break
      }
      case 'save-file': {
        if (!this.currentFile) return
        await writeFile(this.currentFile, this.fileContent)
        await this.loadEntries(this.dirname(this.currentFile))
        this.view = 'entries'
        this.currentFile = null
        this.render()
        break
      }
      case 'cancel-editor':
        this.view = 'entries'
        this.currentFile = null
        this.render()
        break
      case 'delete-entry': {
        const path = getStr('path')
        if (!confirm('Delete "' + this.basename(path) + '"?')) return
        await deleteFsItem(path)
        await this.loadEntries(this.currentDir)
        break
      }
      case 'rename-entry': {
        const path = getStr('path')
        const nw = prompt('New name:', this.basename(path))
        if (!nw) return
        await renameFsItem(path, this.dirname(path) + '/' + nw)
        await this.loadEntries(this.currentDir)
        break
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Views                                                             */
  /* ------------------------------------------------------------------ */

  async setRoot(path) {
    this.settings = await setRootFolder(path)
    this.view = 'projects'
    await startWatching().catch((e) => console.warn('watch', e))
    this.render()
  }

  async loadEntries(dirPath) {
    this.currentDir = dirPath
    this.entries = await listEntries(dirPath)
    this.view = 'entries'
    this.render()
  }

  async openEditor(path) {
    this.fileContent = await readFile(path)
    this.currentFile = path
    this.view = 'editor'
    this.render()
    // focus textarea after render
    setTimeout(() => {
      const el = document.getElementById('editor-content')
      if (el) el.focus()
    }, 50)
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                         */
  /* ------------------------------------------------------------------ */

  render() {
    const root = this.settings ? this.settings.root_path : null
    const header = `
      <div class="app-header">
        <div class="header-left">
          <h1 class="app-title">Nexus<span class="accent">Desktop</span></h1>
        </div>
        <div class="header-right">
          ${root
            ? `<div class="chip">Root: ${this.escape(root)}</div>`
            : `<button class="btn" data-action="select-root">Select Root Folder</button>`
          }
          ${this.releaseMonitor.updateAvailable
            ? `<button class="btn btn-ghost update-chip" data-action="check-updates" title="Update available v${this.escape(this.releaseMonitor.latestVersion)}">Update v${this.escape(this.releaseMonitor.latestVersion)}</button>`
            : ''}
          <button class="btn btn-ghost" data-action="change-root">Change Root</button>
          <button class="btn btn-ghost" data-action="check-updates" title="Check for app updates">🔄 Check updates</button>
        </div>
      </div>
      <div class="toast" id="toast"></div>
    `

    let main = ''
    switch (this.view) {
      case 'settings':
        main = this.renderSettings(root)
        break
      case 'projects':
        main = this.renderProjects(root)
        break
      case 'entries':
        main = this.renderEntries()
        break
      case 'editor':
        main = this.renderEditor()
        break
    }

    this.container.innerHTML = header + main
  }

  renderSettings(root) {
    if (root) {
      return `
        <div class="onboarding">
          <div class="onboarding-card">
            <div class="onboarding-header">
              <h2 class="onboarding-title">Nexus<span class="onboarding-accent">Desktop</span></h2>
              <p class="onboarding-subtitle">Root folder already set</p>
            </div>
            <div class="onboarding-body">
              <div class="onboarding-path">${this.escape(root)}</div>
            </div>
            <div class="onboarding-actions">
              <button class="btn btn-ghost" data-action="change-root">Choose a different folder</button>
              <button class="btn btn-primary" data-action="back-to-projects">Open Projects</button>
            </div>
          </div>
        </div>
      `
    }
    return `
      <div class="onboarding">
        <div class="onboarding-card">
          <div class="onboarding-header">
            <div class="onboarding-logo">N<span class="onboarding-accent">D</span></div>
            <h2 class="onboarding-title">Welcome to Nexus Desktop</h2>
            <p class="onboarding-subtitle">A clean, focused workspace for your coding projects.</p>
          </div>
          <div class="onboarding-body">
            <div class="onboarding-step">
              <span class="onboarding-step-number">01</span>
              <span class="onboarding-step-text">Select a root folder</span>
            </div>
            <div class="onboarding-hint">
              Every subfolder becomes a project. Open files, edit them, save changes — all in one focused workspace.
            </div>
          </div>
          <div class="onboarding-actions">
            <button class="btn btn-primary" data-action="select-root">Select Root Folder</button>
          </div>
          <div class="onboarding-footer">
            <p class="onboarding-footer-text">No terminal. No AI. Just code.</p>
          </div>
        </div>
      </div>
    `
  }

  renderProjects(root) {
    const projs = Object.entries(this.projects || {})
    const hasRoot = !!root
    return `
      <div class="toolbar">
        <h2>Projects <span class="count">(${projs.length})</span></h2>
        <div class="toolbar-right">
          <button class="btn" data-action="new-project">+ New Project</button>
          <button class="btn btn-primary" data-action="wrap-website">+ Wrap a Website</button>
        </div>
      </div>

      <div class="projects-list">
        ${projs.length === 0
          ? `<div class="empty"><p>No projects yet. Create one or wrap a website.</p></div>`
          : projs
              .map(([path, meta]) => this.projectCard(path, meta))
              .join('')
        }
      </div>

      <div class="hint">
        <b>How it works:</b> each card is a project folder under your root.
        Click a project to browse its files. Assign a website URL and click
        <i>Open Website</i> to run that site in its own desktop window (wrapped app).
      </div>
    `
  }

  projectCard(path, meta) {
    const hasWeb = Boolean(meta.website_url)
    return `
      <div class="card project-card">
        <div class="card-head">
          <div class="card-title">
            <span class="ico">📁</span>
            <span class="name">${this.escape(meta.name)}</span>
          </div>
          <div class="card-actions">
            ${hasWeb
              ? `<button class="btn btn-sm icon-btn" data-action="open-website" data-path="${this.attr(path)}" title="Open website in desktop window">🌐</button>`
              : `<button class="btn btn-sm icon-btn" data-action="set-website" data-path="${this.attr(path)}" title="Set website URL">🔗</button>`
            }
            <button class="btn btn-sm icon-btn" data-action="open-project" data-path="${this.attr(path)}" title="Open project">➤</button>
            <button class="btn btn-sm icon-btn" data-action="rename-project" data-path="${this.attr(path)}" title="Rename">✎</button>
            <button class="btn btn-sm icon-btn danger" data-action="delete-project" data-path="${this.attr(path)}" title="Delete">✕</button>
          </div>
        </div>
        <div class="card-meta">
          <span class="label">Path</span>
          <span class="value">${this.escape(path)}</span>
        </div>
        ${hasWeb
          ? `<div class="card-meta"><span class="label">Website</span> <span class="value url">${this.escape(meta.website_url)}</span></div>`
          : ''
        }
      </div>
    `
  }

  renderEntries() {
    const root = this.settings ? this.settings.root_path : ''
    const isRootLevel = this.currentDir === root
    const crumbs = this.breadcrumbs(this.currentDir)
    return `
      <div class="toolbar">
        <h2>${this.escape(this.basename(this.currentDir) || this.currentDir)}</h2>
        <div class="crumbs">${crumbs}</div>
        <div class="toolbar-right">
          <button class="btn btn-ghost" data-action="go-back">← Back</button>
          <button class="btn" data-action="new-file">+ File</button>
          <button class="btn" data-action="new-folder">+ Folder</button>
          <button class="btn btn-ghost" data-action="back-to-projects">Projects</button>
        </div>
      </div>

      <div class="entries-list">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th class="numeric">Type</th>
              <th class="numeric">Size</th>
              <th class="numeric">Modified</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.entries
              .map((e) => this.entryRow(e))
              .join('') ||
              `<tr><td colspan="5" class="empty-cell">Empty folder</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="hint">
        Folders inside a project are normal folders &mdash; only immediate
        subfolders of your root count as projects.
      </div>
    `
  }

  entryRow(e) {
    const isFolder = e.kind === 'folder'
    const size = isFolder ? '—' : this.formatBytes(e.size)
    const mod = e.modified ? new Date(e.modified * 1000).toLocaleString() : '—'
    const icon = isFolder ? '📂' : '📄'
    return `
      <tr>
        <td>
          <span class="ico">${icon}</span>
          <span class="name">${this.escape(e.name)}</span>
        </td>
        <td class="numeric kind">${this.escape(e.kind)}</td>
        <td class="numeric">${size}</td>
        <td class="numeric">${mod}</td>
        <td class="actions">
          ${isFolder
            ? `<button class="btn btn-sm" data-action="open-entry" data-path="${this.attr(e.path)}" data-kind="folder">Open</button>`
            : `<button class="btn btn-sm" data-action="open-entry" data-path="${this.attr(e.path)}" data-kind="file">Edit</button>`
          }
          <button class="btn btn-sm icon-btn" data-action="rename-entry" data-path="${this.attr(e.path)}" title="Rename">✎</button>
          <button class="btn btn-sm icon-btn danger" data-action="delete-entry" data-path="${this.attr(e.path)}" title="Delete">✕</button>
        </td>
      </tr>
    `
  }

  renderEditor() {
    const name = this.basename(this.currentFile)
    return `
      <div class="toolbar">
        <h2>${this.escape(name)}</h2>
        <div class="path">${this.escape(this.currentFile)}</div>
        <div class="toolbar-right">
          <button class="btn btn-ghost" data-action="cancel-editor">← Back</button>
          <button class="btn btn-primary" data-action="save-file">Save</button>
        </div>
      </div>
      <div class="editor-wrap">
        <textarea id="editor-content" spellcheck="false">${this.escape(this.fileContent)}</textarea>
      </div>
    `
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */

  breadcrumbs(dirPath) {
    if (!dirPath) return ''
    const root = this.settings ? this.settings.root_path : ''
    let parts = []
    let p = dirPath
    while (p && p !== root) {
      parts.unshift(this.basename(p) || p)
      p = this.dirname(p)
    }
    if (root) parts.unshift('Root')
    return parts
      .map((part, i) => {
        if (i === parts.length - 1) return `<span class="crumb current">${this.escape(part)}</span>`
        return `<span class="crumb"><button class="btn link" data-action="open-entry" data-path="${this.attr(this.buildCrumbPath(parts, i))}" data-kind="folder">${this.escape(part)}</button></span>`
      })
      .join(' <span class="sep">›</span> ')
  }

  buildCrumbPath(parts, i) {
    // reconstruct path up to index i from root
    const root = this.settings ? this.settings.root_path : ''
    let p = root
    for (let j = 0; j <= i; j++) p = p + '/' + parts[j]
    return p
  }

  basename(path) {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] || ''
  }

  dirname(path) {
    const parts = path.split(/[\\/]/)
    parts.pop()
    return parts.join('/') || '/'
  }

  attr(s) {
    return String(s).replace(/"/g, '&quot;')
  }

  escape(s) {
    if (s == null) return ''
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  formatBytes(bytes) {
    if (bytes == null) return '—'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  toast(msg) {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = msg
    el.className = 'toast show'
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      el.className = 'toast'
    }, 3000)
  }
}
