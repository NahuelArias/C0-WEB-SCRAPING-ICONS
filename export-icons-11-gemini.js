// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
// MODIFICACIÓN: Separar las utilidades de Iconify para mayor claridad
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";
import sharp from "sharp";

// ⚙️ Constantes y Configuración (Mantenerlas fuera de la clase simplifica el código)
const VALID_CASE_TYPES = new Set(['camel', 'pascal', 'snake', 'kebab', 'original']);
const VALID_EXPORT_FORMATS = new Set(['svg', 'png', 'jpeg', 'webp']);
const INVALID_CHARS = /[<>:"/\\|?*]/g;
const HYPHEN_PATTERNS = {
    MULTIPLE: /-+/g,
    LEADING_TRAILING: /^-+|-+$/g
};
const CASE_PATTERNS = {
    CAMEL: /-([a-z])/g,
    PASCAL: /(^|-)([a-z])/g,
};

const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "red",
    fileNaming: {
        pattern: "{collection}-{icon}",
        sanitize: true,
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: false,
        groupByColor: false
    },
    exportFormats: ['svg', 'png', 'jpeg', 'webp']
});

// 🛠️ Funciones de utilidad externas (Simplifican la clase principal)

/**
 * Convierte un string en PascalCase.
 */
const toPascalCase = (str) => str
    .replace(CASE_PATTERNS.PASCAL, (_, __, letter) => letter.toUpperCase())
    .replace(/-/g, '');

/**
 * Convierte un string en camelCase.
 */
const toCamelCase = (str) => str.replace(CASE_PATTERNS.CAMEL, (_, letter) => letter.toUpperCase());

/**
 * Normaliza y aplica la convención de nombres.
 */
const applyCase = (str, caseType) => {
    const kebabStr = str.toLowerCase()
        .replace(/\s/g, '-')
        .replace(HYPHEN_PATTERNS.MULTIPLE, '-')
        .replace(HYPHEN_PATTERNS.LEADING_TRAILING, '');

    switch (caseType) {
        case 'camel': return toCamelCase(kebabStr);
        case 'pascal': return toPascalCase(kebabStr);
        case 'snake': return kebabStr.replace(/-/g, '_');
        case 'kebab': return kebabStr;
        case 'original': return toPascalCase(kebabStr);
        default: return str;
    }
};

/**
 * Sanitiza un string para uso en nombres de archivo.
 */
const sanitizeString = (str) => str
    .replace(INVALID_CHARS, '')
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\-.]/g, '')
    .replace(HYPHEN_PATTERNS.MULTIPLE, '-')
    .replace(HYPHEN_PATTERNS.LEADING_TRAILING, '');


// 🎯 Clase para manejar la exportación de iconos (Simplificada)
class IconExporter {
    constructor(config = {}) {
        this.config = this._mergeConfig(DEFAULT_CONFIG, config);
        this._validateConfig();
    }

    // --- Métodos Privados de Utilidad y Configuración (Comienzan con _) ---

    _mergeConfig(defaultConfig, userConfig) {
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

    _validateConfig() {
        if (!this.config.collections?.length) {
            throw new Error("La configuración debe incluir al menos una colección");
        }
        if (!VALID_CASE_TYPES.has(this.config.fileNaming.case)) {
            throw new Error(`Tipo de caso no válido: ${this.config.fileNaming.case}`);
        }

        // Filtrar y validar formatos de manera concisa
        this.config.exportFormats = this.config.exportFormats.filter(format => {
            const isValid = VALID_EXPORT_FORMATS.has(format);
            if (!isValid) {
                console.warn(`⚠️  Formato no soportado, se ignorará: ${format}.`);
            } else if (format !== 'svg' && typeof sharp === 'undefined') {
                console.warn(`⚠️  El formato ${format.toUpperCase()} requiere la librería 'sharp'.`);
            }
            return isValid;
        });

        if (this.config.exportFormats.length === 0) {
            throw new Error("No se especificó ningún formato de exportación válido.");
        }
    }

    async _loadCollectionData(collection) {
        try {
            const jsonPath = locate(collection);
            if (!jsonPath) throw new Error(`Colección "${collection}" no encontrada`);
            const jsonContent = await fs.readFile(jsonPath, "utf8");
            return JSON.parse(jsonContent);
        } catch (error) {
            throw new Error(`Error cargando colección "${collection}": ${error.message}`);
        }
    }

    async _ensureOutputDir(dirPath) {
        const targetDir = path.resolve(dirPath || this.config.outputDir);
        try {
            await fs.mkdir(targetDir, { recursive: true });
        } catch (error) {
            throw new Error(`No se pudo crear el directorio ${targetDir}: ${error.message}`);
        }
    }

    _generateBaseFileName(collection, iconName, { size, color }) {
        const cleanIconName = iconName.replace(/-/g, '').replace(/\d/g, ''); // Simplificación de nombre

        let fileName = this.config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', cleanIconName)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default');

        if (this.config.fileNaming.sanitize) {
            fileName = sanitizeString(fileName);
        }
        return applyCase(fileName, this.config.fileNaming.case);
    }

    _generateFolderPath(collection, { size, color }) {
        if (!this.config.folderStructure.enabled) {
            return this.config.outputDir;
        }

        let folderPath = this.config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default');

        let fullPath = path.join(this.config.outputDir, folderPath);

        if (this.config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${size}`);
        }
        if (this.config.folderStructure.groupByColor && color) {
            fullPath = path.join(fullPath, `color-${sanitizeString(color)}`);
        }
        return fullPath;
    }

    _generateSvgContent(iconData, size, color) {
        const renderData = iconToSVG(iconData, {
            height: `${size}px`,
            width: `${size}px`
        });

        let processedBody = renderData.body;
        const targetColor = color || this.config.defaultColor;

        // Aplicar color solo si es necesario y si el SVG no lo define
        if (!renderData.body.includes('fill=') && targetColor) {
            processedBody = processedBody.replace(/<path/g, `<path fill="${targetColor}"`);
        }

        const { viewBox } = renderData.attributes;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">
    ${processedBody}
</svg>`;
    }

    // --- Lógica de Procesamiento y Guardado (Simplificada) ---

    async _saveRasterFile(filePath, svgContent, format, size) {
        if (typeof sharp === 'undefined') return false;

        try {
            let image = sharp(Buffer.from(svgContent)).resize(size, size);

            if (format === 'png') image = image.png();
            else if (format === 'jpeg') image = image.jpeg({ quality: 90 });
            else if (format === 'webp') image = image.webp({ quality: 90 });

            await image.toFile(filePath);
            return true;
        } catch (error) {
            console.error(`❌ Falló la conversión a ${format.toUpperCase()} para ${path.basename(filePath)}: ${error.message}`);
            return false;
        }
    }

    async _saveIconFile(baseFileName, folderPath, svgContent, format, size) {
        const filePath = path.join(folderPath, `${baseFileName}.${format}`);
        await this._ensureOutputDir(folderPath);

        if (format === 'svg') {
            await fs.writeFile(filePath, svgContent, "utf8");
            console.log(`✅ Exportado: ${filePath}`);
            return true;
        }

        const success = await this._saveRasterFile(filePath, svgContent, format, size);
        if (success) {
            console.log(`✅ Exportado: ${filePath}`);
        }
        return success;
    }

    async _processIcon(data, collection, iconName, { size, color }) {
        const iconData = getIconData(data, iconName);
        if (!iconData) {
            console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
            return 0; // 0 archivos procesados
        }

        const targetSize = size || this.config.defaultSize;
        const svgContent = this._generateSvgContent(iconData, targetSize, color);
        const folderPath = this._generateFolderPath(collection, { size: targetSize, color });
        const baseFileName = this._generateBaseFileName(collection, iconName, { size: targetSize, color });

        let successCount = 0;

        // Usamos un loop simple para manejar el async/await
        for (const format of this.config.exportFormats) {
            const success = await this._saveIconFile(baseFileName, folderPath, svgContent, format, targetSize);
            if (success) successCount++;
        }

        return successCount;
    }

    async _processCollectionWithVariants(data, collection, icons, sizes, colors) {
        let processed = 0;
        let errors = 0;

        for (const iconName of icons) {
            if (!data.icons[iconName]) {
                console.warn(`⚠️  Icono "${iconName}" no existe en ${collection}`);
                errors += (sizes.length * colors.length * this.config.exportFormats.length);
                continue;
            }

            for (const size of sizes) {
                for (const color of colors) {
                    const successCount = await this._processIcon(data, collection, iconName, { size, color });
                    processed += successCount;
                    errors += (this.config.exportFormats.length - successCount);
                }
            }
        }

        return { processed, errors };
    }


    // --- Métodos Públicos (Interfaz del Usuario) ---

    async exportIcons(variants = {}) {
        const { sizes = [this.config.defaultSize], colors = [this.config.defaultColor] } = variants;
        const startTime = Date.now();

        try {
            await this._ensureOutputDir();

            let totalProcessed = 0;
            let totalErrors = 0;
            const numFormats = this.config.exportFormats.length;

            for (const collection of this.config.collections) {
                console.log(`\n📦 Procesando colección: ${collection}`);

                const data = await this._loadCollectionData(collection);
                const icons = this.config.iconsToExport.length ? this.config.iconsToExport : Object.keys(data.icons);

                const results = await this._processCollectionWithVariants(data, collection, icons, sizes, colors);

                totalProcessed += results.processed;
                totalErrors += results.errors;

                const totalIconsAndVariants = (icons.length * sizes.length * colors.length * numFormats);
                console.log(`   ${icons.length} iconos × ${sizes.length} tamaños × ${colors.length} colores × ${numFormats} formatos`);

                this._printExportSummary(totalProcessed, totalErrors, totalIconsAndVariants, startTime);
            }

            return { processed: totalProcessed, errors: totalErrors };

        } catch (error) {
            console.error("❌ Error fatal en la exportación:", error.message);
            throw error;
        }
    }

    _printExportSummary(processed, errors, totalIconsAndVariants, startTime) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n📊 Resumen de exportación:");
        console.log(`   ✅ Archivos Exitosos: ${processed}`);
        console.log(`   ❌ Archivos con Errores: ${errors}`);
        console.log(`   📄 Total Archivos intentados: ${totalIconsAndVariants}`);
        console.log(`   ⏱️  Tiempo: ${duration}s`);
        console.log("🎉 Exportación completada!");
    }
}

// 🚀 Funciones de utilidad para exportar
export function createExporter(config = {}) {
    return new IconExporter(config);
}

export async function exportIcons(config = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportIcons();
}

export async function exportIconVariants(config = {}, variants = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportIcons(variants);
}

// 🏃‍♂️ Ejecución directa del script (Sin cambios estructurales)
// Este bloque verifica si el archivo se está ejecutando directamente desde Node.js.
// Es el punto de entrada para realizar una exportación de prueba o predefinida.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {

    // Define la configuración personalizada para la ejecución actual.
    const customConfig = {

        // 📚 COLECCIONES
        // Especifica qué colecciones de Iconify se deben descargar y procesar.
        collections: ["nonicons"],
        // Caso de Uso: Procesar múltiples colecciones a la vez:
        // collections: ["mdi", "tabler"], 

        // 📁 DIRECTORIO DE SALIDA
        // **IMPORTANTE**: La ruta es absoluta. El código la resolverá correctamente.
        outputDir: "D:/Usuarios/Nacho/OneDrive/Imágenes/icons/iconify",
        // Caso de Uso: Usar una ruta relativa para portabilidad:
        // outputDir: "./assets/iconos_web", 

        // 📏 TAMAÑO Y COLOR POR DEFECTO
        // Tamaño base para todos los iconos, a menos que se usen variantes.
        defaultSize: 32,
        // Color por defecto. Dejarlo vacío o en null mantendrá el color original (o 'currentColor').
        defaultColor: "",
        // Caso de Uso: Usar un color específico (útil para iconos monocromáticos):
        // defaultColor: "#007BFF", // Azul para todos los iconos

        // 🖼️ ICONOS A EXPORTAR
        // Lista de nombres de iconos específicos a procesar.
        iconsToExport: [],
        // Caso de Uso 1: Exportar iconos específicos para una sección de la web:
        // iconsToExport: ["home", "settings", "user-circle"], 
        // Caso de Uso 2: Lista vacía procesa **TODOS** los iconos de las colecciones especificadas.

        // 💾 FORMATOS DE ARCHIVO
        // Formatos a generar para cada icono. Requiere la librería 'sharp' para PNG/JPEG/WebP.
        exportFormats: ['svg', 'png', 'jpeg'],
        // Caso de Uso: Exportar solo el formato vectorial SVG:
        // exportFormats: ['svg'], 
        // Caso de Uso: Agregar WebP para optimización web:
        // exportFormats: ['svg', 'png', 'webp'], 

        // 📝 NOMENCLATURA DE ARCHIVO
        fileNaming: {
            // Define el patrón del nombre del archivo (ej. "home-32.svg").
            pattern: "{icon}-{size}",
            // Convención de nombres. 'kebab' (home-icon), 'camel' (homeIcon), 'pascal' (HomeIcon), 'snake' (home_icon).
            case: "kebab"
            // Caso de Uso: Nombrar en PascalCase para importar como componentes en React/Vue:
            // case: "pascal", 
            // Caso de Uso: Incluir la colección y el color en el nombre:
            // pattern: "{collection}/{icon}-{color}-{size}", 
        },

        // 📂 ESTRUCTURA DE CARPETAS
        folderStructure: {
            // Si es 'true', crea la estructura de subcarpetas definida por 'pattern', 'groupBySize', etc.
            enabled: true,
            // Patrón de la carpeta raíz dentro del outputDir (ej. "icons/nonicons/...").
            pattern: "{collection}",
            // Si es 'true', crea una subcarpeta adicional para cada tamaño (ej. "/nonicons/size-32/").
            groupBySize: true,
            // Si es 'true' y se especifica un color, crea subcarpetas por color.
            groupByColor: false
            // Caso de Uso: Exportación plana (todos los archivos en un solo directorio):
            // enabled: false, 
            // Caso de Uso: Agrupar por color (si se usa la exportación con variantes de color):
            // groupBySize: false, groupByColor: true 
        }
    };

    // Crea una nueva instancia del exportador con la configuración definida.
    const exporter = new IconExporter(customConfig);

    // Inicia el proceso de exportación y maneja cualquier error que ocurra durante la ejecución.
    exporter.exportIcons().catch(error => {
        console.error("Error en ejecución directa:", error);
        // Termina el proceso indicando un fallo (código de salida 1).
        process.exit(1);
    });
}