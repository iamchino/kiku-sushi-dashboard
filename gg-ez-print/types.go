package main

// PrintJob represents a single print job request
type PrintJob struct {
	PrinterName string `json:"printer_name"`
	Type        string `json:"type"`
	Content     string `json:"content"`
	FontSize    int    `json:"font_size"`
	PaperWidth  int    `json:"paper_width"`
	// QRCodeData: si está presente, el formatter va a renderizar un QR
	// como bitmap raster ESC/POS y reemplazarlo en el lugar del marker
	// `{{QR}}` que esté dentro de Content. Si no hay marker, se imprime
	// al final del ticket.
	QRCodeData string `json:"qr_code_data,omitempty"`
}

// WSMessage represents a WebSocket message
type WSMessage struct {
	Action string   `json:"action"`
	Data   PrintJob `json:"data"` // Optional for "list" action
}

// PrinterInfo contains information about a printer
type PrinterInfo struct {
	Name string `json:"name"`
	Type string `json:"type"`
}
