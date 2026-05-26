package main

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

const (
	registryPath = `Software\Microsoft\Windows\CurrentVersion\Run`
	appName      = "GGEZPrint"
)

// getExecutablePath returns the absolute path to the current executable
func getExecutablePath() (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("no se pudo obtener la ruta del ejecutable: %w", err)
	}
	return execPath, nil
}

// isStartupEnabled checks if the application is configured to start with Windows
func isStartupEnabled() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, registryPath, registry.QUERY_VALUE)
	if err != nil {
		// Key doesn't exist or can't be opened - treat as disabled
		return false
	}
	defer key.Close()

	registryPath, _, err := key.GetStringValue(appName)
	if err != nil {
		// Value doesn't exist - treat as disabled
		return false
	}

	// Compare with current executable path
	currentPath, err := getExecutablePath()
	if err != nil {
		return false
	}

	return registryPath == currentPath
}

// enableStartup adds the application to Windows startup
func enableStartup() error {
	execPath, err := getExecutablePath()
	if err != nil {
		return err
	}

	key, err := registry.OpenKey(registry.CURRENT_USER, registryPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir la clave del registro: %w", err)
	}
	defer key.Close()

	err = key.SetStringValue(appName, execPath)
	if err != nil {
		return fmt.Errorf("no se pudo escribir en el registro: %w", err)
	}

	fmt.Println("Inicio automático habilitado")
	return nil
}

// disableStartup removes the application from Windows startup
func disableStartup() error {
	key, err := registry.OpenKey(registry.CURRENT_USER, registryPath, registry.SET_VALUE)
	if err != nil {
		// If we can't open the key, it might not exist - that's fine
		return nil
	}
	defer key.Close()

	err = key.DeleteValue(appName)
	if err != nil && err != registry.ErrNotExist {
		return fmt.Errorf("no se pudo eliminar la entrada del registro: %w", err)
	}

	fmt.Println("Inicio automático deshabilitado")
	return nil
}

// toggleStartup toggles the Windows startup state
func toggleStartup() error {
	if isStartupEnabled() {
		return disableStartup()
	}
	return enableStartup()
}
