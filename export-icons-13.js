// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";
// 🛡️ Librería segura y de alto rendimiento para conversión de imágenes
import sharp from "sharp"; 

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    outputDir: "./icons", 
    // defaultSize es un arreglo [ancho, alto]
    defaultSize: [48, 48], 
    defaultColor: "red",
    // Formatos a exportar por defecto
    outputFormats: ["svg"], 
    fileNaming: {
        pattern: "{collection}-{icon}-{width}x{height}", 
        extension: "{format}", 
        sanitize: true,
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: false,
        groupByColor: false
    }
});

// 🔧 Constantes y Patrones
const VALID_CASE_TYPES = new Set(['camel', 'pascal', 'snake', 'kebab', 'original']);
const VALID_RASTER_FORMATS = new Set(['png', 'jpeg', 'webp']);
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const MULTIPLE_HYPHENS = /-+/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;
const FILL_ATTRIBUTE_PATTERN = /fill=("|')[^"']*("|')/;
const CAMEL_CASE_PATTERN = /-([a-z])/g;
const PASCAL_CASE_PATTERN = /(^|-)([a-z])/g;

// 🎯 Clase para manejar la exportación de iconos
class IconExporter {
    constructor(config = {}) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
        this.validateConfig();
    }

    /**
     * Combina configuraciones de forma limpia e inmutable, y normaliza el tamaño.
     */
    mergeConfig(defaultConfig, userConfig) {
        // Fusión superficial, con fusión profunda para sub-objetos clave
        const merged = { 
            ...defaultConfig, 
            ...userConfig,
            fileNaming: { ...defaultConfig.fileNaming, ...userConfig.fileNaming },
            folderStructure: { ...defaultConfig.folderStructure, ...userConfig.folderStructure },
        };
        
        // Normalización del tamaño por defecto
        if (typeof merged.defaultSize === 'number') {
            merged.defaultSize = [merged.defaultSize, merged.defaultSize];
        } else if (!Array.isArray(merged.defaultSize) || merged.defaultSize.length < 2 || merged.defaultSize.some(s => typeof s !== 'number' || s <= 0)) {
             merged.defaultSize = DEFAULT_CONFIG.defaultSize;
             console.warn("⚠️ Configuración 'defaultSize' inválida. Usando el valor por defecto: [48, 48].");
        }
        
        // Congelar el objeto de configuración para garantizar la inmutabilidad
        return Object.freeze(merged);
    }

    /**
     * Valida la configuración esencial.
     */
    validateConfig() {
        if (!Array.isArray(this.config.collections) || this.config.collections.length === 0) {
            throw new Error("La configuración debe incluir al menos una colección (collections).");
        }
        if (!VALID_CASE_TYPES.has(this.config.fileNaming.case)) {
            throw new Error(`Tipo de caso no válido: ${this.config.fileNaming.case}`);
        }
        for (const format of this.config.outputFormats) {
            if (format !== 'svg' && !VALID_RASTER_FORMATS.has(format)) {
                throw new Error(`Formato de salida no válido: ${format}. Soportados: svg, png, jpeg, webp.`);
            }
        }
    }

    /**
     * Aplica la transformación de caso al string.
     */
    applyCase(str, caseType) {
        const kebabStr = str.toLowerCase()
            .replace(/\s/g, '-')
            .replace(MULTIPLE_HYPHENS, '-')
            .replace(LEADING_TRAILING_HYPHENS, '');
        
        switch (caseType) {
            case 'camel':
                return kebabStr.replace(CAMEL_CASE_PATTERN, (_, letter) => letter.toUpperCase());
            case 'pascal':
                return kebabStr.replace(PASCAL_CASE_PATTERN, (_, __, letter) => letter.toUpperCase()).replace(/-/g, '');
            case 'snake':
                return kebabStr.replace(/-/g, '_');
            case 'kebab':
                return kebabStr; 
            case 'original':
                // En este contexto, 'original' se mantiene como PascalCase limpio por convención
                return this.applyCase(kebabStr, 'pascal');
            default:
                return str;
        }
    }

    /**
     * Sanitiza y genera el nombre del archivo.
     */
    generateFileName(collection, iconName, options) {
        const { width, height, color, format } = options;
        // Se ha eliminado la limpieza agresiva inicial para confiar en el patrón y la sanitización final.

        let fileName = this.config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', iconName) // Usar el nombre del icono sin limpieza previa
            .replace('{width}', width.toString())
            .replace('{height}', height.toString())
            .replace('{color}', color || 'default')
            .replace('{format}', format);

        // Sanitización
        if (this.config.fileNaming.sanitize) {
            fileName = fileName
                .replace(INVALID_FILENAME_CHARS, '')
                .replace(/[\s]+/g, '-')
                .replace(/[^\w\-\.\/]/g, '') // Permitir solo letras, números, guiones, puntos y barras
                .replace(MULTIPLE_HYPHENS, '-')
                .replace(LEADING_TRAILING_HYPHENS, '');
        }

        fileName = this.applyCase(fileName, this.config.fileNaming.case);

        return `${fileName}.${format}`;
    }

    /**
     * Genera la ruta de la carpeta.
     */
    generateFolderPath(collection, options) {
        if (!this.config.folderStructure.enabled) {
            return this.config.outputDir;
        }

        const { width, height, color = this.config.defaultColor } = options;
        const sizeString = `${width}x${height}`;

        let folderPattern = this.config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{width}', width.toString())
            .replace('{height}', height.toString())
            .replace('{size}', sizeString)
            .replace('{color}', color || 'default');

        let fullPath = path.join(this.config.outputDir, folderPattern);

        if (this.config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${sizeString}`);
        }

        if (this.config.folderStructure.groupByColor && color) {
            fullPath = path.join(fullPath, `color-${color.replace(/#/g, '')}`);
        }

        return fullPath;
    }

    /**
     * Crea el directorio de salida si no existe.
     */
    async ensureOutputDir(dirPath) {
        const targetDir = path.resolve(dirPath);
        try {
            await fs.mkdir(targetDir, { recursive: true });
        } catch (error) {
            // Manejo de error más específico para mkdir
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create directory ${targetDir}: ${error.message}`);
            }
        }
    }
    
    /**
     * Aplica color al SVG si es necesario.
     */
    applySvgColor(svgBody, color) {
        const targetColor = color || this.config.defaultColor;

        if (!FILL_ATTRIBUTE_PATTERN.test(svgBody) && targetColor) {
            // Reemplaza todas las ocurrencias de <path para forzar el color de relleno
            return svgBody.replace(/<path/g, `<path fill="${targetColor}"`);
        }
        return svgBody;
    }

    /**
     * Guarda el contenido SVG o lo convierte y guarda como imagen rasterizada.
     */
    async saveImage(svgBuffer, filePath, format, width, height) {
        if (format === 'svg') {
            await fs.writeFile(filePath, svgBuffer, "utf8");
            return;
        }

        // sharp automáticamente maneja SVG Buffer
        const image = sharp(svgBuffer);
        
        // Redimensionar para garantizar la calidad en los formatos rasterizados
        image.resize(width, height); 

        switch (format) {
            case 'png':
                // Configuración para alta calidad y compresión
                await image.png({ quality: 90, compressionLevel: 9 }).toFile(filePath);
                break;
            case 'jpeg':
                // Configuración para alta calidad
                await image.jpeg({ quality: 90 }).toFile(filePath);
                break;
            case 'webp':
                // Configuración para alta calidad
                await image.webp({ quality: 90 }).toFile(filePath);
                break;
            default:
                // Esto no debería suceder si validateConfig funciona correctamente
                throw new Error(`Formato rasterizado no soportado: ${format}`);
        }
    }
    
    /**
     * Prepara y genera el contenido SVG como un Buffer.
     */
    _prepareSvgBuffer(iconData, width, height, color) {
        const renderData = iconToSVG(iconData, {
            height: `${height}px`,
            width: `${width}px`
        });

        const processedBody = this.applySvgColor(renderData.body, color);
        const baseSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${renderData.attributes.viewBox}" width="${width}" height="${height}">${processedBody}</svg>`;
        return Buffer.from(baseSvgContent, 'utf8');
    }

    /**
     * Procesa y exporta una única variante (icono, tamaño, color) a todos los formatos.
     */
    async processVariant(data, collection, iconName, options) {
        const { width, height, color } = options;
        let successCount = 0;

        try {
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                console.warn(`⚠️ Datos no disponibles para "${iconName}" en ${collection}.`);
                return { successCount: 0, totalAttempts: this.config.outputFormats.length };
            }

            // Lógica de preparación del SVG extraída a un método auxiliar
            const svgBuffer = this._prepareSvgBuffer(iconData, width, height, color);
            
            const folderPath = this.generateFolderPath(collection, options);
            await this.ensureOutputDir(folderPath);

            // Intentar exportar a todos los formatos
            for (const format of this.config.outputFormats) {
                const fileName = this.generateFileName(collection, iconName, { ...options, format });
                const filePath = path.join(folderPath, fileName);
                
                try {
                    await this.saveImage(svgBuffer, filePath, format, width, height);
                    console.log(`✅ Exportado: ${filePath}`);
                    successCount++;
                } catch (saveError) {
                    console.error(`❌ Error al guardar ${format} para "${iconName}" (${width}x${height}, ${color}): ${saveError.message}`);
                }
            }

        } catch (error) {
            console.error(`❌ Error general al procesar la variante ${iconName}: ${error.message}`);
        }

        return { successCount, totalAttempts: this.config.outputFormats.length };
    }

    /**
     * Carga y procesa todos los iconos de todas las colecciones con variantes.
     */
    async exportWithVariants(variants = {}) {
        const startTime = Date.now();
        const { sizes = [this.config.defaultSize], colors = [this.config.defaultColor] } = variants;

        // Normalizar y validar tamaños
        const normalizedSizes = sizes.map(size => 
            (Array.isArray(size) && size.length === 2 && size.every(s => typeof s === 'number' && s > 0)) 
                ? size 
                : (typeof size === 'number' ? [size, size] : this.config.defaultSize)
        );

        let totalProcessed = 0;
        let totalErrors = 0;
        const allVariantPromises = []; // Almacena todas las promesas de procesamiento de variantes

        try {
            await this.ensureOutputDir(this.config.outputDir);

            // 1. Cargar todos los datos de colecciones en paralelo.
            const collectionLoadPromises = this.config.collections.map(collection => 
                this.loadCollectionData(collection)
                    .then(data => ({ collection, data }))
                    .catch(error => {
                        console.error(`❌ Error crítico al cargar colección ${collection}: ${error.message}`);
                        return null; // Retorna null si hay un error de carga
                    })
            );

            const loadedCollections = (await Promise.all(collectionLoadPromises)).filter(c => c !== null);

            // 2. Iterar sobre las colecciones cargadas y generar las promesas de variantes.
            for (const { collection, data } of loadedCollections) {
                const icons = this.getIconsToProcess(data);
                console.log(`\n📦 Procesando colección: ${collection} (${icons.length} iconos)`);

                for (const iconName of icons) {
                    if (!data.icons[iconName]) {
                        console.warn(`⚠️ Icono "${iconName}" no encontrado en ${collection}.`);
                        // Contabilizar los errores por los formatos que no se intentarán
                        totalErrors += normalizedSizes.length * colors.length * this.config.outputFormats.length;
                        continue;
                    }

                    for (const [width, height] of normalizedSizes) {
                        for (const color of colors) {
                            allVariantPromises.push(
                                this.processVariant(data, collection, iconName, { width, height, color }).then(result => {
                                    totalProcessed += result.successCount;
                                    totalErrors += (result.totalAttempts - result.successCount);
                                })
                            );
                        }
                    }
                }
            }
            
            // 3. Esperar a que todas las variantes terminen de procesarse.
            await Promise.all(allVariantPromises);

            this.printExportSummary(totalProcessed, totalErrors, startTime);
            return { processed: totalProcessed, errors: totalErrors };

        } catch (error) {
            console.error("❌ Error fatal en la exportación:", error.message);
            throw error;
        }
    }

    /**
     * Carga y parsea los datos de una colección de iconos.
     */
    async loadCollectionData(collection) {
        try {
            const jsonPath = locate(collection);
            if (!jsonPath) {
                throw new Error(`Ruta JSON no encontrada para "${collection}"`);
            }
            const jsonContent = await fs.readFile(jsonPath, "utf8");
            return JSON.parse(jsonContent);
        } catch (error) {
            // Re-lanzar con contexto para mejor depuración
            throw new Error(`Error cargando colección "${collection}": ${error.message}`);
        }
    }

    /**
     * Obtiene la lista de iconos a procesar.
     */
    getIconsToProcess(data) {
        return this.config.iconsToExport.length > 0
            ? this.config.iconsToExport
            : Object.keys(data.icons);
    }

    /**
     * Imprime el resumen de la exportación.
     */
    printExportSummary(processed, errors, startTime) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const total = processed + errors;

        console.log("\n📊 Resumen de exportación:");
        console.log(`   ✅ Exitosos: ${processed}`);
        console.log(`   ❌ Errores: ${errors}`);
        console.log(`   📄 Total archivos intentados: ${total}`);
        console.log(`   ⏱️  Tiempo total: ${duration}s`);
        console.log("🎉 Exportación completada!");
    }

    /**
     * Alias para exportar con solo los valores por defecto.
     */
    async exportIcons() {
        const [defaultWidth, defaultHeight] = this.config.defaultSize;
        return this.exportWithVariants({
            sizes: [[defaultWidth, defaultHeight]],
            colors: [this.config.defaultColor]
        });
    }
}

// 🚀 Funciones de utilidad para el consumidor
export function createExporter(config = {}) {
    return new IconExporter(config);
}

export async function exportIcons(config = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportIcons();
}

export async function exportIconVariants(config = {}, variants = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportWithVariants(variants);
}

// 🏃‍♂️ Ejecución directa del script para testing
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    const customConfig = {
        collections: ["nonicons", "devicon"],
        outputDir: "./output-refactored",
        defaultSize: [40, 40],
        defaultColor: "purple",
        outputFormats: ["svg", "png", "webp"], // Solo 3 formatos para esta prueba
        iconsToExport: ["nonicons:bell", "devicon:angular"],
        fileNaming: {
            pattern: "{collection}-{icon}-{width}", // Patrón simplificado
            case: "kebab"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupBySize: true,
            groupByColor: false
        }
    };

    const variants = {
        sizes: [16, [32, 32], [64, 96]], // Probar varios formatos de tamaño
        colors: ["#FF5733", "green"]
    };

    const exporter = new IconExporter(customConfig);

    // Ejecutar con variantes
    exporter.exportIconVariants(customConfig, variants).catch(error => {
        console.error("Error en ejecución directa:", error);
        process.exit(1);
    });
}
