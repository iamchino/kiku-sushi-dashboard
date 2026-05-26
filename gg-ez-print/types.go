package main

// PrintJob represents a single print job request
type PrintJob struct {
	PrinterName string `json:"printer_name"`
	Type        string `json:"type"`
	Content     string `json:"content"`
	FontSize    int    `json:"font_size"`
	PaperWidth  int    `json:"paper_width"`
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
