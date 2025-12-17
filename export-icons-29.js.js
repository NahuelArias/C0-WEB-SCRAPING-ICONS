// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getIconData, iconToSVG } from "@iconify/utils";
import { locate } from "@iconify/json";
import sharp from "sharp";

// Para manejar __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CONFIGURACIÓN Y CONSTANTES ---

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = Object.freeze({
    collections: [],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "currentColor",
    formats: ['svg'],
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
        groupByFormat: true,
    }
});

// 🔧 Constantes
const VALID_CASE_TYPES = new Set(['camel', 'pascal', 'snake', 'kebab', 'original']);
const VALID_OUTPUT_FORMATS = new Set(['svg', 'png', 'jpeg', 'jpg', 'webp']);
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const MULTIPLE_HYPHENS = /-+/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;
const FILL_ATTRIBUTE_PATTERN = /(fill|stroke)=("|')[^"']*("|')/;
const CAMEL_CASE_PATTERN = /-([a-z])/g;
const PASCAL_CASE_PATTERN = /(^|-)([a-z])/g;

// --- 2. UTILIDADES DE TRANSFORMACIÓN ---

function applyCase(str, caseType) {
    if (caseType === 'original') return str;
    
    const toPascalCase = (s) => s.replace(PASCAL_CASE_PATTERN, (_, __, letter) => letter.toUpperCase()).replace(/-/g, '');
    const toCamelCase = (s) => {
        const pascal = toPascalCase(s);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    };

    // Primero sanitizamos a kebab-case base
    const kebabStr = str
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(MULTIPLE_HYPHENS, '-')
        .replace(LEADING_TRAILING_HYPHENS, '');

    switch (caseType) {
        case 'camel': return toCamelCase(kebabStr);
        case 'pascal': return toPascalCase(kebabStr);
        case 'snake': return kebabStr.replace(/-/g, '_');
        case 'kebab': return kebabStr;
        default: return str;
    }
}

// --- 3. CLASE ImageConverter ---

class ImageConverter {
    async convert(svgContent, format, size) {
        const targetFormat = format === 'jpg' ? 'jpeg' : format;
        
        try {
            const image = sharp(Buffer.from(svgContent), {
                density: Math.max(size * 2, 72) // Densidad más razonable
            });

            switch (targetFormat) {
                case 'png':
                    return await image.png({ compressionLevel: 9 }).toBuffer();
                case 'jpeg':
                    return await image.jpeg({ quality: 90 }).toBuffer();
                case 'webp':
                    return await image.webp({ quality: 90 }).toBuffer();
                default:
                    throw new Error(`Formato no soportado: ${format}`);
            }
        } catch (error) {
            throw new Error(`Error en conversión a ${format}: ${error.message}`);
        }
    }
}

// --- 4. CLASE FileHandler ---

class FileHandler {
    sanitizeString(str, config) {
        if (!config.fileNaming.sanitize) return str;
        
        return str
            .replace(INVALID_FILENAME_CHARS, '')
            .replace(/\s+/g, '-')
            .replace(/[^\w\-.]/g, '')
            .replace(MULTIPLE_HYPHENS, '-')
            .replace(LEADING_TRAILING_HYPHENS, '')
            .toLowerCase();
    }

    generateFileName(config, collection, iconName, options = {}) {
        const { size = config.defaultSize, color = config.defaultColor, format } = options;
        
        let fileName = config.fileNaming.pattern
            .replace(/{collection}/g, collection)
            .replace(/{icon}/g, iconName)
            .replace(/{size}/g, size.toString())
            .replace(/{color}/g, color || 'default')
            .replace(/{format}/g, format || '');

        fileName = this.sanitizeString(fileName, config);
        fileName = applyCase(fileName, config.fileNaming.case);

        // Asegurar que no quede vacío
        if (!fileName) fileName = `icon-${Date.now()}`;
        
        return `${fileName}.${format}`;
    }

    generateFolderPath(config, collection, options = {}) {
        const { size = config.defaultSize, color = config.defaultColor, format } = options;

        if (!config.folderStructure.enabled) {
            return config.outputDir;
        }

        let folderPath = config.folderStructure.pattern
            .replace(/{collection}/g, collection)
            .replace(/{size}/g, size.toString())
            .replace(/{color}/g, color || 'default')
            .replace(/{format}/g, format || '');

        folderPath = this.sanitizeString(folderPath, config);
        
        let fullPath = path.resolve(config.outputDir, folderPath);

        // Opciones de agrupamiento condicional
        if (config.folderStructure.groupBySize) {
            fullPath = path.join(fullPath, `size-${size}`);
        }
        if (config.folderStructure.groupByColor && color && color !== config.defaultColor) {
            fullPath = path.join(fullPath, `color-${this.sanitizeString(color, config)}`);
        }
        if (config.folderStructure.groupByFormat && format) {
            fullPath = path.join(fullPath, format);
        }

        return fullPath;
    }

    async ensureOutputDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return dirPath;
        } catch (error) {
            throw new Error(`No se pudo crear el directorio ${dirPath}: ${error.message}`);
        }
    }

    async writeFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content);
            return true;
        } catch (error) {
            throw new Error(`Error escribiendo archivo ${filePath}: ${error.message}`);
        }
    }
}

// --- 5. CLASE SvgProcessor ---

class SvgProcessor {
    async loadCollectionData(collectionName) {
        try {
            const jsonPath = locate(collectionName);
            if (!jsonPath) {
                throw new Error(`Colección "${collectionName}" no encontrada`);
            }
            
            const jsonContent = await fs.readFile(jsonPath, "utf8");
            const data = JSON.parse(jsonContent);
            
            // Verificar estructura básica
            if (!data.icons && !data.prefix) {
                console.warn(`La colección ${collectionName} puede tener una estructura inesperada`);
            }
            
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Archivo JSON de la colección "${collectionName}" no encontrado. ¿Está instalado @iconify/json?`);
            }
            throw new Error(`Error cargando colección "${collectionName}": ${error.message}`);
        }
    }

    generateSvg(data, iconName, collection, size, color) {
        try {
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                throw new Error(`Icono "${iconName}" no encontrado en la colección`);
            }

            const targetColor = color || DEFAULT_CONFIG.defaultColor;
            
            // Generar SVG con iconToSVG
            const renderData = iconToSVG(iconData, {
                height: `${size}`,
                width: `${size}`,
                color: targetColor !== 'currentColor' ? targetColor : undefined
            });

            let body = renderData.body;
            
            // Aplicar color si no está presente y no es currentColor
            if (targetColor && targetColor !== 'currentColor' && !FILL_ATTRIBUTE_PATTERN.test(body)) {
                body = body.replace(/<path/g, `<path fill="${targetColor}"`);
            }

            // Construir SVG completo
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" 
    width="${size}" 
    height="${size}" 
    viewBox="${renderData.attributes.viewBox || '0 0 24 24'}">
    ${body}
</svg>`;

            return svg;
        } catch (error) {
            throw new Error(`Error generando SVG para ${iconName}: ${error.message}`);
        }
    }
}

// --- 6. CLASE IconExporter ---

class IconExporter {
    constructor(config = {}) {
        this.config = this.mergeConfig(DEFAULT_CONFIG, config);
        this.validateConfig();

        this.fileHandler = new FileHandler();
        this.svgProcessor = new SvgProcessor();
        this.imageConverter = new ImageConverter();
        
        this.stats = {
            processed: 0,
            errors: 0,
            skipped: 0
        };
    }

    validateConfig() {
        if (!Array.isArray(this.config.collections) || this.config.collections.length === 0) {
            throw new Error("La configuración debe incluir al menos una colección");
        }
        
        if (!Array.isArray(this.config.formats) || this.config.formats.length === 0) {
            throw new Error("La configuración debe incluir al menos un formato ('svg', 'png', etc.)");
        }
        
        for (const format of this.config.formats) {
            if (!VALID_OUTPUT_FORMATS.has(format)) {
                throw new Error(`Formato no válido: ${format}. Válidos: ${Array.from(VALID_OUTPUT_FORMATS).join(', ')}`);
            }
        }
        
        if (this.config.fileNaming.case && !VALID_CASE_TYPES.has(this.config.fileNaming.case)) {
            throw new Error(`Caso de nombre no válido: ${this.config.fileNaming.case}`);
        }
    }

    mergeConfig(defaultConfig, userConfig) {
        const result = JSON.parse(JSON.stringify(defaultConfig));
        
        for (const key in userConfig) {
            if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
                result[key] = { ...result[key], ...userConfig[key] };
            } else {
                result[key] = userConfig[key];
            }
        }
        
        return result;
    }

    getIconsToProcess(collectionData) {
        if (this.config.iconsToExport && this.config.iconsToExport.length > 0) {
            return this.config.iconsToExport;
        }
        
        // Obtener todos los iconos de la colección
        if (collectionData.icons) {
            return Object.keys(collectionData.icons);
        }
        
        // Algunas colecciones usan diferente estructura
        if (collectionData.iconSets) {
            return Object.keys(collectionData.iconSets);
        }
        
        return [];
    }

    async processIcon(collectionData, iconName, collection, options = {}) {
        const { size, color } = options;
        const targetSize = size || this.config.defaultSize;
        const targetColor = color || this.config.defaultColor;
        
        let svgContent = null;
        
        try {
            // 1. Generar SVG
            svgContent = this.svgProcessor.generateSvg(
                collectionData, 
                iconName, 
                collection, 
                targetSize, 
                targetColor
            );
        } catch (error) {
            console.error(`❌ Error generando SVG para "${iconName}" en ${collection}:`, error.message);
            this.stats.errors += this.config.formats.length;
            return;
        }

        // 2. Exportar en cada formato
        for (const format of this.config.formats) {
            try {
                const folderPath = this.fileHandler.generateFolderPath(
                    this.config, 
                    collection, 
                    { size: targetSize, color: targetColor, format }
                );
                
                const fileName = this.fileHandler.generateFileName(
                    this.config, 
                    collection, 
                    iconName, 
                    { size: targetSize, color: targetColor, format }
                );
                
                const filePath = path.join(folderPath, fileName);
                
                // Crear directorio
                await this.fileHandler.ensureOutputDir(folderPath);
                
                // Preparar contenido
                let fileContent = svgContent;
                if (format !== 'svg') {
                    fileContent = await this.imageConverter.convert(svgContent, format, targetSize);
                }
                
                // Escribir archivo
                await this.fileHandler.writeFile(filePath, fileContent);
                
                console.log(`✅ ${format.toUpperCase()}: ${path.relative(process.cwd(), filePath)}`);
                this.stats.processed++;
                
            } catch (error) {
                console.error(`❌ Error exportando ${iconName} a ${format}:`, error.message);
                this.stats.errors++;
            }
        }
    }

    async processCollection(collection, variants = {}) {
        const { sizes = [this.config.defaultSize], colors = [this.config.defaultColor] } = variants;
        
        console.log(`\n📦 Procesando colección: ${collection}`);
        
        try {
            // Cargar datos de la colección
            const collectionData = await this.svgProcessor.loadCollectionData(collection);
            
            // Obtener lista de iconos a procesar
            const icons = this.getIconsToProcess(collectionData);
            
            if (icons.length === 0) {
                console.warn(`⚠️ No se encontraron iconos en la colección ${collection}`);
                return;
            }
            
            console.log(`   Iconos encontrados: ${icons.length}`);
            console.log(`   Formatos: ${this.config.formats.join(', ')}`);
            console.log(`   Tamaños: ${sizes.join(', ')}`);
            console.log(`   Colores: ${colors.join(', ')}`);
            
            // Procesar cada combinación
            for (const iconName of icons) {
                for (const size of sizes) {
                    for (const color of colors) {
                        await this.processIcon(
                            collectionData, 
                            iconName, 
                            collection, 
                            { size, color }
                        );
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ Error procesando colección ${collection}:`, error.message);
            this.stats.errors++;
        }
    }

    async exportWithVariants(variants = {}) {
        const startTime = Date.now();
        
        console.log('🚀 Iniciando exportación de iconos...');
        console.log('='.repeat(50));
        
        try {
            // Crear directorio principal de salida
            await this.fileHandler.ensureOutputDir(this.config.outputDir);
            
            // Procesar cada colección
            for (const collection of this.config.collections) {
                await this.processCollection(collection, variants);
            }
            
            // Mostrar resumen
            this.printExportSummary(startTime);
            
            return {
                success: this.stats.errors === 0,
                processed: this.stats.processed,
                errors: this.stats.errors,
                skipped: this.stats.skipped
            };
            
        } catch (error) {
            console.error('❌ Error fatal en la exportación:', error);
            throw error;
        }
    }

    printExportSummary(startTime) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMEN DE EXPORTACIÓN');
        console.log('='.repeat(50));
        console.log(`   ✅ Exitosos: ${this.stats.processed}`);
        console.log(`   ❌ Errores: ${this.stats.errors}`);
        console.log(`   ⏱️  Duración: ${duration}s`);
        console.log('🎉 ' + (this.stats.errors === 0 ? 'Exportación completada con éxito!' : 'Exportación finalizada con errores'));
    }

    async exportIcons() {
        return this.exportWithVariants();
    }
}

// --- 7. FUNCIONES DE EXPORTACIÓN ---

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

// --- 8. EJECUCIÓN DIRECTA (solo si es el archivo principal) ---

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(`file://${process.argv[1]}`)) {
    console.log('🔧 Ejecutando script de exportación...');
    
    // Configuración de ejemplo
    const config = {
        collections: ["mdi"], // Usar Material Design Icons (más confiable)
        outputDir: "./icon-exports",
        defaultSize: 24,
        defaultColor: "#1d9bf0",
        iconsToExport: ["home", "account", "settings", "logout"], // Iconos básicos
        formats: ['svg', 'png'],
        fileNaming: {
            pattern: "{icon}",
            case: "kebab"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupBySize: false,
            groupByColor: false,
            groupByFormat: false
        }
    };

    const variants = {
        sizes: [24, 32],
        colors: ["#1d9bf0", "#333333"]
    };

    try {
        const result = await exportIconVariants(config, variants);
        if (result.success) {
            console.log('\n✨ Todos los iconos exportados exitosamente!');
        } else {
            console.log(`\n⚠️  Exportación completada con ${result.errors} errores`);
        }
    } catch (error) {
        console.error('💥 Error durante la ejecución:', error.message);
        process.exit(1);
    }
}