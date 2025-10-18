// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    // MODIFICACIÓN: Ruta de salida por defecto más clara
    // Usamos './icons' como se definió originalmente, pero en un contexto de build,
    // es común usar algo como './dist/icons' o './output'. Mantenemos './icons' por coherencia.
    outputDir: "./icons", 
    defaultSize: 48,
    defaultColor: "red",
    fileNaming: {
        pattern: "{collection}-{icon}",
        extension: "svg",
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

// 🔧 Constantes
const VALID_CASE_TYPES = new Set(['camel', 'pascal', 'snake', 'kebab', 'original']);
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
     * Valida la configuración proporcionada
     */
    validateConfig() {
        if (!Array.isArray(this.config.collections) || this.config.collections.length === 0) {
            throw new Error("La configuración debe incluir al menos una colección");
        }

        // Aunque mergeConfig asegura que haya un valor, esta validación es buena.
        if (typeof this.config.outputDir !== 'string' || this.config.outputDir.trim() === '') {
            throw new Error("El directorio de salida debe ser una cadena no vacía");
        }

        if (!VALID_CASE_TYPES.has(this.config.fileNaming.case)) {
            throw new Error(`Tipo de caso no válido: ${this.config.fileNaming.case}`);
        }
    }

    /**
     * Combina configuraciones de forma profunda
     */
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };

        for (const [key, value] of Object.entries(userConfig)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                merged[key] = { ...defaultConfig[key], ...value };
            } else {
                merged[key] = value;
            }
        }

        return merged;
    }

    /**
     * Sanitiza un string para uso en nombres de archivo
     */
    sanitizeString(str) {
        if (!this.config.fileNaming.sanitize) {
            return str;
        }

        return str
            .replace(INVALID_FILENAME_CHARS, '')
            .replace(/[\s]+/g, '-')
            .replace(/[^\w\-.]/g, '')
            .replace(MULTIPLE_HYPHENS, '-')
            .replace(LEADING_TRAILING_HYPHENS, '');
    }

    /**
     * Elimina guiones medios y números del nombre del icono
     */
    removeHyphensAndNumbersFromIconName(iconName) {
        return iconName.replace(/-/g, '').replace(/\d/g, '');
    }
    
    /**
     * Convierte un string a PascalCase (desde kebab-case).
     * @param {string} str - El string en kebab-case.
     */
    toPascalCase(str) {
        return str
            .replace(PASCAL_CASE_PATTERN, (_, __, letter) => letter.toUpperCase())
            .replace(/-/g, '');
    }

    /**
     * Convierte un string a camelCase (desde kebab-case).
     * @param {string} str - El string en kebab-case.
     */
    toCamelCase(str) {
        return str.replace(CAMEL_CASE_PATTERN, (_, letter) => letter.toUpperCase());
    }

    /**
     * Aplica transformación de caso al string
     */
    applyCase(str, caseType) {
        // 1. Estandarizar la entrada a kebab-case limpio para la consistencia de la conversión
        const kebabStr = str.toLowerCase()
            .replace(/\s/g, '-')
            .replace(MULTIPLE_HYPHENS, '-')
            .replace(LEADING_TRAILING_HYPHENS, '');
        
        switch (caseType) {
            case 'camel':
                return this.toCamelCase(kebabStr);
            case 'pascal':
                return this.toPascalCase(kebabStr);
            case 'snake':
                return kebabStr.replace(/-/g, '_');
            case 'kebab':
                return kebabStr; 
            case 'original':
                return this.toPascalCase(kebabStr);
            default:
                return str;
        }
    }

    /**
     * Genera el nombre del archivo basado en el patrón configurado
     */
    generateFileName(collection, iconName, options = {}) {
        const { size = this.config.defaultSize, color = this.config.defaultColor } = options;
        const cleanIconName = this.removeHyphensAndNumbersFromIconName(iconName);

        let fileName = this.config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', cleanIconName)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default');

        fileName = this.sanitizeString(fileName);
        fileName = this.applyCase(fileName, this.config.fileNaming.case);

        return `${fileName}.${this.config.fileNaming.extension}`;
    }

    /**
     * Genera la ruta de la carpeta basada en el patrón configurado
     */
    generateFolderPath(collection, options = {}) {
        if (!this.config.folderStructure.enabled) {
            return this.config.outputDir;
        }

        const { size = this.config.defaultSize, color = this.config.defaultColor } = options;

        let folderPath = this.config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{size}', size.toString())
            .replace('{color}', color || 'default');

        let fullPath = path.join(this.config.outputDir, folderPath);

        if (this.config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${size}`);
        }

        if (this.config.folderStructure.groupByColor && color) {
            fullPath = path.join(fullPath, `color-${this.sanitizeString(color)}`);
        }

        return fullPath;
    }

    /**
     * Crea el directorio de salida si no existe
     */
    async ensureOutputDir(dirPath = null) {
        // MODIFICACIÓN: Usamos path.resolve() para obtener la ruta absoluta
        const targetDir = path.resolve(dirPath || this.config.outputDir);

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

        if (!FILL_ATTRIBUTE_PATTERN.test(svgBody) && targetColor) {
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
     * Procesa un solo icono con opciones personalizadas
     */
    async processIcon(data, iconName, collection, options = {}) {
        const { size, color } = options;

        try {
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
                return false;
            }

            const targetSize = size || this.config.defaultSize;

            const renderData = iconToSVG(iconData, {
                height: `${targetSize}px`,
                width: `${targetSize}px`
            });

            const processedBody = this.applySvgColor(renderData.body, color);
            const svgContent = this.generateSvgContent(renderData, processedBody, targetSize);

            const folderPath = this.generateFolderPath(collection, { size: targetSize, color });
            const fileName = this.generateFileName(collection, iconName, { size: targetSize, color });
            const filePath = path.join(folderPath, fileName);

            await this.ensureOutputDir(folderPath);
            await fs.writeFile(filePath, svgContent, "utf8");
            
            console.log(`✅ Exportado: ${filePath}`);
            return true;
        } catch (error) {
            console.error(`❌ Error procesando icono "${iconName}": ${error.message}`);
            return false;
        }
    }

    /**
     * Procesa todos los iconos de una colección
     */
    async processCollection(collection) {
        try {
            const data = await this.loadCollectionData(collection);
            const icons = this.getIconsToProcess(data);

            let processedCount = 0;
            let errorCount = 0;

            console.log(`📁 Estructura de carpetas: ${this.config.folderStructure.enabled ? 'Habilitada' : 'Deshabilitada'}`);
            console.log(`📝 Patrón de nombres: ${this.config.fileNaming.pattern}`);

            for (const iconName of icons) {
                if (!this.validateIcon(data, iconName, collection)) {
                    errorCount++;
                    continue;
                }

                const success = await this.processIcon(data, iconName, collection);
                if (success) {
                    processedCount++;
                } else {
                    errorCount++;
                }
            }

            return { processedCount, errorCount, total: icons.length };
        } catch (error) {
            console.error(`❌ Error en colección "${collection}": ${error.message}`);
            return { processedCount: 0, errorCount: 1, total: 0 };
        }
    }

    /**
     * Exporta iconos con múltiples variantes (tamaños, colores)
     */
    async exportWithVariants(variants = {}) {
        const { sizes = [this.config.defaultSize], colors = [this.config.defaultColor] } = variants;
        const startTime = Date.now();

        try {
            await this.ensureOutputDir();

            let totalProcessed = 0;
            let totalErrors = 0;

            for (const collection of this.config.collections) {
                console.log(`📦 Procesando colección: ${collection}`);

                const data = await this.loadCollectionData(collection);
                const icons = this.getIconsToProcess(data);

                const collectionResults = await this.processCollectionWithVariants(
                    data, collection, icons, sizes, colors
                );
                
                totalProcessed += collectionResults.processed;
                totalErrors += collectionResults.errors;

                console.log(`   ${icons.length} iconos × ${sizes.length} tamaños × ${colors.length} colores`);
            }

            this.printExportSummary(totalProcessed, totalErrors, startTime);
            return { processed: totalProcessed, errors: totalErrors };

        } catch (error) {
            console.error("❌ Error fatal:", error.message);
            throw error;
        }
    }

    /**
     * Procesa una colección con todas las variantes
     */
    async processCollectionWithVariants(data, collection, icons, sizes, colors) {
        let processed = 0;
        let errors = 0;

        for (const iconName of icons) {
            if (!this.validateIcon(data, iconName, collection)) {
                errors += sizes.length * colors.length;
                continue;
            }

            for (const size of sizes) {
                for (const color of colors) {
                    const success = await this.processIcon(data, iconName, collection, { size, color });
                    if (success) {
                        processed++;
                    } else {
                        errors++;
                    }
                }
            }
        }

        return { processed, errors };
    }

    /**
     * Imprime el resumen de la exportación
     */
    printExportSummary(processed, errors, startTime) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const total = processed + errors;

        console.log("\n📊 Resumen de exportación:");
        console.log(`   ✅ Exitosos: ${processed}`);
        console.log(`   ❌ Errores: ${errors}`);
        console.log(`   📄 Total variantes: ${total}`);
        console.log(`   ⏱️  Tiempo: ${duration}s`);
        console.log("🎉 Exportación completada!");
    }

    /**
     * Exporta todos los iconos de todas las colecciones
     */
    async exportIcons() {
        return this.exportWithVariants();
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

// 🏃‍♂️ Ejecución directa del script
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    const customConfig = {
        collections: ["nonicons", "devicon", "file-icons", "skill-icons", "vscode-icons", "material-icon-theme"],
        outputDir: "D:/Usuarios/Nacho/OneDrive/Imágenes/icons/iconify",
        defaultSize: 64,
        defaultColor: "#22918b",
        iconsToExport: [],
        fileNaming: {
            pattern: "{icon}-{size}",
            case: "original"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupBySize: true,
            groupByColor: false
        }
    };

    const exporter = new IconExporter(customConfig);
    exporter.exportIcons().catch(error => {
        console.error("Error en ejecución directa:", error);
        process.exit(1);
    });
}