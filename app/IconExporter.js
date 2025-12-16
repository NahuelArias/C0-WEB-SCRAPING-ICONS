// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";
import { SIZE_PRESETS, validateSizes, getSizePreset } from "./sizeConfig.js";
import { generateRectangularSVG, processSvgBodyForRectangular } from "./svgUtils.js";

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "red",
    // NUEVO: Configuración de tamaños
    sizePreset: "SQUARE", // SQUARE, RECTANGULAR, MOBILE, SOCIAL_MEDIA
    customSizes: null, // Array personalizado de tamaños
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
        groupByColor: false,
        // NUEVO: Agrupar por tipo de tamaño
        groupBySizeType: false
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
        this.setupSizes();
    }

    /**
     * Configura los tamaños basados en la configuración
     */
    setupSizes() {
        if (this.config.customSizes) {
            this.sizes = this.config.customSizes;
            this.sizeType = validateSizes(this.sizes);
        } else {
            const preset = getSizePreset(this.config.sizePreset);
            this.sizes = preset.sizes;
            this.sizeType = this.getSizeType(this.sizes);
        }
    }

    /**
     * Determina si una configuración de tamaño es cuadrada o rectangular
     */
    getSizeType(sizes) {
        if (!Array.isArray(sizes) || sizes.length === 0) {
            return 'unknown';
        }
        
        const firstSize = sizes[0];
        
        // Si es un número, es cuadrado
        if (typeof firstSize === 'number') {
            return 'square';
        }
        
        // Si es un objeto con width y height, es rectangular
        if (typeof firstSize === 'object' && firstSize.width && firstSize.height) {
            return 'rectangular';
        }
        
        return 'unknown';
    }

    /**
     * Valida la configuración proporcionada
     */
    validateConfig() {
        if (!Array.isArray(this.config.collections) || this.config.collections.length === 0) {
            throw new Error("La configuración debe incluir al menos una colección");
        }

        if (typeof this.config.outputDir !== 'string' || this.config.outputDir.trim() === '') {
            throw new Error("El directorio de salida debe ser una cadena no vacía");
        }

        if (!VALID_CASE_TYPES.has(this.config.fileNaming.case)) {
            throw new Error(`Tipo de caso no válido: ${this.config.fileNaming.case}`);
        }

        // Validar tamaños personalizados si se proporcionan
        if (this.config.customSizes) {
            validateSizes(this.config.customSizes);
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
        const { 
            size = this.config.defaultSize, 
            color = this.config.defaultColor,
            sizeType = this.sizeType 
        } = options;
        
        const cleanIconName = this.removeHyphensAndNumbersFromIconName(iconName);

        let fileName = this.config.fileNaming.pattern
            .replace('{collection}', collection)
            .replace('{icon}', cleanIconName)
            .replace('{color}', color || 'default');

        // Manejar diferentes formatos de tamaño
        if (sizeType === 'square') {
            fileName = fileName.replace('{size}', size.toString());
        } else if (sizeType === 'rectangular') {
            fileName = fileName.replace('{size}', `${size.width}x${size.height}`);
        }

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

        const { 
            size = this.config.defaultSize, 
            color = this.config.defaultColor,
            sizeType = this.sizeType 
        } = options;

        let folderPath = this.config.folderStructure.pattern
            .replace('{collection}', collection)
            .replace('{color}', color || 'default');

        // Manejar diferentes formatos de tamaño en la ruta
        if (sizeType === 'square') {
            folderPath = folderPath.replace('{size}', size.toString());
        } else if (sizeType === 'rectangular') {
            folderPath = folderPath.replace('{size}', `${size.width}x${size.height}`);
        }

        let fullPath = path.join(this.config.outputDir, folderPath);

        if (this.config.folderStructure.groupBySize) {
            if (sizeType === 'square') {
                fullPath = path.join(fullPath, `size-${size}`);
            } else if (sizeType === 'rectangular') {
                fullPath = path.join(fullPath, `size-${size.width}x${size.height}`);
            }
        }

        if (this.config.folderStructure.groupBySizeType) {
            fullPath = path.join(fullPath, sizeType);
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
    generateSvgContent(renderData, processedBody, size = null, sizeType = 'square') {
        const targetSize = size || this.config.defaultSize;

        if (sizeType === 'square') {
            const { viewBox } = renderData.attributes;
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${targetSize}" height="${targetSize}">
    ${processedBody}
</svg>`;
        } else if (sizeType === 'rectangular') {
            const { width, height } = targetSize;
            const rectangularData = processSvgBodyForRectangular(renderData, width, height);
            return generateRectangularSVG(rectangularData, processedBody, width, height);
        }
    }

    /**
     * Procesa un solo icono con opciones personalizadas
     */
    async processIcon(data, iconName, collection, options = {}) {
        const { size, color, sizeType = this.sizeType } = options;

        try {
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
                return false;
            }

            const targetSize = size || this.config.defaultSize;

            // Configurar dimensiones para iconToSVG
            let renderOptions = {};
            if (sizeType === 'square') {
                renderOptions = {
                    height: `${targetSize}px`,
                    width: `${targetSize}px`
                };
            } else if (sizeType === 'rectangular') {
                renderOptions = {
                    height: `${targetSize.height}px`,
                    width: `${targetSize.width}px`
                };
            }

            const renderData = iconToSVG(iconData, renderOptions);
            const processedBody = this.applySvgColor(renderData.body, color);
            const svgContent = this.generateSvgContent(renderData, processedBody, targetSize, sizeType);

            const folderPath = this.generateFolderPath(collection, { 
                size: targetSize, 
                color,
                sizeType 
            });
            const fileName = this.generateFileName(collection, iconName, { 
                size: targetSize, 
                color,
                sizeType 
            });
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
            console.log(`📏 Tipo de tamaños: ${this.sizeType}`);

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
        const { 
            sizes = this.sizes, 
            colors = [this.config.defaultColor],
            sizeType = this.sizeType 
        } = variants;
        
        const startTime = Date.now();

        try {
            await this.ensureOutputDir();

            let totalProcessed = 0;
            let totalErrors = 0;

            for (const collection of this.config.collections) {
                console.log(`📦 Procesando colección: ${collection}`);
                console.log(`📏 Tipo de tamaños: ${sizeType}`);

                const data = await this.loadCollectionData(collection);
                const icons = this.getIconsToProcess(data);

                const collectionResults = await this.processCollectionWithVariants(
                    data, collection, icons, sizes, colors, sizeType
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
    async processCollectionWithVariants(data, collection, icons, sizes, colors, sizeType) {
        let processed = 0;
        let errors = 0;

        for (const iconName of icons) {
            if (!this.validateIcon(data, iconName, collection)) {
                errors += sizes.length * colors.length;
                continue;
            }

            for (const size of sizes) {
                for (const color of colors) {
                    const success = await this.processIcon(data, iconName, collection, { 
                        size, 
                        color,
                        sizeType 
                    });
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
        outputDir: "./icons/iconify",
        defaultSize: 64,
        defaultColor: "",
        sizePreset: "SQUARE",
        iconsToExport: [],
        fileNaming: {
            pattern: "{icon}-{size}",
            case: "original"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupBySize: true,
            groupByColor: false,
            groupBySizeType: true
        }
    };

    const exporter = new IconExporter(customConfig);
    exporter.exportIcons().catch(error => {
        console.error("Error en ejecución directa:", error);
        process.exit(1);
    });
}