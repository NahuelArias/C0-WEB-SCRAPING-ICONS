package main

import (
	"encoding/json"
	"fmt"
	"image/color"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/disintegration/imaging"
	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
	"golang.org/x/image/draw"
)

// Configuración por defecto
var DefaultConfig = Config{
	Collections:   []string{},
	IconsToExport: []string{},
	OutputDir:     "./icons",
	DefaultSize:   [2]int{48, 48},
	DefaultColor:  "red",
	OutputFormats: []string{"svg"},
	FileNaming: FileNamingConfig{
		Pattern:   "{collection}-{icon}-{width}x{height}",
		Extension: "{format}",
		Sanitize:  true,
		Case:      "kebab",
	},
	FolderStructure: FolderStructureConfig{
		Enabled:    true,
		Pattern:    "{collection}",
		GroupBySize:  false,
		GroupByColor: false,
	},
}

// Constantes y patrones
var (
	ValidCaseTypes        = map[string]bool{"camel": true, "pascal": true, "snake": true, "kebab": true, "original": true}
	ValidRasterFormats    = map[string]bool{"png": true, "jpeg": true, "webp": true}
	InvalidFilenameChars  = regexp.MustCompile(`[<>:"/\\|?*]`)
	MultipleHyphens       = regexp.MustCompile(`-+`)
	LeadingTrailingHyphens = regexp.MustCompile(`^-+|-+$`)
	FillAttributePattern  = regexp.MustCompile(`fill=("|')[^"']*("|')`)
	CamelCasePattern      = regexp.MustCompile(`-([a-z])`)
	PascalCasePattern     = regexp.MustCompile(`(^|-)([a-z])`)
)

// Estructuras de configuración
type FileNamingConfig struct {
	Pattern   string
	Extension string
	Sanitize  bool
	Case      string
}

type FolderStructureConfig struct {
	Enabled      bool
	Pattern      string
	GroupBySize  bool
	GroupByColor bool
}

type Config struct {
	Collections      []string
	IconsToExport   []string
	OutputDir       string
	DefaultSize     [2]int
	DefaultColor    string
	OutputFormats   []string
	FileNaming      FileNamingConfig
	FolderStructure FolderStructureConfig
}

type IconData struct {
	Prefix  string            `json:"prefix"`
	Icons   map[string]Icon   `json:"icons"`
	Width   int               `json:"width"`
	Height  int               `json:"height"`
	ViewBox string            `json:"viewBox"`
}

type Icon struct {
	Body      string `json:"body"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	ViewBox   string `json:"viewBox"`
}

type ExportSummary struct {
	Processed int
	Errors    int
	Duration  float64
}

// IconExporter maneja la exportación de iconos
type IconExporter struct {
	config Config
	mu     sync.Mutex
}

// NuevaIconExporter crea una nueva instancia de IconExporter
func NewIconExporter(userConfig Config) (*IconExporter, error) {
	exporter := &IconExporter{
		config: mergeConfig(DefaultConfig, userConfig),
	}
	
	if err := exporter.validateConfig(); err != nil {
		return nil, err
	}
	
	return exporter, nil
}

// mergeConfig combina configuraciones
func mergeConfig(defaultConfig, userConfig Config) Config {
	merged := defaultConfig
	
	// Sobrescribir campos simples
	if len(userConfig.Collections) > 0 {
		merged.Collections = userConfig.Collections
	}
	if len(userConfig.IconsToExport) > 0 {
		merged.IconsToExport = userConfig.IconsToExport
	}
	if userConfig.OutputDir != "" {
		merged.OutputDir = userConfig.OutputDir
	}
	if userConfig.DefaultSize[0] > 0 && userConfig.DefaultSize[1] > 0 {
		merged.DefaultSize = userConfig.DefaultSize
	}
	if userConfig.DefaultColor != "" {
		merged.DefaultColor = userConfig.DefaultColor
	}
	if len(userConfig.OutputFormats) > 0 {
		merged.OutputFormats = userConfig.OutputFormats
	}
	
	// Sub-configuraciones
	if userConfig.FileNaming.Pattern != "" {
		merged.FileNaming.Pattern = userConfig.FileNaming.Pattern
	}
	if userConfig.FileNaming.Extension != "" {
		merged.FileNaming.Extension = userConfig.FileNaming.Extension
	}
	merged.FileNaming.Sanitize = userConfig.FileNaming.Sanitize
	if userConfig.FileNaming.Case != "" {
		merged.FileNaming.Case = userConfig.FileNaming.Case
	}
	
	if userConfig.FolderStructure.Pattern != "" {
		merged.FolderStructure.Pattern = userConfig.FolderStructure.Pattern
	}
	merged.FolderStructure.Enabled = userConfig.FolderStructure.Enabled
	merged.FolderStructure.GroupBySize = userConfig.FolderStructure.GroupBySize
	merged.FolderStructure.GroupByColor = userConfig.FolderStructure.GroupByColor
	
	return merged
}

// validateConfig valida la configuración
func (e *IconExporter) validateConfig() error {
	if len(e.config.Collections) == 0 {
		return fmt.Errorf("la configuración debe incluir al menos una colección")
	}
	
	if !ValidCaseTypes[e.config.FileNaming.Case] {
		return fmt.Errorf("tipo de caso no válido: %s", e.config.FileNaming.Case)
	}
	
	for _, format := range e.config.OutputFormats {
		if format != "svg" && !ValidRasterFormats[format] {
			return fmt.Errorf("formato de salida no válido: %s. Soportados: svg, png, jpeg, webp", format)
		}
	}
	
	return nil
}

// applyCase aplica la transformación de caso
func (e *IconExporter) applyCase(str, caseType string) string {
	kebabStr := strings.ToLower(str)
	kebabStr = strings.ReplaceAll(kebabStr, " ", "-")
	kebabStr = MultipleHyphens.ReplaceAllString(kebabStr, "-")
	kebabStr = LeadingTrailingHyphens.ReplaceAllString(kebabStr, "")
	
	switch caseType {
	case "camel":
		return CamelCasePattern.ReplaceAllStringFunc(kebabStr, func(s string) string {
			return strings.ToUpper(s[1:])
		})
	case "pascal":
		result := PascalCasePattern.ReplaceAllStringFunc(kebabStr, func(s string) string {
			if strings.HasPrefix(s, "-") {
				return strings.ToUpper(s[1:])
			}
			return strings.ToUpper(s)
		})
		return strings.ReplaceAll(result, "-", "")
	case "snake":
		return strings.ReplaceAll(kebabStr, "-", "_")
	case "kebab":
		return kebabStr
	case "original":
		return e.applyCase(kebabStr, "pascal")
	default:
		return str
	}
}

// generateFileName genera el nombre del archivo
func (e *IconExporter) generateFileName(collection, iconName string, options map[string]interface{}) string {
	width := options["width"].(int)
	height := options["height"].(int)
	color := options["color"].(string)
	format := options["format"].(string)
	
	fileName := e.config.FileNaming.Pattern
	fileName = strings.ReplaceAll(fileName, "{collection}", collection)
	fileName = strings.ReplaceAll(fileName, "{icon}", iconName)
	fileName = strings.ReplaceAll(fileName, "{width}", fmt.Sprintf("%d", width))
	fileName = strings.ReplaceAll(fileName, "{height}", fmt.Sprintf("%d", height))
	fileName = strings.ReplaceAll(fileName, "{color}", color)
	fileName = strings.ReplaceAll(fileName, "{format}", format)
	
	// Sanitización
	if e.config.FileNaming.Sanitize {
		fileName = InvalidFilenameChars.ReplaceAllString(fileName, "")
		fileName = strings.ReplaceAll(fileName, " ", "-")
		// Permitir solo letras, números, guiones, puntos y barras
		re := regexp.MustCompile(`[^\w\-\.\/]`)
		fileName = re.ReplaceAllString(fileName, "")
		fileName = MultipleHyphens.ReplaceAllString(fileName, "-")
		fileName = LeadingTrailingHyphens.ReplaceAllString(fileName, "")
	}
	
	fileName = e.applyCase(fileName, e.config.FileNaming.Case)
	
	return fmt.Sprintf("%s.%s", fileName, format)
}

// generateFolderPath genera la ruta de la carpeta
func (e *IconExporter) generateFolderPath(collection string, options map[string]interface{}) string {
	if !e.config.FolderStructure.Enabled {
		return e.config.OutputDir
	}
	
	width := options["width"].(int)
	height := options["height"].(int)
	color := options["color"].(string)
	sizeString := fmt.Sprintf("%dx%d", width, height)
	
	folderPattern := e.config.FolderStructure.Pattern
	folderPattern = strings.ReplaceAll(folderPattern, "{collection}", collection)
	folderPattern = strings.ReplaceAll(folderPattern, "{width}", fmt.Sprintf("%d", width))
	folderPattern = strings.ReplaceAll(folderPattern, "{height}", fmt.Sprintf("%d", height))
	folderPattern = strings.ReplaceAll(folderPattern, "{size}", sizeString)
	folderPattern = strings.ReplaceAll(folderPattern, "{color}", color)
	
	fullPath := filepath.Join(e.config.OutputDir, folderPattern)
	
	if e.config.FolderStructure.GroupBySize {
		fullPath = filepath.Join(fullPath, fmt.Sprintf("size-%s", sizeString))
	}
	
	if e.config.FolderStructure.GroupByColor && color != "" {
		cleanColor := strings.ReplaceAll(color, "#", "")
		fullPath = filepath.Join(fullPath, fmt.Sprintf("color-%s", cleanColor))
	}
	
	return fullPath
}

// ensureOutputDir crea el directorio de salida si no existe
func (e *IconExporter) ensureOutputDir(dirPath string) error {
	return os.MkdirAll(dirPath, 0755)
}

// applySvgColor aplica color al SVG
func (e *IconExporter) applySvgColor(svgBody, color string) string {
	targetColor := color
	if targetColor == "" {
		targetColor = e.config.DefaultColor
	}
	
	if !FillAttributePattern.MatchString(svgBody) && targetColor != "" {
		return strings.ReplaceAll(svgBody, "<path", fmt.Sprintf(`<path fill="%s"`, targetColor))
	}
	return svgBody
}

// prepareSvgBuffer prepara el contenido SVG como bytes
func (e *IconExporter) prepareSvgBuffer(icon Icon, width, height int, color string) []byte {
	processedBody := e.applySvgColor(icon.Body, color)
	svgContent := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%d" height="%d">%s</svg>`, 
		icon.ViewBox, width, height, processedBody)
	return []byte(svgContent)
}

// saveImage guarda la imagen en el formato especificado
func (e *IconExporter) saveImage(svgData []byte, filePath, format string, width, height int) error {
	if format == "svg" {
		return os.WriteFile(filePath, svgData, 0644)
	}
	
	// Parsear SVG
	icon, err := oksvg.ReadIconStream(strings.NewReader(string(svgData)))
	if err != nil {
		return fmt.Errorf("error parsing SVG: %v", err)
	}
	
	icon.SetTarget(0, 0, float64(width), float64(height))
	
	// Crear imagen
	img := imaging.New(width, height, color.NRGBA{})
	drawer := draw.New(img)
	
	// Dibujar icono
	icon.Draw(rasterx.NewDasher(width, height, drawer), 1)
	
	// Guardar en formato especificado
	switch format {
	case "png":
		return imaging.Save(img, filePath)
	case "jpeg":
		return imaging.Save(img, filePath)
	case "webp":
		// Nota: imaging no soporta WebP directamente, usar una librería adicional
		// Para este ejemplo, guardamos como PNG
		return imaging.Save(img, strings.TrimSuffix(filePath, ".webp")+".png")
	default:
		return fmt.Errorf("formato no soportado: %s", format)
	}
}

// processVariant procesa una variante de icono
func (e *IconExporter) processVariant(iconData IconData, collection, iconName string, options map[string]interface{}) (int, error) {
	width := options["width"].(int)
	height := options["height"].(int)
	color := options["color"].(string)
	successCount := 0
	
	icon, exists := iconData.Icons[iconName]
	if !exists {
		return 0, fmt.Errorf("icono '%s' no encontrado en %s", iconName, collection)
	}
	
	svgBuffer := e.prepareSvgBuffer(icon, width, height, color)
	folderPath := e.generateFolderPath(collection, options)
	
	if err := e.ensureOutputDir(folderPath); err != nil {
		return 0, fmt.Errorf("error creando directorio: %v", err)
	}
	
	// Exportar a todos los formatos
	for _, format := range e.config.OutputFormats {
		fileName := e.generateFileName(collection, iconName, map[string]interface{}{
			"width":  width,
			"height": height,
			"color":  color,
			"format": format,
		})
		
		filePath := filepath.Join(folderPath, fileName)
		
		if err := e.saveImage(svgBuffer, filePath, format, width, height); err != nil {
			fmt.Printf("❌ Error al guardar %s para '%s' (%dx%d, %s): %v\n", 
				format, iconName, width, height, color, err)
		} else {
			fmt.Printf("✅ Exportado: %s\n", filePath)
			successCount++
		}
	}
	
	return successCount, nil
}

// loadCollectionData carga los datos de una colección
func (e *IconExporter) loadCollectionData(collection string) (IconData, error) {
	// En Go, necesitarías implementar la lógica para localizar archivos JSON
	// o usar una fuente diferente de iconos
	var iconData IconData
	
	// Para este ejemplo, usaremos datos de ejemplo
	// En producción, deberías cargar desde archivos JSON reales
	iconData = IconData{
		Prefix: collection,
		Icons: map[string]Icon{
			"bell": {
				Body:    `<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>`,
				Width:   24,
				Height:  24,
				ViewBox: "0 0 24 24",
			},
		},
		ViewBox: "0 0 24 24",
	}
	
	return iconData, nil
}

// getIconsToProcess obtiene la lista de iconos a procesar
func (e *IconExporter) getIconsToProcess(iconData IconData) []string {
	if len(e.config.IconsToExport) > 0 {
		return e.config.IconsToExport
	}
	
	icons := make([]string, 0, len(iconData.Icons))
	for iconName := range iconData.Icons {
		icons = append(icons, iconName)
	}
	return icons
}

// ExportWithVariants exporta iconos con variantes
func (e *IconExporter) ExportWithVariants(sizes [][2]int, colors []string) (ExportSummary, error) {
	startTime := time.Now()
	
	if len(sizes) == 0 {
		sizes = [][2]int{e.config.DefaultSize}
	}
	if len(colors) == 0 {
		colors = []string{e.config.DefaultColor}
	}
	
	var totalProcessed, totalErrors int
	var wg sync.WaitGroup
	errorsChan := make(chan error, 100)
	resultsChan := make(chan int, 100)
	
	// Crear directorio de salida
	if err := e.ensureOutputDir(e.config.OutputDir); err != nil {
		return ExportSummary{}, fmt.Errorf("error creando directorio de salida: %v", err)
	}
	
	// Cargar colecciones
	for _, collection := range e.config.Collections {
		iconData, err := e.loadCollectionData(collection)
		if err != nil {
			fmt.Printf("❌ Error cargando colección %s: %v\n", collection, err)
			continue
		}
		
		icons := e.getIconsToProcess(iconData)
		fmt.Printf("\n📦 Procesando colección: %s (%d iconos)\n", collection, len(icons))
		
		for _, iconName := range icons {
			if _, exists := iconData.Icons[iconName]; !exists {
				fmt.Printf("⚠️ Icono '%s' no encontrado en %s\n", iconName, collection)
				totalErrors += len(sizes) * len(colors) * len(e.config.OutputFormats)
				continue
			}
			
			for _, size := range sizes {
				for _, col := range colors {
					wg.Add(1)
					
					go func(colName, iconName string, width, height int, col string) {
						defer wg.Done()
						
						options := map[string]interface{}{
							"width":  width,
							"height": height,
							"color":  col,
						}
						
						success, err := e.processVariant(iconData, colName, iconName, options)
						if err != nil {
							errorsChan <- err
						} else {
							resultsChan <- success
						}
					}(collection, iconName, size[0], size[1], col)
				}
			}
		}
	}
	
	// Esperar a que todas las goroutines terminen
	go func() {
		wg.Wait()
		close(errorsChan)
		close(resultsChan)
	}()
	
	// Procesar resultados
	for success := range resultsChan {
		totalProcessed += success
	}
	
	// Contar errores
	for range errorsChan {
		totalErrors++
	}
	
	duration := time.Since(startTime).Seconds()
	e.printExportSummary(totalProcessed, totalErrors, duration)
	
	return ExportSummary{
		Processed: totalProcessed,
		Errors:    totalErrors,
		Duration:  duration,
	}, nil
}

// printExportSummary imprime el resumen de exportación
func (e *IconExporter) printExportSummary(processed, errors int, duration float64) {
	total := processed + errors
	
	fmt.Println("\n📊 Resumen de exportación:")
	fmt.Printf("   ✅ Exitosos: %d\n", processed)
	fmt.Printf("   ❌ Errores: %d\n", errors)
	fmt.Printf("   📄 Total archivos intentados: %d\n", total)
	fmt.Printf("   ⏱️  Tiempo total: %.2fs\n", duration)
	fmt.Println("🎉 Exportación completada!")
}

// ExportIcons exporta iconos con valores por defecto
func (e *IconExporter) ExportIcons() (ExportSummary, error) {
	return e.ExportWithVariants([][2]int{e.config.DefaultSize}, []string{e.config.DefaultColor})
}

// Funciones de utilidad para el consumidor
func CreateExporter(config Config) (*IconExporter, error) {
	return NewIconExporter(config)
}

func ExportIcons(config Config) (ExportSummary, error) {
	exporter, err := NewIconExporter(config)
	if err != nil {
		return ExportSummary{}, err
	}
	return exporter.ExportIcons()
}

func ExportIconVariants(config Config, sizes [][2]int, colors []string) (ExportSummary, error) {
	exporter, err := NewIconExporter(config)
	if err != nil {
		return ExportSummary{}, err
	}
	return exporter.ExportWithVariants(sizes, colors)
}

// Ejemplo de uso
func main() {
	config := Config{
		Collections:    []string{"nonicons", "devicon"},
		OutputDir:      "./output-go",
		DefaultSize:    [2]int{40, 40},
		DefaultColor:   "purple",
		OutputFormats:  []string{"svg", "png"},
		IconsToExport:  []string{"bell", "angular"},
		FileNaming: FileNamingConfig{
			Pattern: "{collection}-{icon}-{width}",
			Case:    "kebab",
		},
		FolderStructure: FolderStructureConfig{
			Enabled:     true,
			Pattern:     "{collection}",
			GroupBySize: true,
		},
	}
	
	sizes := [][2]int{{16, 16}, {32, 32}, {64, 96}}
	colors := []string{"#FF5733", "green"}
	
	summary, err := ExportIconVariants(config, sizes, colors)
	if err != nil {
		fmt.Printf("Error en la exportación: %v\n", err)
		os.Exit(1)
	}
	
	fmt.Printf("Exportación completada: %d exitosos, %d errores\n", 
		summary.Processed, summary.Errors)
}