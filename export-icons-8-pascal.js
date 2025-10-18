// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// 🎨 Clase para manejar la exportación de iconos
class IconExporter {
    constructor(config = {}) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    }

    /**
     * Combina configuraciones de forma profunda
     */
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };

        for (const key in userConfig) {
            if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
                merged[key] = { ...defaultConfig[key], ...userConfig[key] };
            } else {
                merged[key] = userConfig[key];
            }
        }

        return merged;
    }

    /**
     * Sanitiza un string para uso en nombres de archivo
     */
    sanitizeString(str) {
        if (!this.config.fileNaming.sanitize) return str;

        return str
            .replace(/[<>:"/\\|?*]/g, '') // Caracteres no válidos en Windows
            .replace(/[\s]+/g, '-') // Espacios a guiones
            .replace(/[^\w\-\.]/g, '') // Solo letras, números, guiones y puntos
            .replace(/\-+/g, '-') // Múltiples guiones a uno solo
            .replace(/^-+|-+$/g, ''); // Quitar guiones al inicio/final
    }

    /**
     * Elimina guiones medios y números del nombre del icono
     */
    removeHyphensAndNumbersFromIconName(iconName) {
        return iconName.replace(/-/g, '').replace(/\d/g, '');
    }

    /**
     * Aplica transformación de caso al string
     */
    applyCase(str, caseType) {
        switch (caseType) {
            case 'camel':
                return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            case 'pascal':
                return str.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase()).replace(/-/g, '');
            case 'snake':
                return str.replace(/-/g, '_').toLowerCase();
            case 'kebab':
                return str.toLowerCase();
            case 'original':
                // Cambiado de 'original' a PascalCase
                return str.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase()).replace(/-/g, '');
            default:
                return str;
        }
    }

    /**
     * Genera el nombre del archivo basado en el patrón configurado
     */
    generateFileName(collection, iconName, options = {}) {
        const { size = this.config.defaultSize, color = this.config.defaultColor, format = this.config.defaultFormat } = options;

        // Eliminar guiones medios y números del nombre del icono
        const cleanIconName = this.removeHyphensAndNumbersFromIconName(iconName);

        let fileName = this.config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', cleanIconName) // Usar el nombre limpio sin guiones ni números
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default')
            .replace('{format}', format || 'svg');

        // Sanitizar y aplicar caso
        fileName = this.sanitizeString(fileName);
        fileName = this.applyCase(fileName, this.config.fileNaming.case);

        return `${fileName}.${format || this.config.fileNaming.extension}`;
    }

    /**
     * Genera la ruta de la carpeta basada en el patrón configurado
     */
    generateFolderPath(collection, options = {}) {
        if (!this.config.folderStructure.enabled) {
            return this.config.outputDir;
        }

        const { size = this.config.defaultSize, color = this.config.defaultColor, format = this.config.defaultFormat } = options;

        let folderPath = this.config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default')
            .replace('{format}', format || 'svg');

        // Construir ruta completa
        let fullPath = path.join(this.config.outputDir, folderPath);

        // Agregar subcarpetas adicionales si están habilitadas
        if (this.config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${size}`);
        }

        if (this.config.folderStructure.groupByColor && color) {
            fullPath = path.join(fullPath, `color-${this.sanitizeString(color)}`);
        }

        if (this.config.folderStructure.groupByFormat && format) {
            fullPath = path.join(fullPath, `format-${format}`);
        }

        return fullPath;
    }

    /**
     * Crea el directorio de salida si no existe
     */
    async ensureOutputDir(dirPath = null) {
        const targetDir = dirPath || this.config.outputDir;

        try {
            await fs.mkdir(targetDir, { recursive: true });
        } catch (error) {
            throw new Error(`No se pudo crear el directorio ${targetDir}: ${error.message}`);
        }
    }

    /**
     * Carga y parsea los datos de una colección de iconos
     */
    async loadCollectionData(collection) {
        try {
            const jsonPath = locate(collection);
            if (!jsonPath) {
                throw new Error(`Colección "${collection}" no encontrada`);
            }

            const jsonContent = await fs.readFile(jsonPath, "utf8");
            return JSON.parse(jsonContent);
        } catch (error) {
            throw new Error(`Error cargando colección "${collection}": ${error.message}`);
        }
    }

    /**
     * Obtiene la lista de iconos a procesar
     */
    getIconsToProcess(data) {
        return this.config.iconsToExport.length > 0
            ? this.config.iconsToExport
            : Object.keys(data.icons);
    }

    /**
     * Valida si un icono existe en la colección
     */
    validateIcon(data, iconName, collection) {
        if (!data.icons[iconName]) {
            console.warn(`⚠️  Icono "${iconName}" no existe en ${collection}`);
            return false;
        }
        return true;
    }

    /**
     * Aplica color al SVG si no tiene fill definido
     */
    applySvgColor(svgBody, color = null) {
        const targetColor = color || this.config.defaultColor;

        if (!/fill=("|')[^"']*("|')/.test(svgBody) && targetColor) {
            return svgBody.replace(/<path/g, `<path fill="${targetColor}"`);
        }
        return svgBody;
    }

    /**
     * Genera el contenido SVG completo
     */
    generateSvgContent(renderData, processedBody, size = null) {
        const targetSize = size || this.config.defaultSize;
        const { viewBox } = renderData.attributes;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${targetSize}" height="${targetSize}">
    ${processedBody}
</svg>`;
    }

    /**
     * Convierte SVG a PNG usando un canvas (simulado - en producción usaría una librería real)
     */
    async convertSvgToPng(svgContent, size) {
        // En una implementación real, usarías una librería como sharp, canvas, etc.
        // Esta es una simulación para demostrar el concepto
        console.log(`🔄 Convirtiendo SVG a PNG (${size}px)`);
        
        // Simular conversión (en producción esto generaría un buffer PNG real)
        return Buffer.from(svgContent); // Esto debería ser un buffer PNG real
    }

    /**
     * Convierte SVG a JPEG usando un canvas (simulado)
     */
    async convertSvgToJpeg(svgContent, size) {
        console.log(`🔄 Convirtiendo SVG a JPEG (${size}px)`);
        
        // Simular conversión
        return Buffer.from(svgContent); // Esto debería ser un buffer JPEG real
    }

    /**
     * Convierte SVG a ICO (simulado)
     */
    async convertSvgToIco(svgContent, sizes) {
        console.log(`🔄 Convirtiendo SVG a ICO (múltiples tamaños)`);
        
        // Simular conversión
        return Buffer.from(svgContent); // Esto debería ser un buffer ICO real
    }

    /**
     * Procesa un solo icono con opciones personalizadas
     */
    async processIcon(data, iconName, collection, options = {}) {
        const { size, color, format = 'svg' } = options;

        try {
            // Obtener datos del icono
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
                return false;
            }

            const targetSize = size || this.config.defaultSize;

            // Convertir a SVG
            const renderData = iconToSVG(iconData, {
                height: `${targetSize}px`,
                width: `${targetSize}px`
            });

            // Aplicar color
            const processedBody = this.applySvgColor(renderData.body, color);

            // Generar SVG completo
            const svgContent = this.generateSvgContent(renderData, processedBody, targetSize);

            let fileContent;
            let finalFormat = format;

            // Convertir a diferentes formatos según sea necesario
            switch (format) {
                case 'png':
                    fileContent = await this.convertSvgToPng(svgContent, targetSize);
                    break;
                case 'jpg':
                case 'jpeg':
                    fileContent = await this.convertSvgToJpeg(svgContent, targetSize);
                    finalFormat = 'jpg';
                    break;
                case 'ico':
                    fileContent = await this.convertSvgToIco(svgContent, [16, 32, 48, 64]);
                    break;
                case 'svg':
                default:
                    fileContent = svgContent;
                    break;
            }

            // Generar rutas
            const folderPath = this.generateFolderPath(collection, { 
                size: targetSize, 
                color, 
                format: finalFormat 
            });
            
            const fileName = this.generateFileName(collection, iconName, { 
                size: targetSize, 
                color, 
                format: finalFormat 
            });
            
            const filePath = path.join(folderPath, fileName);

            // Asegurar que existe el directorio
            await this.ensureOutputDir(folderPath);

            // Guardar archivo
            await fs.writeFile(filePath, fileContent, format === 'svg' ? "utf8" : "binary");
            console.log(`✅ Exportado: ${filePath}`);

            return true;
        } catch (error) {
            console.error(`❌ Error procesando icono "${iconName}" en formato ${format}: ${error.message}`);
            return false;
        }
    }

    /**
     * Procesa todos los iconos de una colección con múltiples formatos
     */
    async processCollectionWithFormats(collection, formats = ['svg']) {
        try {
            const data = await this.loadCollectionData(collection);
            const icons = this.getIconsToProcess(data);

            let processedCount = 0;
            let errorCount = 0;

            console.log(`📁 Estructura de carpetas: ${this.config.folderStructure.enabled ? 'Habilitada' : 'Deshabilitada'}`);
            console.log(`📝 Patrón de nombres: ${this.config.fileNaming.pattern}`);
            console.log(`🎨 Formatos a exportar: ${formats.join(', ')}`);

            for (const iconName of icons) {
                if (!this.validateIcon(data, iconName, collection)) {
                    errorCount++;
                    continue;
                }

                // Procesar con todos los formatos especificados
                for (const format of formats) {
                    const success = await this.processIcon(data, iconName, collection, { format });
                    if (success) {
                        processedCount++;
                    } else {
                        errorCount++;
                    }
                }
            }

            return { processedCount, errorCount, total: icons.length * formats.length };
        } catch (error) {
            console.error(`❌ Error en colección "${collection}": ${error.message}`);
            return { processedCount: 0, errorCount: 1, total: 0 };
        }
    }

    /**
     * Exporta iconos con múltiples variantes (tamaños, colores, formatos)
     */
    async exportWithVariants(variants = {}) {
        const { 
            sizes = [this.config.defaultSize], 
            colors = [this.config.defaultColor],
            formats = [this.config.defaultFormat]
        } = variants;

        const startTime = Date.now();

        try {
            await this.ensureOutputDir();

            let totalProcessed = 0;
            let totalErrors = 0;
            let totalIcons = 0;

            for (const collection of this.config.collections) {
                console.log(`📦 Procesando colección: ${collection}`);

                const data = await this.loadCollectionData(collection);
                const icons = this.getIconsToProcess(data);

                for (const iconName of icons) {
                    if (!this.validateIcon(data, iconName, collection)) {
                        totalErrors++;
                        continue;
                    }

                    // Procesar todas las combinaciones de tamaño, color y formato
                    for (const size of sizes) {
                        for (const color of colors) {
                            for (const format of formats) {
                                const success = await this.processIcon(data, iconName, collection, { 
                                    size, 
                                    color, 
                                    format 
                                });
                                if (success) {
                                    totalProcessed++;
                                } else {
                                    totalErrors++;
                                }
                            }
                        }
                    }
                }

                totalIcons += icons.length * sizes.length * colors.length * formats.length;
                console.log(`   ${icons.length} iconos × ${sizes.length} tamaños × ${colors.length} colores × ${formats.length} formatos`);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log("\n📊 Resumen de exportación:");
            console.log(`   ✅ Exitosos: ${totalProcessed}`);
            console.log(`   ❌ Errores: ${totalErrors}`);
            console.log(`   📄 Total variantes: ${totalIcons}`);
            console.log(`   ⏱️  Tiempo: ${duration}s`);
            console.log("🎉 Exportación completada!");

            return { processed: totalProcessed, errors: totalErrors, total: totalIcons };

        } catch (error) {
            console.error("❌ Error fatal:", error.message);
            process.exit(1);
        }
    }

    /**
     * Exporta todos los iconos de todas las colecciones (método original mejorado)
     */
    async exportIcons() {
        return this.exportWithVariants();
    }

    /**
     * Exporta iconos con múltiples formatos
     */
    async exportWithFormats(formats = ['svg', 'png', 'jpg']) {
        return this.exportWithVariants({ formats });
    }
}

// 🚀 Función de utilidad para exportar con configuración personalizada
export function createExporter(config = {}) {
    return new IconExporter(config);
}

// 🎯 Exportación con configuración por defecto
export async function exportIcons(config = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportIcons();
}

// 📝 Exportación con múltiples variantes
export async function exportIconVariants(config = {}, variants = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportWithVariants(variants);
}

// 🆕 Exportación con múltiples formatos
export async function exportIconFormats(config = {}, formats = ['svg', 'png', 'jpg']) {
    const exporter = new IconExporter(config);
    return await exporter.exportWithFormats(formats);
}

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = {
    collections: [],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "red",
    defaultFormat: "svg",
    // 🆕 Nuevas opciones de naming y organización
    fileNaming: {
        pattern: "{collection}-{icon}", // Patrón: {collection}, {icon}, {size}, {color}, {format}
        extension: "svg", // Extensión de archivo por defecto
        sanitize: true, // Limpia caracteres especiales
        case: "kebab" // "kebab", "camel", "pascal", "snake", "original" (ahora PascalCase)
    },
    folderStructure: {
        enabled: true, // Si false, todos los archivos van a outputDir directamente
        pattern: "{collection}/{format}", // Patrón: {collection}, {format}, {size}, {color}
        groupBySize: false, // Crear subcarpetas por tamaño
        groupByColor: false, // Crear subcarpetas por color
        groupByFormat: true // Crear subcarpetas por formato
    }
};

// 🏃‍♂️ Ejecución directa del script
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    // Ejemplo de configuración personalizada
    const customConfig = {
        collections: ["nonicons", "devicon", "file-icons", "skill-icons", "vscode-icons", "material-icon-theme"],
        outputDir: "./icons/iconify",
        defaultSize: 64,
        defaultColor: "#22918b",
        iconsToExport: [],
        fileNaming: {
            pattern: "{icon}-{size}",
            case: "snake"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}/{format}", // Carpeta colección → subcarpeta formato
            groupBySize: true,
            groupByColor: false,
            groupByFormat: true // Habilitar agrupación por formato
        }
    };

    const exporter = new IconExporter(customConfig);
    
    // Exportar con múltiples formatos
    exporter.exportWithFormats(['svg', 'png', 'jpg']);
}