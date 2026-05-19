# Annoying Element Remover

No-BS lightweight Chrome extension designed to remove annoying web elements from any website. Built with zero cloud overhead, zero telemetry, and zero bloat.

---

## 📖 Description

The **Annoying Element Remover** lets you reclaim your screen real equity. It provides a visual utility to hide any DOM element on any page permanently.

Unlike massive general-purpose ad blockers that require complex regex/stylesheet syntax, this extension gives you direct visual point-and-click control over your browsing viewport. Under the hood, it converts your selections into highly efficient CSS styles injected directly at `document_start`, yielding instant layout adjustments without layout shifts or flashes.

---

## 💡 Motivation

Modern web browsing is increasingly cluttered with sticky overlays, widgets, and banners. Existing extension suites are either too heavy, collect telemetry data, or force you to create accounts to sync configurations.

This project is built on the **"No-BS"** philosophy:

* **Frictionless Utility**: Point, click, block. No onboarding screens, no configuration wizards.
* **Extreme Performance**: Built on pure, dependency-free vanilla JS, HTML, and CSS. Hiding is handled natively by the browser layout engine via injected `.selector { display: none !important }` sheets rather than costly runtime JavaScript DOM-polling loops.
* **100% Data Sovereignty**: All rules live exclusively inside your browser's local sandbox. You can backup, sync, and delete your rules manually using clean JSON structures.

---

## ⚡ Quick Start

To load the extension locally in developer mode:

1. **Download the Code**: Clone or download this repository to your local drive.
2. **Open Extensions Page**: Open Google Chrome and navigate to `chrome://extensions/`.
3. **Enable Developer Mode**: Toggle the **Developer mode** switch at the top-right corner of the tab.
4. **Load Unpacked**: Click the **Load unpacked** button in the top-left corner.
5. **Select Folder**: Choose the root `annoying-element-remover` folder. The extension will instantly appear in your toolbar!

---

## 🛠️ Usage

### 1. Hide Elements

There are two highly optimized ways to hide elements on the fly:

* **Visual Picker**: Click the extension icon in your toolbar, select **Pick Element to Hide**, hover over any element, and click it.
* **Context Menu (Right-Click)**: Simply right-click any annoying element on a webpage and select **Always hide this element** to block it instantly.

### 2. Manage Active Rules

* Open the popup to see a list of all active hidden elements on the current site.
* Toggle the **ON/OFF** button next to any element to temporarily show/hide it.
* Click the **✕** button to permanently delete the hiding rule.
* Toggle the master switch in the header to globally suspend/resume all rules on the active domain.

### 3. Backup & Sync (Settings)

* Click the **Settings** button in the popup header to slide into the options drawer.
* **Export**: Save your entire multi-site rule base as a lightweight `.json` backup file.
* **Import**: Load rules from a backup file (complete with safety limiters and origin confirmation checks).
* **Reset Rules**: Instantly clear all hiding rules for the active site.

---

## 🤝 Contributing

We welcome contributions that align with the project core lightweight principles!

* **No Dependencies**: Keep the codebase pure, using only native web APIs (no React, no jQuery, no Tailwind in runtime content scripts).
* **Optimized Execution**: Avoid synchronous loops or polling; leverage Chrome's declarative design systems.
* **PR Process**: Fork the repository, create your feature branch, keep comment documentation clean and single-line where possible, and open a Pull Request.
