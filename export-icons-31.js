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

// --- CONFIGURACIÓN ---
const DEFAULT_CONFIG = {
    collections: [],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "#000000",
    formats: ['svg'],
    fileNaming: {
        pattern: "{icon}",
        sanitize: true,
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupByFormat: true,
    }
};

// --- FUNCIONES AUXILIARES ---

function sanitizeFilename(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// --- CLASE SVG PROCESSOR MEJORADA ---

class SvgProcessor {
    async loadCollectionData(collectionName) {
        try {
            const jsonPath = locate(collectionName);
            if (!jsonPath) {
                throw new Error(`Colección "${collectionName}" no encontrada`);
            }
            const jsonContent = await fs.readFile(jsonPath, "utf8");
            return JSON.parse(jsonContent);
        } catch (error) {
            throw new Error(`Error cargando colección "${collectionName}": ${error.message}`);
        }
    }

    generateSvg(data, iconName, size, color) {
        try {
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                throw new Error(`Icono "${iconName}" no encontrado`);
            }

            // Generar SVG básico sin color
            const renderData = iconToSVG(iconData, {
                height: `${size}px`,
                width: `${size}px`
            });

            let body = renderData.body;
            
            // Aplicar color manualmente - ENFOQUE DIRECTO
            if (color && color !== 'currentColor') {
                // Método 1: Reemplazar fill y stroke en elementos SVG
                body = this.applyColorToSvgBody(body, color);
            }

            // Construir SVG
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" 
    width="${size}" 
    height="${size}" 
    viewBox="${renderData.attributes.viewBox || '0 0 24 24'}">
    ${body}
</svg>`;

            return svg;
        } catch (error) {
            throw new Error(`Error generando SVG: ${error.message}`);
        }
    }

    // Método robusto para aplicar color a SVG
    applyColorToSvgBody(svgBody, color) {
        // Convertir a string si es necesario
        let body = String(svgBody);
        
        // 1. Primero, buscar y reemplazar fill="none" o fill vacío
        body = body.replace(/fill="([^"]*)"/gi, (match, fillValue) => {
            if (fillValue === 'none' || fillValue === '') {
                return `fill="${color}"`;
            }
            return match; // Mantener otros colores
        });
        
        // 2. Buscar y reemplazar stroke="none" o stroke vacío
        body = body.replace(/stroke="([^"]*)"/gi, (match, strokeValue) => {
            if (strokeValue === 'none' || strokeValue === '') {
                return `stroke="${color}"`;
            }
            return match;
        });
        
        // 3. Si después de esto todavía hay elementos <path> sin fill, añadirlo
        if (!body.includes('fill=')) {
            body = body.replace(/<path/gi, `<path fill="${color}"`);
        }
        
        // 4. Para elementos como <circle>, <rect>, etc.
        const shapeElements = ['circle', 'rect', 'ellipse', 'polygon', 'polyline'];
        shapeElements.forEach(tag => {
            const regex = new RegExp(`<${tag}(?!.*?fill=)`, 'gi');
            body = body.replace(regex, `<${tag} fill="${color}"`);
        });
        
        return body;
    }
}

// --- CLASE CONVERTER SIMPLIFICADA ---

class ImageConverter {
    async convert(svgContent, format, size) {
        const buffer = Buffer.from(svgContent);
        
        let sharpInstance = sharp(buffer, {
            density: size * 2
        }).resize(size, size, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 } // Fondo transparente
        });

        switch (format) {
            case 'png':
                return await sharpInstance.png().toBuffer();
            case 'jpeg':
            case 'jpg':
                return await sharpInstance.jpeg({ quality: 90 }).toBuffer();
            case 'webp':
                return await sharpInstance.webp({ quality: 90 }).toBuffer();
            default:
                throw new Error(`Formato no soportado: ${format}`);
        }
    }
}

// --- CLASE PRINCIPAL SIMPLIFICADA ---

class IconExporter {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.svgProcessor = new SvgProcessor();
        this.imageConverter = new ImageConverter();
        this.stats = { processed: 0, errors: 0 };
    }

    async ensureDir(dir) {
        await fs.mkdir(dir, { recursive: true });
    }

    async exportIcons() {
        console.log('🚀 Exportando iconos...\n');
        
        for (const collection of this.config.collections) {
            console.log(`📦 Colección: ${collection}`);
            
            try {
                const collectionData = await this.svgProcessor.loadCollectionData(collection);
                
                // Determinar qué iconos exportar
                const icons = this.config.iconsToExport.length > 0 
                    ? this.config.iconsToExport 
                    : Object.keys(collectionData.icons || {});
                
                console.log(`   Iconos a exportar: ${icons.length}`);
                
                for (const iconName of icons) {
                    await this.exportSingleIcon(collectionData, collection, iconName);
                }
                
            } catch (error) {
                console.error(`❌ Error con colección ${collection}:`, error.message);
                this.stats.errors++;
            }
        }
        
        this.printSummary();
    }
    
    async exportSingleIcon(collectionData, collection, iconName) {
        const size = this.config.defaultSize;
        const color = this.config.defaultColor;
        
        try {
            // 1. Generar SVG
            const svgContent = this.svgProcessor.generateSvg(
                collectionData, 
                iconName, 
                size, 
                color
            );
            
            // Verificar que el SVG tiene el color aplicado
            if (color && color !== 'currentColor' && !svgContent.includes(color)) {
                console.warn(`   ⚠️  Color ${color} no aplicado a ${iconName}, usando negro`);
            }
            
            // 2. Exportar en cada formato
            for (const format of this.config.formats) {
                await this.exportFormat(collection, iconName, svgContent, size, color, format);
            }
            
            this.stats.processed++;
            
        } catch (error) {
            console.error(`❌ Error exportando ${iconName}:`, error.message);
            this.stats.errors++;
        }
    }
    
    async exportFormat(collection, iconName, svgContent, size, color, format) {
        try {
            // Crear nombre de archivo
            let filename = this.config.fileNaming.pattern
                .replace('{collection}', collection)
                .replace('{icon}', iconName)
                .replace('{size}', size)
                .replace('{color}', color.replace('#', ''));
            
            filename = sanitizeFilename(filename);
            filename = `${filename}.${format}`;
            
            // Crear ruta de salida
            let outputPath = this.config.outputDir;
            
            if (this.config.folderStructure.enabled) {
                outputPath = path.join(outputPath, collection);
                
                if (this.config.folderStructure.groupByFormat) {
                    outputPath = path.join(outputPath, format);
                }
            }
            
            await this.ensureDir(outputPath);
            
            const filePath = path.join(outputPath, filename);
            
            // Preparar contenido
            let fileContent;
            if (format === 'svg') {
                fileContent = svgContent;
            } else {
                fileContent = await this.imageConverter.convert(svgContent, format, size);
            }
            
            // Guardar archivo
            await fs.writeFile(filePath, fileContent);
            
            console.log(`   ✅ ${format.toUpperCase()}: ${iconName} → ${path.relative(process.cwd(), filePath)}`);
            
        } catch (error) {
            console.error(`   ❌ Error exportando ${iconName} a ${format}:`, error.message);
            throw error;
        }
    }
    
    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMEN');
        console.log('='.repeat(50));
        console.log(`   ✅ Iconos exportados: ${this.stats.processed}`);
        console.log(`   ❌ Errores: ${this.stats.errors}`);
        console.log('🎉 ¡Completado!');
    }
}

// --- EJECUCIÓN DE PRUEBA CON COLORES EXPLÍCITOS ---

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '')) {
    console.log('🎨 PRUEBA DE COLORES DE ICONOS\n');
    
    const testConfig = {
        collections: ["mdi"], // Usar Material Design Icons
        outputDir: "./test-output",
        defaultSize: 64, // Tamaño más grande para mejor visibilidad
        defaultColor: "#FF0000", // ROJO brillante
        iconsToExport: ["home", "heart", "star", "alert"], // Iconos simples
        formats: ['svg', 'png'], // Solo SVG y PNG para prueba
        fileNaming: {
            pattern: "{icon}-{color}",
            case: "kebab"
        },
        folderStructure: {
            enabled: true,
            pattern: "{collection}",
            groupByFormat: true
        }
    };
    
    const exporter = new IconExporter(testConfig);
    
    // Función para testear múltiples colores
    async function testMultipleColors() {
        console.log('🌈 Probando diferentes colores:\n');
        
        const colors = [
            "#FF0000", // Rojo
            "#00FF00", // Verde brillante
            "#0000FF", // Azul
            "#FF00FF", // Magenta
            "#FFFF00", // Amarillo
        ];
        
        let totalProcessed = 0;
        let totalErrors = 0;
        
        for (const color of colors) {
            console.log(`\n🎨 Probando color: ${color}`);
            
            // Crear nuevo exportador con este color
            const colorExporter = new IconExporter({
                ...testConfig,
                defaultColor: color,
                outputDir: `./test-output/${color.replace('#', '')}`
            });
            
            try {
                await colorExporter.exportIcons();
                totalProcessed += colorExporter.stats.processed;
                totalErrors += colorExporter.stats.errors;
                
                // Verificar que los archivos se crearon
                const testFile = path.join(colorExporter.config.outputDir, 'mdi', 'svg', `home-${color.replace('#', '')}.svg`);
                try {
                    const content = await fs.readFile(testFile, 'utf8');
                    if (content.includes(color)) {
                        console.log(`   ✓ Color ${color} aplicado correctamente`);
                    } else {
                        console.log(`   ⚠️  Color ${color} no detectado en SVG`);
                    }
                } catch {
                    console.log(`   ❌ No se pudo verificar archivo SVG`);
                }
                
            } catch (error) {
                console.error(`   Error con color ${color}:`, error.message);
                totalErrors++;
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMEN FINAL');
        console.log('='.repeat(50));
        console.log(`   Total procesados: ${totalProcessed}`);
        console.log(`   Total errores: ${totalErrors}`);
        console.log(`   Directorio de salida: ./test-output/`);
    }
    
    // Ejecutar prueba
    testMultipleColors().catch(console.error);
}

// Exportaciones
export { IconExporter };
export default IconExporter;