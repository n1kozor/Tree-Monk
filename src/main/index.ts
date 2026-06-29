import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getDb, closeDb } from './db/connection'
import { registerIpc } from './ipc'
import { destroyExportWindow } from './treeExport'
import { registerMediaScheme, registerMediaProtocol } from './mediaProtocol'

// AppImage on newer Linux (e.g. Ubuntu 24.04) restricts unprivileged user
// namespaces and ships chrome-sandbox without the SUID-root bit, so Chromium's
// setuid sandbox aborts on launch ("The SUID sandbox helper binary was found,
// but is not configured correctly"). The renderer already runs with
// `sandbox: false`, so disabling the setuid sandbox launcher here is consistent
// and lets the AppImage start without the user passing --no-sandbox manually.
if (process.platform === 'linux' && process.env.APPIMAGE) {
  app.commandLine.appendSwitch('no-sandbox')
}

// Privileged custom scheme (tmedia://) must be registered before app `ready`.
registerMediaScheme()

const isDev = !app.isPackaged
// Bundled app icon (extraResources → resources/icon.png) for the window + taskbar.
const ICON = join(process.resourcesPath, 'icon.png')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // The hidden export window must not keep the app alive once the main window
  // closes — drop it so `window-all-closed` fires normally.
  win.on('closed', () => destroyExportWindow())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && rendererUrl) {
    win.loadURL(rendererUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Single-instance lock: a second launch (an accidental double-click, or relaunch
// from the taskbar) would otherwise open the SAME database file in a second
// process and contend on the SQLite/WAL lock — which can hang the new instance
// forever on the splash. Instead, hand off to the already-running window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // Open/create the database before any IPC can hit it. If this throws (locked
    // file, AV quarantine, corrupt DB, no write access…) we still bring up the
    // window + IPC so the renderer gets a clear error instead of an eternal
    // splash, and we tell the user what happened.
    try {
      getDb()
    } catch (err) {
      dialog.showErrorBox(
        'TreeMonk',
        'Nem sikerült megnyitni az adatbázist.\nCould not open the database.\n\n' +
          String((err as Error)?.message ?? err)
      )
    }
    registerMediaProtocol()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => closeDb())
}
