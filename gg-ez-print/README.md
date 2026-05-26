# GG EZ Print

A lightweight Windows system tray application that provides secure WebSocket access to local printers for web applications.

## Overview

GG EZ Print acts as a bridge between web applications and local printers (USB and network). Since browsers cannot directly access system printers due to security restrictions, this application runs locally and exposes a **secure WebSocket API (WSS) on port 8443**.

### Key Features

- **Secure WebSocket Server (WSS)** - TLS-encrypted API for listing printers and sending print jobs
- **Local CA Certificate** - Generates a trusted local CA and installs it in the Windows certificate store, eliminating browser security warnings
- **System Tray Integration** - Runs quietly in the background with status indicators
- **Dynamic Status Icons** - Green icon when clients are connected, red when idle
- **USB & Network Printer Support** - Works with Windows system printers and direct network connections
- **ESC/POS Support** - Built-in support for thermal receipt printers
- **Windows Autostart** - Optional startup with Windows via the tray menu
- **No Console Window** - Clean system tray-only interface (console can be toggled from the tray)

## Prerequisites

- **Windows** operating system
- **Go 1.25+** (for building from source)
- Printers configured in Windows Settings

## Installation

### Option 1: Run Pre-built Binary

1. Download `gg-ez-print.exe`
2. Ensure icon files (`printerGreen.ico`, `printerRed.ico`) are in the same directory
3. Double-click to run
4. On first launch, Windows will ask to install the local CA certificate — click **Yes**

### Option 2: Build from Source

```bash
git clone <repository-url>
cd gg-ez-print

go build -o gg-ez-print.exe .
```

## Usage

### Starting the Application

1. Run `gg-ez-print.exe`
2. The application starts in the system tray (no console window)
3. On **first launch**, Windows shows a dialog to install the local CA certificate — click **Yes** to enable trusted HTTPS in all browsers
4. **Red icon** = No connections (server idle)
5. **Green icon** = Clients connected

### System Tray Menu

Right-click the tray icon to access:

| Item | Description |
|---|---|
| **Conexiones: X** | Number of active WebSocket connections (read-only) |
| **Dirección: IP:8443** | Server WSS address (read-only) |
| **Instalar certificado CA** | Re-triggers the Windows CA trust dialog if needed |
| **Mostrar/Ocultar Consola** | Toggles the debug console window |
| **Iniciar con Windows** | Enables/disables Windows autostart |
| **Salir** | Closes the server |

### Certificate Trust

The application uses a two-layer certificate system to avoid browser warnings:

1. A **local CA** is generated once and installed in the Windows current-user trusted root store
2. A **server certificate** signed by that CA is issued for the current LAN IP

Once the CA is installed, all Chromium-based browsers (Chrome, Edge) trust the server automatically. See [CERTIFICATE_TRUST.md](CERTIFICATE_TRUST.md) for Firefox instructions and advanced details.

### WebSocket API

**Endpoint:** `wss://<localIP>:8443/ws`

#### List Available Printers

**Request:**
```json
{
  "action": "list"
}
```

**Response:**
```json
{
  "type": "printer_list",
  "printers": [
    {
      "name": "Thermal Printer",
      "type": "USB"
    },
    {
      "name": "192.168.1.100",
      "type": "Network"
    }
  ]
}
```

#### Send Print Job

**Request:**
```json
{
  "action": "print",
  "data": {
    "printer_name": "Thermal Printer",
    "type": "USB",
    "content": "=== RECEIPT ===\nItem 1: $10.00\nItem 2: $15.00\n--------------\nTotal: $25.00\n\nThank you!",
    "font_size": 1,
    "paper_width": 80
  }
}
```

**Response (Success):**
```json
{
  "status": "success"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Printer not found"
}
```

### Configuration

#### Printer Types

- **USB/System Printers**:
  - Set `type` to `"USB"`
  - Use the exact printer name from Windows (case-sensitive)
  - Uses Windows printer drivers

- **Network Printers**:
  - Set `type` to `"Network"`
  - Set `printer_name` to the printer's IP address (e.g., `"192.168.1.100"`)
  - Connects directly via TCP on port 9100 (RAW printing)

#### Font Sizes

- `1` - Normal size
- `2` - Double size (2x height and width)
- `3` - Triple size (3x height and width)

## Security Considerations

- **TLS Encrypted** - All WebSocket traffic uses WSS (TLS 1.2+) with a locally-trusted certificate
- **Local CA** - The CA private key never leaves the machine (`%APPDATA%\GGEZPrint\ca-key.pem`)
- **No Authentication** - Any application on the local network can connect to the WebSocket server
- **Open Origin Policy** - Accepts connections from any origin
- **LAN Exposure** - The server binds to the machine's LAN IP, not just localhost

**Recommendations:**
- Only run when actively needed
- Ensure Windows Firewall blocks external access to port 8443
- Never port-forward or expose to the internet
- Monitor the tray icon to see when clients connect
- Close the application when not in use

## Development

### Project Structure

```
gg-ez-print/
├── main.go              # Entry point
├── tray.go              # System tray integration and server startup
├── handlers.go          # WebSocket handlers and connection tracking
├── printers.go          # Printer discovery and printing functions
├── cert.go              # TLS certificate generation (local CA + leaf cert)
├── ca_trust.go          # Windows CA trust store integration
├── console.go           # Console window show/hide (Windows)
├── startup.go           # Windows autostart via registry
├── icon.go              # Icon loading utilities
├── types.go             # Data structures (PrintJob, WSMessage, etc.)
├── utils.go             # Helper functions
├── CERTIFICATE_TRUST.md # Certificate trust instructions
├── printerIcon.ico      # Default application icon
├── printerGreen.ico     # Connected state icon
└── printerRed.ico       # Disconnected state icon
```

### Building

```bash
# Build
go build -o gg-ez-print.exe .

# Run from source (for development)
go run .
```

### Dependencies

- [`github.com/gorilla/websocket`](https://github.com/gorilla/websocket) - WebSocket implementation
- [`github.com/alexbrainman/printer`](https://github.com/alexbrainman/printer) - Windows printer access
- [`github.com/getlantern/systray`](https://github.com/getlantern/systray) - System tray integration
- [`golang.org/x/sys`](https://pkg.go.dev/golang.org/x/sys) - Windows registry and syscall access

## Troubleshooting

### Browser still shows a security warning

- Click **"Instalar certificado CA"** in the tray menu and accept the Windows dialog
- If using Firefox, see [CERTIFICATE_TRUST.md](CERTIFICATE_TRUST.md) for additional steps
- To reset all certificates, delete `%APPDATA%\GGEZPrint\` and restart the app

### Icon doesn't appear in system tray

- Ensure `printerRed.ico` and `printerGreen.ico` are in the same directory as the executable
- Check Windows system tray settings (taskbar overflow)
- Restart the application

### Can't connect to WebSocket

- **Port already in use**: Check if another application is using port 8443
  ```bash
  netstat -ano | findstr :8443
  ```
- **Firewall blocking**: Check Windows Firewall settings
- **Wrong URL**: Ensure you're connecting to `wss://<localIP>:8443/ws` (not `ws://`)
- **IP changed**: The server address is shown in the tray menu under **Dirección**

### Printer not found

- Verify the printer is installed and configured in Windows Settings
- Check that the printer name matches **exactly** (case-sensitive)
- For USB printers, ensure the printer is online and ready
- For network printers, verify IP address and port 9100 accessibility
- Run PowerShell to list available printers:
  ```powershell
  Get-Printer | Select-Object Name
  ```

### Print job fails silently

- Check if the printer supports ESC/POS commands (for thermal printers)
- Verify printer is online and has paper
- For network printers, ensure firewall allows outbound connections to port 9100
- Toggle the console from the tray menu (**Mostrar Consola**) to see detailed logs

## Example Client Code

### JavaScript / Browser

```javascript
const serverIP = '192.168.1.50'; // Get this from the tray menu "Dirección"
const ws = new WebSocket(`wss://${serverIP}:8443/ws`);

ws.onopen = () => {
  console.log('Connected to printer server');
  ws.send(JSON.stringify({ action: 'list' }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);

  if (response.type === 'printer_list') {
    console.log('Available printers:', response.printers);

    ws.send(JSON.stringify({
      action: 'print',
      data: {
        printer_name: response.printers[0].name,
        type: response.printers[0].type,
        content: 'Hello from the web!',
        font_size: 1,
        paper_width: 80
      }
    }));
  }

  if (response.status === 'success') {
    console.log('Print job sent successfully!');
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Next.js

```typescript
const GG_EZ_PRINT_URL = `wss://${serverIP}:8443/ws`;

// No special cert handling needed — once the CA is installed on the
// user's Windows machine, the browser trusts the connection automatically.
const ws = new WebSocket(GG_EZ_PRINT_URL);
```

## License

Copyright © 2026 Renzo Costarelli

This software is provided as-is without warranty of any kind.

## Author

**Renzo Costarelli**

---

For questions, issues, or contributions, please open an issue in the repository.
