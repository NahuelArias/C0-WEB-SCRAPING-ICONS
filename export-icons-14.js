// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
// Importaciones directas de utilidades de Iconify para la generación de SVG
import { getIconData, iconToSVG } from "@iconify/utils"; 
// Librería de alto rendimiento para procesamiento de imágenes (requerida para PNG, JPEG, WebP)
import sharp from "sharp";

// --- 1. CONFIGURACIÓN Y CONSTANTES ---

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    outputDir: "./icons", 
    defaultSize: 48,
    // Usar 'currentColor' es una buena práctica para que el SVG tome el color del CSS
    defaultColor: "currentColor", 
    // Formatos a exportar. 'svg' es siempre el formato base.
    formats: ['svg'], // Opciones válidas: 'svg', 'png', 'jpeg', 'webp'
    fileNaming: {
        pattern: "{collection}-{icon}",
        sanitize: true,
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: false,
        groupByColor: false,
        // Agrupar por formato para una organización clara
        groupByFormat: true, 
    }
});

// 🔧 Constantes
const VALID_CASE_TYPES = new Set(['camel', 'pascal', 'snake', 'kebab', 'original']);
const VALID_OUTPUT_FORMATS = new Set(['svg', 'png', 'jpeg', 'jpg', 'webp']);
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const MULTIPLE_HYPHENS = /-+/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;
// Patrón para buscar un atributo 'fill' o 'stroke' en el cuerpo del SVG
const FILL_ATTRIBUTE_PATTERN = /(fill|stroke)=("|')[^"']*("|')/; 
const CAMEL_CASE_PATTERN = /-([a-z])/g;
const PASCAL_CASE_PATTERN = /(^|-)([a-z])/g;


// --- 2. UTILIDADES DE TRANSFORMACIÓN ---

/**
 * @description Aplica transformación de caso al string.
 * @case_uso Utilizado por FileHandler para aplicar la convención de nombres de archivo (e.g., kebab-case, camelCase).
 */
function applyCase(str, caseType) {
    const toPascalCase = (s) => s.replace(PASCAL_CASE_PATTERN, (_, __, letter) => letter.toUpperCase()).replace(/-/g, '');
    const toCamelCase = (s) => s.replace(CAMEL_CASE_PATTERN, (_, letter) => letter.toUpperCase());

    const kebabStr = str.toLowerCase()
        .replace(/\s/g, '-')
        .replace(MULTIPLE_HYPHENS, '-')
        .replace(LEADING_TRAILING_HYPHENS, '');
    
    switch (caseType) {
        case 'camel': return toCamelCase(kebabStr);
        case 'pascal': return toPascalCase(kebabStr);
        case 'snake': return kebabStr.replace(/-/g, '_');
        case 'kebab': return kebabStr; 
        case 'original': return toPascalCase(kebabStr);
        default: return str;
    }
}

// --- 3. CLASE ImageConverter (RESPONSABILIDAD: Conversión de SVG a formatos de imagen) ---

/**
 * @description Maneja la conversión de Buffer SVG a otros formatos de imagen usando sharp.
 * @case_uso Usado para desacoplar la lógica de conversión binaria del proceso principal.
 */
class ImageConverter {
    /**
     * Convierte contenido SVG (string) a un Buffer del formato de imagen deseado.
     * @param {string} svgContent - El string SVG completo.
     * @param {string} format - El formato de salida ('png', 'jpeg', 'webp').
     * @param {number} size - El tamaño del icono (usado para la densidad de renderizado SVG).
     * @returns {Promise<Buffer>} Buffer de la imagen convertida.
     */
    async convert(svgContent, format, size) {
        const targetFormat = format === 'jpg' ? 'jpeg' : format;
        const svgBuffer = Buffer.from(svgContent, 'utf8');

        // Aumentamos la densidad para asegurar que sharp renderice el SVG con alta calidad al tamaño deseado
        let image = sharp(svgBuffer, { density: size * 10 }); 

        // Aplicar configuración específica para el formato
        if (targetFormat === 'png') {
            image = image.png({ compressionLevel: 9 });
        } else if (targetFormat === 'jpeg') {
            image = image.jpeg({ quality: 90 });
        } else if (targetFormat === 'webp') {
            image = image.webp({ quality: 90 });
        } else {
            throw new Error(`Formato de imagen no soportado por ImageConverter: ${format}`);
        }

        return image.toBuffer();
    }
}


// --- 4. CLASE FileHandler (RESPONSABILIDAD: Gestión del Sistema de Archivos y Nomenclatura) ---

/**
 * @description Encapsula toda la lógica de rutas, nombres de archivo y operaciones de FS (lectura/escritura).
 * @case_uso Proporciona una interfaz consistente para manejar la E/S y la estructura de directorios, manteniendo el proceso limpio.
 */
class FileHandler {
    
    /**
     * @description Sanitiza un string para uso en nombres de archivo
     */
    sanitizeString(str, config) {
        if (!config.fileNaming.sanitize) { return str; }
        return str
            .replace(INVALID_FILENAME_CHARS, '')
            .replace(/[\s]+/g, '-')
            .replace(/[^\w\-.]/g, '')
            .replace(MULTIPLE_HYPHENS, '-')
            .replace(LEADING_TRAILING_HYPHENS, '');
    }

    /**
     * @description Genera el nombre del archivo basado en el patrón configurado.
     */
    generateFileName(config, collection, iconName, options = {}) {
        const { size = config.defaultSize, color = config.defaultColor, format } = options;
        const cleanIconName = iconName; 

        let fileName = config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', cleanIconName)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default')
            .replace('{format}', format); // Patrón extendido para incluir formato

        fileName = this.sanitizeString(fileName, config);
        fileName = applyCase(fileName, config.fileNaming.case);

        return `${fileName}.${format}`;
    }

    /**
     * @description Genera la ruta completa de la carpeta de salida.
     */
    generateFolderPath(config, collection, options = {}) {
        const { size = config.defaultSize, color = config.defaultColor, format } = options;

        if (!config.folderStructure.enabled) { return config.outputDir; }

        let folderPath = config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default')
            .replace('{format}', format);

        let fullPath = path.join(config.outputDir, folderPath);

        // Opciones de agrupamiento condicional
        if (config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${size}`);
        }
        if (config.folderStructure.groupByColor && color && color !== config.defaultColor) {
            fullPath = path.join(fullPath, `color-${this.sanitizeString(color, config)}`);
        }
        if (config.folderStructure.groupByFormat && format) {
            // Agrupar por formato (e.g., /png, /svg)
            fullPath = path.join(fullPath, `${format}`); 
        }

        return fullPath;
    }

    /**
     * @description Crea el directorio de salida si no existe.
     */
    async ensureOutputDir(dirPath) {
        const targetDir = path.resolve(dirPath);
        try {
            await fs.mkdir(targetDir, { recursive: true });
        } catch (error) {
            throw new Error(`No se pudo crear el directorio ${targetDir}: ${error.message}`);
        }
    }

    /**
     * @description Escribe contenido (Buffer o String) al disco.
     */
    async writeFile(filePath, content) {
        await fs.writeFile(filePath, content);
    }
}


// --- 5. CLASE SvgProcessor (RESPONSABILIDAD: Lógica Específica de Iconify) ---

/**
 * @description Maneja la carga de datos de Iconify y el procesamiento del cuerpo SVG.
 * @case_uso Centraliza el uso directo de las librerías de Iconify para generar el contenido SVG base.
 */
class SvgProcessor {

    /**
     * @description Carga y parsea los datos de una colección de iconos.
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
     * @description Genera el contenido SVG completo (como string) usando directamente iconToSVG.
     * @returns {string} El string SVG completo.
     */
    generateSvg(data, iconName, collection, size, color) {
        const iconData = getIconData(data, iconName);
        if (!iconData) {
            throw new Error(`No se pudieron obtener datos para "${iconName}" en ${collection}`);
        }

        const targetSize = size;
        const targetColor = color || DEFAULT_CONFIG.defaultColor;

        // 1. USO DIRECTO DE ICONIFY: Generar la estructura SVG usando iconToSVG
        const renderData = iconToSVG(iconData, {
            // Pasamos las dimensiones deseadas
            height: `${targetSize}px`,
            width: `${targetSize}px`,
            // iconToSVG puede aplicar el color si es necesario, pero lo reforzamos manualmente
            // para asegurar la robustez en SVGs estáticos.
            color: targetColor 
        });

        let processedBody = renderData.body;

        // 2. REFUERZO DE COLOR: Si el cuerpo del SVG no contiene ningún atributo de color (fill o stroke),
        // inyectamos fill="targetColor" en el primer elemento <path> para asegurar que el color estático funcione.
        if (!FILL_ATTRIBUTE_PATTERN.test(processedBody) && targetColor && targetColor !== 'currentColor') {
            processedBody = processedBody.replace(/<path/g, `<path fill="${targetColor}"`);
        }

        // 3. Ensamblar el SVG final
        const { viewBox } = renderData.attributes;
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${targetSize}" height="${targetSize}">
    ${processedBody}
</svg>`;
        
        return svgContent;
    }
}


// --- 6. CLASE IconExporter (RESPONSABILIDAD: Orquestación y Bucle Principal) ---

/**
 * @description Clase principal que orquesta la carga, procesamiento y escritura de archivos.
 * @case_uso Es el punto de entrada para los usuarios, maneja la configuración, la validación y el bucle de exportación.
 */
class IconExporter {
    
    constructor(config = {}) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
        this.validateConfig();

        // Inyección de dependencias modularizada
        this.fileHandler = new FileHandler();
        this.svgProcessor = new SvgProcessor();
        this.imageConverter = new ImageConverter();
    }

    /**
     * @description Valida la configuración proporcionada.
     */
    validateConfig() {
        if (!Array.isArray(this.config.collections) || this.config.collections.length === 0) {
            throw new Error("La configuración debe incluir al menos una colección");
        }
        if (!Array.isArray(this.config.formats) || this.config.formats.length === 0) {
            throw new Error("La configuración debe incluir al menos un formato a exportar ('svg', 'png', etc.)");
        }
        for (const format of this.config.formats) {
             if (!VALID_OUTPUT_FORMATS.has(format)) {
                 throw new Error(`Formato de salida no válido: ${format}. Opciones: ${Array.from(VALID_OUTPUT_FORMATS).join(', ')}`);
             }
        }
    }

    /**
     * @description Combina configuraciones de forma profunda y recursiva.
     */
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };

        for (const [key, value] of Object.entries(userConfig)) {
            if (value && typeof value === 'object' && !Array.isArray(value) && defaultConfig[key]) {
                merged[key] = { ...defaultConfig[key], ...value };
            } else {
                merged[key] = value;
            }
        }

        return merged;
    }

    /**
     * @description Obtiene la lista de iconos a procesar.
     */
    getIconsToProcess(data) {
        return this.config.iconsToExport.length > 0
            ? this.config.iconsToExport
            : Object.keys(data.icons);
    }

    /**
     * @description Valida si un icono existe en la colección.
     */
    validateIcon(data, iconName, collection) {
        if (!data.icons[iconName]) {
            console.warn(`⚠️ Icono "${iconName}" no existe en ${collection}`);
            return false;
        }
        return true;
    }

    /**
     * @description Procesa y exporta un solo icono a todos los formatos/variantes configurados.
     * @case_uso Aquí se orquesta la generación del SVG (con SvgProcessor) y la conversión a otros formatos (con ImageConverter).
     */
    async processIcon(data, iconName, collection, options = {}) {
        const { size, color } = options;
        let successCount = 0;
        let errorCount = 0;
        let svgContent = null;
        const targetSize = size || this.config.defaultSize;

        try {
            // Generar SVG base una sola vez usando el procesador Iconify
            svgContent = this.svgProcessor.generateSvg(data, iconName, collection, targetSize, color);
        } catch (error) {
            console.error(`❌ Error al generar SVG para "${iconName}": ${error.message}`);
            errorCount = this.config.formats.length; 
            return { successCount, errorCount };
        }

        // Bucle a través de todos los formatos configurados
        for (const format of this.config.formats) {
            try {
                const folderPath = this.fileHandler.generateFolderPath(this.config, collection, { size: targetSize, color, format });
                const fileName = this.fileHandler.generateFileName(this.config, collection, iconName, { size: targetSize, color, format });
                const filePath = path.join(folderPath, fileName);
                
                await this.fileHandler.ensureOutputDir(folderPath);

                let fileContent = svgContent; 

                // Convertir si el formato no es SVG
                if (format !== 'svg') {
                    // Si no es SVG, delegamos la conversión binaria a ImageConverter (requiere sharp)
                    fileContent = await this.imageConverter.convert(svgContent, format, targetSize);
                }
                
                // Escribir el archivo
                await this.fileHandler.writeFile(filePath, fileContent);

                console.log(`✅ Exportado (${format}): ${filePath}`);
                successCount++;

            } catch (error) {
                console.error(`❌ Error exportando "${iconName}" a ${format}: ${error.message}`);
                errorCount++;
            }
        }

        return { successCount, errorCount };
    }

    /**
     * @description Procesa una colección completa con todas las variantes.
     */
    async processCollectionWithVariants(data, collection, icons, sizes, colors) {
        let processed = 0;
        let errors = 0;

        for (const iconName of icons) {
            if (!this.validateIcon(data, iconName, collection)) {
                errors += sizes.length * colors.length * this.config.formats.length;
                continue;
            }

            for (const size of sizes) {
                for (const color of colors) {
                    const result = await this.processIcon(data, iconName, collection, { size, color });
                    processed += result.successCount;
                    errors += result.errorCount;
                }
            }
        }

        return { processed, errors };
    }

    /**
     * @description Exporta iconos con múltiples variantes (tamaños, colores) y formatos.
     */
    async exportWithVariants(variants = {}) {
        const { sizes = [this.config.defaultSize], colors = [this.config.defaultColor] } = variants;
        const startTime = Date.now();

        try {
            await this.fileHandler.ensureOutputDir(this.config.outputDir);

            let totalProcessed = 0;
            let totalErrors = 0;

            for (const collection of this.config.collections) {
                console.log(`\n📦 Procesando colección: ${collection}`);

                const data = await this.svgProcessor.loadCollectionData(collection);
                const icons = this.getIconsToProcess(data);

                const collectionResults = await this.processCollectionWithVariants(
                    data, collection, icons, sizes, colors
                );
                
                totalProcessed += collectionResults.processed;
                totalErrors += collectionResults.errors;

                const totalVariants = icons.length * sizes.length * colors.length * this.config.formats.length;
                console.log(`   Variantes a procesar: ${totalVariants}`);
            }

            this.printExportSummary(totalProcessed, totalErrors, startTime);
            return { processed: totalProcessed, errors: totalErrors };

        } catch (error) {
            console.error("❌ Error fatal en la exportación:", error.message);
            throw error;
        }
    }

    /**
     * @description Imprime el resumen de la exportación.
     */
    printExportSummary(processed, errors, startTime) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const total = processed + errors;

        console.log("\n📊 Resumen de exportación:");
        console.log(`   ✅ Exitosos: ${processed}`);
        console.log(`   ❌ Errores: ${errors}`);
        console.log(`   📄 Total variantes/formatos: ${total}`);
        console.log(`   ⏱️ Tiempo: ${duration}s`);
        console.log("🎉 Exportación completada!");
    }

    /**
     * @description Exporta todos los iconos de todas las colecciones con la configuración base.
     */
    async exportIcons() {
        return this.exportWithVariants();
    }
}

// --- 7. EXPORTACIONES Y EJECUCIÓN ---

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

// 🏃‍♂️ Ejecución directa del script para testing
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    const customConfig = {
        collections: ["simple-icons"], 
        outputDir: "./dist/iconify_exports",
        defaultSize: 32,
        defaultColor: "#1d9bf0", 
        iconsToExport: ["twitter", "github", "linkedin", "youtube"],
        // CASO DE USO: Exportar el mismo icono en SVG, PNG, WebP y JPEG.
        formats: ['svg', 'png', 'webp', 'jpeg'], 
        fileNaming: {
            pattern: "{icon}-{size}",
            case: "kebab"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupBySize: true,
            groupByColor: false,
            groupByFormat: true,
        }
    };

    const variants = {
        sizes: [16, 32, 64],
        colors: ["#1d9bf0", "black"]
    };

    const exporter = new IconExporter(customConfig);
    exporter.exportWithVariants(variants).catch(error => {
        console.error("Error en ejecución directa:", error);
        process.exit(1);
    });
}
