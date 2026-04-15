# Google Calendar Multi-Sync Pro

A robust Google Apps Script designed to synchronize multiple source calendars into specific destination calendars with advanced privacy, masking, and visual controls. Managed via a modern Web GUI.

## 🌟 Sync Modes
- **Full Sync:** Mirrors events exactly as they are in the source.
- **Private (Lock):** Sets visibility to **Private** in Google Calendar. Others will only see "Busy". Details and attachments are automatically stripped. Per-event colors are hidden from observers in this mode.
- **Custom Mask:** Granular control over the copied data:
    - **Title:** Keep original, add a custom prefix, or replace the title entirely.
    - **Sanitization:** Individually toggle stripping of Descriptions/URLs, Locations, and Attachments.

## 🛠 Features
- **Instant Sync:** Trigger a synchronization immediately upon saving your settings.
- **Automation Trigger:** Schedule background syncing (15m, 30m, 1h, once a day) directly from the GUI.
- **Filtering:** Option to skip events marked as "Free/Available" in the source to reduce clutter.
- **Appearance Control:** 
    - Supports Google Calendar's full **Color Palette** (Lavender, Sage, Tomato, etc.).
    - Force destination status to "Busy" or "Free" regardless of the source.
- **Smart Logic:** Detects changes to minimize API calls, handles "All-day" conversions, and performs automatic cleanup.

## 📦 Installation
1. Create a new [Google Apps Script](https://script.google.com/) project.
2. Replace `Code.gs` with the provided backend code.
3. Create an HTML file named `Index` and paste the frontend code.
4. **Deploy** as a **Web App** (Execute as: `Me`, Access: `Only myself`).
5. Open the Deployment URL to configure your setups.

## 📄 License
This project is licensed under the MIT License.