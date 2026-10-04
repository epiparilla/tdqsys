# OpenCode Task Checklist: Windows to macOS Electron Migration

## Objective
Audit, refactor, and build target the current Windows Electron application for macOS (`.dmg` installer delivery).

---

## Task 1: Environment & File Path Audit
- [ ] **Scan Path Separators**: Search for hardcoded backslashes (`\`) or string concatenations for file paths across all main process (`src/main/` or root) and renderer files. Refactor all paths to use `path.join(...)` or `path.resolve(...)`.
- [ ] **Directory Aliases**: Replace Windows-specific system directory references (e.g., `process.env.APPDATA` or `C:\Users\...`) with cross-platform Electron API calls:
  ```js
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  ```

---

## Task 2: Codebase Refactoring
- [ ] **Native Modules & Binaries**: Audit `package.json` for Windows-native binaries (`.exe`, `.dll`, or node-gyp bindings compiled for Win32). Provide macOS equivalents or conditional fallbacks using `process.platform === 'darwin'`.
- [ ] **Keyboard Shortcuts**: Update global and menu hotkeys. Automatically map `Ctrl` to `Cmd` (or `CommandOrControl`) using standard Electron accelerator syntax:
  ```js
  accelerator: process.platform === 'darwin' ? 'Cmd+S' : 'Ctrl+S'
  ```
- [ ] **Application Menu & Window Controls**: Ensure standard macOS top bar menu support (`app.setName()`, `About`, `Quit`) and remove custom frame overrides if native macOS traffic lights are preferred.

---

## Task 3: Build & Packaging Setup
- [ ] **Update `package.json` Scripts**: Add standard build commands:
  ```json
  "scripts": {
    "build:mac": "electron-builder --mac",
    "build:mac-arm64": "electron-builder --mac --arm64",
    "build:mac-x64": "electron-builder --mac --x64"
  }
  ```
- [ ] **Configure `electron-builder` Block**: Verify or insert the following configuration block into `package.json`:
  ```json
  "build": {
    "appId": "com.yourcompany.appname",
    "productName": "YourAppName",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "mac": {
      "category": "public.app-category.utilities",
      "target": [
        {
          "target": "dmg",
          "arch": ["arm64", "x64"]
        }
      ],
      "icon": "build/icon.icns",
      "hardenedRuntime": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "dmg": {
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    }
  }
  ```

---

## Task 4: macOS Required Assets & Hardened Runtime Setup
- [ ] **Generate Entitlements**: Create `build/entitlements.mac.plist`:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
    <dict>
      <key>com.apple.security.cs.allow-jit</key>
      <true/>
      <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
      <true/>
      <key>com.apple.security.cs.debugger</key>
      <true/>
    </dict>
  </plist>
  ```
- [ ] **Icon File Verification**: Check that `build/icon.icns` is present (minimum resolution 1024x1024).

---

## Task 5: Execution Request for OpenCode
1. Execute the code audit outlined in **Task 1** and **Task 2**.
2. Apply the configuration files in **Task 3** and **Task 4**.
3. Attempt a trial dry-run build with `npm run build:mac` and list any missing dependencies or build errors.