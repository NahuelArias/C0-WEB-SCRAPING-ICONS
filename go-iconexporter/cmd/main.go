// cmd/main.go
package main

import (
    "fmt"
    "os"
    "iconexporter"
)

func main() {
    // Configuración de ejemplo
    config := iconexporter.Config{
        Collections:    []string{"nonicons", "devicon"},
        OutputDir:      "./output-go",
        DefaultSize:    [2]int{40, 40},
        DefaultColor:   "purple",
        OutputFormats:  []string{"svg", "png"},
        IconsToExport:  []string{"bell", "angular"},
        FileNaming: iconexporter.FileNamingConfig{
            Pattern: "{collection}-{icon}-{width}",
            Case:    "kebab",
        },
        FolderStructure: iconexporter.FolderStructureConfig{
            Enabled:     true,
            Pattern:     "{collection}",
            GroupBySize: true,
        },
    }
    
    sizes := [][2]int{{16, 16}, {32, 32}, {64, 96}}
    colors := []string{"#FF5733", "green"}
    
    summary, err := iconexporter.ExportIconVariants(config, sizes, colors)
    if err != nil {
        fmt.Printf("Error en la exportación: %v\n", err)
        os.Exit(1)
    }
    
    fmt.Printf("\n📊 Exportación completada:\n")
    fmt.Printf("   ✅ Exitosos: %d\n", summary.Processed)
    fmt.Printf("   ❌ Errores: %d\n", summary.Errors)
    fmt.Printf("   ⏱️  Tiempo total: %.2fs\n", summary.Duration)
}