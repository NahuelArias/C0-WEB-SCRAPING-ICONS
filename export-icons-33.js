// icon-exporter-complete.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getIconData, iconToSVG } from "@iconify/utils";
import { locate } from "@iconify/json";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURACIÓN POR DEFECTO ---
const DEFAULT_CONFIG = {
    // Colecciones a procesar (ej: ["mdi", "fa-solid"])
    collections: ["mdi"],
    
    // Iconos específicos (si está vacío, exporta TODOS los iconos)
    icons: [],
    
    // Directorio base de salida (puede ser relativo o absoluto)
    outputDir: "./iconos",
    
    // Tamaño por defecto
    defaultSize: 48,
    
    // Color por defecto
    defaultColor: "#000000",
    
    // Colores adicionales a exportar
    colors: ["#000000"],
    
    // Tamaños adicionales a exportar
    sizes: [48,64,128],
    
    // Formatos a exportar
    formats: ["svg", "png"],
    
    // Modos de organización de carpetas
    folderMode: "collection", // Opciones: "collection", "format", "icon", "color", "flat", "combined"
    
    // Para modo "combined": puedes combinar múltiples modos
    combinedModes: ["collection", "format"], // Ej: /mdi/svg/icon.png
    
    // Nombre personalizado para el directorio (dinámico)
    customDirName: null, // Si es null, usa timestamp. Puede usar variables: {date}, {collection}, {timestamp}
    
    // Plantilla para nombres de archivo
    fileNameTemplate: "{icon}-{size}px-{color}", // Variables: {icon}, {size}, {color}, {collection}, {format}
    
    // Fondo para formatos raster (png, jpg, etc)
    backgroundColor: "#FFFFFF",
    
    // Comportamiento adicional
    skipExisting: true, // Saltar archivos existentes
    verbose: true, // Mostrar logs detallados
    parallel: 10, // Número de iconos a procesar en paralelo
};

// --- UTILIDADES ---

function formatTimestamp() {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function getDynamicDirName(config, collection = null) {
    if (config.customDirName) {
        const date = new Date();
        const replacements = {
            '{date}': date.toISOString().slice(0, 10),
            '{timestamp}': formatTimestamp(),
            '{collection}': collection || 'all',
            '{year}': date.getFullYear(),
            '{month}': String(date.getMonth() + 1).padStart(2, '0'),
            '{day}': String(date.getDate()).padStart(2, '0'),
            '{hour}': String(date.getHours()).padStart(2, '0'),
            '{minute}': String(date.getMinutes()).padStart(2, '0'),
        };
        
        let dirName = config.customDirName;
        for (const [key, value] of Object.entries(replacements)) {
            dirName = dirName.replace(key, value);
        }
        return dirName;
    }
    return formatTimestamp();
}

function sanitizeForPath(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function applyColorToSVG(svgString, color) {
    if (!color || color === 'currentColor') return svgString;
    
    let svg = svgString;
    
    // Reemplazar todos los fills
    svg = svg.replace(/fill="[^"]*"/gi, `fill="${color}"`);
    
    // Reemplazar todos los strokes
    svg = svg.replace(/stroke="[^"]*"/gi, `stroke="${color}"`);
    
    return svg;
}

function generateFileName(iconName, size, color, collection, format, template) {
    const colorName = color.replace('#', '');
    const colorHex = color.startsWith('#') ? color.replace('#', 'hex') : color;
    
    const replacements = {
        '{icon}': iconName,
        '{size}': size,
        '{color}': colorName,
        '{colorHex}': colorHex,
        '{collection}': collection,
        '{format}': format,
        '{colorname}': getColorName(color) || colorName,
    };
    
    let fileName = template;
    for (const [key, value] of Object.entries(replacements)) {
        fileName = fileName.replace(key, value);
    }
    
    // Sanitizar y añadir extensión
    fileName = sanitizeForPath(fileName);
    return `${fileName}.${format}`;
}

function getColorName(hexColor) {
    const colors = {
        '#000000': 'black',
        '#FFFFFF': 'white',
        '#FF0000': 'red',
        '#00FF00': 'green',
        '#0000FF': 'blue',
        '#FFFF00': 'yellow',
        '#FF00FF': 'magenta',
        '#00FFFF': 'cyan',
        '#FFA500': 'orange',
        '#800080': 'purple',
        '#A52A2A': 'brown',
        '#808080': 'gray',
        '#1d9bf0': 'twitter-blue',
        '#1877F2': 'facebook-blue',
        '#FF4500': 'reddit-orange',
        '#000000': 'github-black',
    };
    return colors[hexColor.toUpperCase()] || null;
}

function buildFolderPath(config, collection, iconName, size, color, format) {
    const baseDir = config.finalOutputDir;
    const colorName = color.replace('#', '');
    const colorHex = color.startsWith('#') ? color.replace('#', 'hex') : color;
    
    let folderPath = baseDir;
    
    switch (config.folderMode) {
        case 'flat':
            // Todos los archivos en la misma carpeta
            // ej: ./iconos/icon-red-48px.svg
            break;
            
        case 'collection':
            // Agrupado por colección
            // ej: ./iconos/mdi/icon.svg
            folderPath = path.join(folderPath, collection);
            break;
            
        case 'format':
            // Agrupado por formato
            // ej: ./iconos/svg/icon.svg, ./iconos/png/icon.png
            folderPath = path.join(folderPath, format);
            break;
            
        case 'icon':
            // Agrupado por nombre de icono
            // ej: ./iconos/home/home.svg, ./iconos/heart/heart.svg
            folderPath = path.join(folderPath, iconName);
            break;
            
        case 'color':
            // Agrupado por color
            // ej: ./iconos/red/icon.svg, ./iconos/blue/icon.svg
            const cName = getColorName(color) || colorHex;
            folderPath = path.join(folderPath, cName);
            break;
            
        case 'size':
            // Agrupado por tamaño
            // ej: ./iconos/48px/icon.svg, ./iconos/96px/icon.png
            folderPath = path.join(folderPath, `${size}px`);
            break;
            
        case 'combined':
            // Combinación personalizada
            // ej: ./iconos/mdi/svg/red/48px/icon.svg
            config.combinedModes.forEach(mode => {
                switch (mode) {
                    case 'collection':
                        folderPath = path.join(folderPath, collection);
                        break;
                    case 'format':
                        folderPath = path.join(folderPath, format);
                        break;
                    case 'icon':
                        folderPath = path.join(folderPath, iconName);
                        break;
                    case 'color':
                        const colName = getColorName(color) || colorHex;
                        folderPath = path.join(folderPath, colName);
                        break;
                    case 'size':
                        folderPath = path.join(folderPath, `${size}px`);
                        break;
                }
            });
            break;
            
        case 'smart':
            // Organización inteligente: colección/formato/color
            // ej: ./iconos/mdi/svg/red/
            folderPath = path.join(folderPath, collection, format);
            if (color !== config.defaultColor) {
                const colName = getColorName(color) || colorHex;
                folderPath = path.join(folderPath, colName);
            }
            break;
    }
    
    return folderPath;
}

// --- CLASE PRINCIPAL ---

class IconExporter {
    constructor(userConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...userConfig };
        this.stats = {
            totalIcons: 0,
            exported: 0,
            skipped: 0,
            errors: 0,
            startTime: null,
            collectionsProcessed: 0
        };
        this.collectionCache = new Map();
    }
    
    async initialize() {
        // Crear directorio dinámico
        const dynamicDir = getDynamicDirName(this.config);
        this.config.finalOutputDir = path.join(this.config.outputDir, dynamicDir);
        
        if (this.config.verbose) {
            console.log('🚀 INICIALIZANDO EXPORTADOR DE ICONOS');
            console.log('='.repeat(60));
            console.log(`📁 Directorio de salida: ${this.config.finalOutputDir}`);
            console.log(`🎨 Modo carpetas: ${this.config.folderMode}`);
            console.log(`📦 Colecciones: ${this.config.collections.join(', ')}`);
            console.log(`🎯 Formatos: ${this.config.formats.join(', ')}`);
            console.log(`🌈 Colores: ${this.config.colors.join(', ')}`);
            console.log(`📏 Tamaños: ${this.config.sizes.join(', ')}px`);
            console.log('='.repeat(60));
        }
        
        await fs.mkdir(this.config.finalOutputDir, { recursive: true });
        this.stats.startTime = Date.now();
    }
    
    async loadCollection(collectionName) {
        if (this.collectionCache.has(collectionName)) {
            return this.collectionCache.get(collectionName);
        }
        
        try {
            if (this.config.verbose) {
                console.log(`📥 Cargando colección: ${collectionName}`);
            }
            
            const jsonPath = locate(collectionName);
            if (!jsonPath) {
                throw new Error(`Colección no encontrada: ${collectionName}`);
            }
            
            const content = await fs.readFile(jsonPath, 'utf8');
            const data = JSON.parse(content);
            
            this.collectionCache.set(collectionName, data);
            return data;
            
        } catch (error) {
            console.error(`❌ Error cargando colección ${collectionName}:`, error.message);
            throw error;
        }
    }
    
    async getIconsFromCollection(collectionName, collectionData) {
        if (this.config.icons && this.config.icons.length > 0) {
            // Usar iconos específicos configurados
            return this.config.icons;
        }
        
        // Exportar TODOS los iconos de la colección
        if (collectionData.icons) {
            const allIcons = Object.keys(collectionData.icons);
            
            if (this.config.verbose) {
                console.log(`📊 ${collectionName}: ${allIcons.length} iconos encontrados`);
            }
            
            return allIcons;
        }
        
        throw new Error(`No se encontraron iconos en la colección ${collectionName}`);
    }
    
    async generateIconSVG(collectionData, iconName, size, color) {
        try {
            const iconData = getIconData(collectionData, iconName);
            if (!iconData) {
                throw new Error(`Icono no encontrado: ${iconName}`);
            }
            
            const renderData = iconToSVG(iconData, {
                height: size,
                width: size
            });
            
            let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" 
                width="${size}" 
                height="${size}" 
                viewBox="${renderData.attributes.viewBox || '0 0 24 24'}">
                ${renderData.body}
            </svg>`;
            
            // Aplicar color
            svgContent = applyColorToSVG(svgContent, color);
            
            return svgContent;
            
        } catch (error) {
            throw new Error(`Error generando SVG para ${iconName}: ${error.message}`);
        }
    }
    
    async convertToFormat(svgContent, format, size) {
        if (format === 'svg') {
            return Buffer.from(svgContent, 'utf8');
        }
        
        const image = sharp(Buffer.from(svgContent), {
            density: size * 2
        }).resize(size, size, {
            fit: 'contain',
            background: this.config.backgroundColor || '#FFFFFF'
        });
        
        switch (format) {
            case 'png':
                return await image.png().toBuffer();
            case 'jpg':
            case 'jpeg':
                return await image.jpeg({ quality: 90 }).toBuffer();
            case 'webp':
                return await image.webp({ quality: 90 }).toBuffer();
            default:
                throw new Error(`Formato no soportado: ${format}`);
        }
    }
    
    async exportIcon(collectionName, iconName) {
        const iconStats = { exported: 0, skipped: 0, errors: 0 };
        
        for (const size of this.config.sizes) {
            for (const color of this.config.colors) {
                for (const format of this.config.formats) {
                    try {
                        // Generar ruta y nombre de archivo
                        const fileName = generateFileName(
                            iconName, size, color, collectionName, format, 
                            this.config.fileNameTemplate
                        );
                        
                        const folderPath = buildFolderPath(
                            this.config, collectionName, iconName, size, color, format
                        );
                        
                        const filePath = path.join(folderPath, fileName);
                        
                        // Verificar si ya existe
                        if (this.config.skipExisting) {
                            try {
                                await fs.access(filePath);
                                if (this.config.verbose) {
                                    console.log(`   ⏭️  Saltando (existe): ${path.relative(this.config.finalOutputDir, filePath)}`);
                                }
                                iconStats.skipped++;
                                continue;
                            } catch {
                                // El archivo no existe, continuar
                            }
                        }
                        
                        // Crear directorio si no existe
                        await fs.mkdir(folderPath, { recursive: true });
                        
                        // Generar SVG
                        const collectionData = this.collectionCache.get(collectionName);
                        const svgContent = await this.generateIconSVG(
                            collectionData, iconName, size, color
                        );
                        
                        // Convertir a formato deseado
                        const fileContent = await this.convertToFormat(svgContent, format, size);
                        
                        // Guardar archivo
                        await fs.writeFile(filePath, fileContent);
                        
                        if (this.config.verbose) {
                            console.log(`   ✅ Exportado: ${path.relative(this.config.finalOutputDir, filePath)}`);
                        }
                        
                        iconStats.exported++;
                        this.stats.exported++;
                        
                    } catch (error) {
                        console.error(`   ❌ Error exportando ${iconName} (${size}px, ${color}, ${format}):`, error.message);
                        iconStats.errors++;
                        this.stats.errors++;
                    }
                }
            }
        }
        
        return iconStats;
    }
    
    async processCollection(collectionName) {
        if (this.config.verbose) {
            console.log(`\n📦 PROCESANDO COLECCIÓN: ${collectionName}`);
        }
        
        try {
            // Cargar colección
            const collectionData = await this.loadCollection(collectionName);
            
            // Obtener lista de iconos
            const icons = await this.getIconsFromCollection(collectionName, collectionData);
            
            if (this.config.verbose) {
                console.log(`   📊 Iconos a procesar: ${icons.length}`);
                console.log(`   ⚙️  Variantes por icono: ${this.config.sizes.length} tamaños × ${this.config.colors.length} colores × ${this.config.formats.length} formatos`);
                console.log(`   📈 Total variantes: ${icons.length * this.config.sizes.length * this.config.colors.length * this.config.formats.length}`);
            }
            
            // Procesar iconos en lotes para mejor performance
            const batchSize = this.config.parallel || 3;
            for (let i = 0; i < icons.length; i += batchSize) {
                const batch = icons.slice(i, i + batchSize);
                
                // Procesar iconos en paralelo
                const promises = batch.map(iconName => this.exportIcon(collectionName, iconName));
                const results = await Promise.allSettled(promises);
                
                // Actualizar estadísticas
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        const stats = result.value;
                        this.stats.totalIcons++;
                    } else {
                        console.error(`❌ Error procesando ${batch[index]}:`, result.reason?.message);
                        this.stats.errors++;
                    }
                });
                
                // Mostrar progreso
                if (this.config.verbose && icons.length > 10) {
                    const progress = Math.min(i + batchSize, icons.length);
                    const percent = Math.round((progress / icons.length) * 100);
                    console.log(`   📊 Progreso: ${progress}/${icons.length} (${percent}%)`);
                }
            }
            
            this.stats.collectionsProcessed++;
            
            if (this.config.verbose) {
                console.log(`   ✅ Colección ${collectionName} completada`);
            }
            
        } catch (error) {
            console.error(`❌ Error procesando colección ${collectionName}:`, error.message);
            this.stats.errors++;
        }
    }
    
    async exportAll() {
        await this.initialize();
        
        console.log('\n🚀 INICIANDO EXPORTACIÓN...\n');
        
        for (const collection of this.config.collections) {
            await this.processCollection(collection);
        }
        
        this.printSummary();
    }
    
    printSummary() {
        const duration = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN DE EXPORTACIÓN');
        console.log('='.repeat(60));
        console.log(`   📦 Colecciones procesadas: ${this.stats.collectionsProcessed}/${this.config.collections.length}`);
        console.log(`   🎯 Iconos totales: ${this.stats.totalIcons}`);
        console.log(`   ✅ Archivos exportados: ${this.stats.exported}`);
        console.log(`   ⏭️  Archivos saltados: ${this.stats.skipped}`);
        console.log(`   ❌ Errores: ${this.stats.errors}`);
        console.log(`   ⏱️  Duración: ${duration} segundos`);
        console.log(`   📁 Directorio: ${path.resolve(this.config.finalOutputDir)}`);
        console.log('='.repeat(60));
        
        // Crear archivo de resumen
        this.createSummaryFile();
    }
    
    async createSummaryFile() {
        try {
            const summaryPath = path.join(this.config.finalOutputDir, 'export-summary.json');
            const summary = {
                config: this.config,
                stats: this.stats,
                timestamp: new Date().toISOString(),
                directory: this.config.finalOutputDir
            };
            
            await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
            
            if (this.config.verbose) {
                console.log(`   📝 Resumen guardado en: ${summaryPath}`);
            }
        } catch (error) {
            console.warn(`   ⚠️  No se pudo crear archivo de resumen: ${error.message}`);
        }
    }
}

// --- FUNCIONES DE CONVENIENCIA ---

export async function exportIcons(config = {}) {
    const exporter = new IconExporter(config);
    return await exporter.exportAll();
}

export async function exportCollection(collectionName, options = {}) {
    const config = {
        collections: [collectionName],
        ...options
    };
    
    const exporter = new IconExporter(config);
    return await exporter.exportAll();
}

// --- EJEMPLOS DE USO ---

async function runExamples() {
    console.log('🎨 EJEMPLOS DE CONFIGURACIÓN DEL EXPORTADOR\n');
    
    // Ejemplo 1: Exportar TODOS los iconos de una colección
    const example1 = {
        collections: ["mdi"],
        icons: [], // Vacío = todos los iconos
        outputDir: "./exports",
        folderMode: "smart",
        customDirName: "mdi-icons-{date}",
        formats: ["svg", "png"],
        sizes: [24, 48],
        colors: ["#000000", "#1d9bf0", "#FF0000"],
        verbose: true
    };
    
    // Ejemplo 2: Iconos específicos organizados por formato y color
    const example2 = {
        collections: ["simple-icons"],
        icons: ["twitter", "github", "linkedin", "youtube"],
        outputDir: "./brand-icons",
        folderMode: "combined",
        combinedModes: ["format", "color"],
        fileNameTemplate: "{icon}-brand",
        formats: ["svg", "png", "webp"],
        sizes: [32, 64, 128],
        colors: ["#1d9bf0", "#000000", "#FF0000", "#0A66C2", "#FF0000"],
        customDirName: "social-media-{timestamp}",
        skipExisting: true
    };
    
    // Ejemplo 3: Organización por icono (cada icono en su carpeta)
    const example3 = {
        collections: ["fa-solid"],
        icons: ["home", "user", "cog", "heart", "star"],
        outputDir: "./ui-icons",
        folderMode: "icon",
        fileNameTemplate: "{size}px-{color}",
        formats: ["svg"],
        sizes: [16, 24, 32, 48],
        colors: ["currentColor", "#000000", "#666666"],
        customDirName: "ui-kit-{year}-{month}",
        parallel: 5
    };
    
    // Ejemplo 4: Modo plano (todos en una carpeta)
    const example4 = {
        collections: ["mdi"],
        icons: ["check", "close", "menu", "arrow-right"],
        outputDir: "./flat-icons",
        folderMode: "flat",
        fileNameTemplate: "{collection}-{icon}-{colorHex}-{size}",
        formats: ["png"],
        sizes: [48],
        colors: ["#00FF00", "#FF0000", "#0000FF"],
        backgroundColor: "transparent"
    };
    
    console.log('Selecciona un ejemplo para ejecutar:');
    console.log('1. Exportar TODOS los iconos de MDI (modo smart)');
    console.log('2. Iconos de redes sociales (organizado por formato/color)');
    console.log('3. Iconos UI (organizado por icono)');
    console.log('4. Iconos planos (todos en una carpeta)');
    console.log('\nPara usar, copia la configuración y llama a exportIcons(config)');
}

// --- EJECUCIÓN DIRECTA (para testing) ---

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(`file://${process.argv[1]}`)) {
    // Configuración por defecto para testing
    const testConfig = {
        collections: ["nonicons"], // ejemplo: nonicons,geoglyphs,fluent
        icons: [], // Dejar vacío [] para exportar TODOS
        outputDir: "./my-icons",
        folderMode: "collection", // Prueba cambiando a: "format", "icon", "color", "flat", "smart", "combined"
        customDirName: "test-{timestamp}",
        fileNameTemplate: "{icon}-{color}",
        formats: ["svg", "png"],
        sizes: [16,32, 64],
        colors: ["#323232ff"],
        verbose: true,
        parallel: 5 // Número de iconos a procesar en paralelo
    };
    
    async function runTest() {
        console.log('🧪 EJECUTANDO PRUEBA DE EXPORTACIÓN\n');
        
        const exporter = new IconExporter(testConfig);
        await exporter.exportAll();
        
        console.log('\n✨ ¡PRUEBA COMPLETADA!');
        console.log('📁 Los iconos están en:', path.resolve(exporter.config.finalOutputDir));
        
        // Mostrar estructura de carpetas
        try {
            const files = await fs.readdir(exporter.config.finalOutputDir, { recursive: true });
            console.log('\n📂 Estructura generada:');
            files.slice(0, 20).forEach(file => { // Mostrar solo primeros 20 archivos
                console.log(`   📄 ${file}`);
            });
            if (files.length > 20) {
                console.log(`   ... y ${files.length - 20} archivos más`);
            }
        } catch (error) {
            console.log('   (No se pudo leer la estructura de directorios)');
        }
    }
    
    runTest().catch(console.error);
}

export { IconExporter, DEFAULT_CONFIG };