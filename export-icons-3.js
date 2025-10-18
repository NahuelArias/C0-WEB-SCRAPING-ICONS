// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración
const CONFIG = {
    collections: ["nonicons"], // Sets de iconos a procesar
    iconsToExport: [], // Iconos específicos (vacío = todos)
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "red", // "red", "#00ffcc", "currentColor", null para sin color
    minifyOutput: true, // Minimizar SVG de salida
    skipExisting: false, // Saltar archivos que ya existen
    logLevel: "info" // "silent", "error", "warn", "info", "verbose"
};

// 📊 Estadísticas de exportación
class ExportStats {
    constructor() {
        this.exported = 0;
        this.skipped = 0;
        this.errors = 0;
        this.startTime = Date.now();
    }

    increment(type) {
        this[type]++;
    }

    getReport() {
        const duration = Date.now() - this.startTime;
        return {
            exported: this.exported,
            skipped: this.skipped,
            errors: this.errors,
            total: this.exported + this.skipped + this.errors,
            duration: `${duration}ms`
        };
    }
}

// 🖨️ Sistema de logging
class Logger {
    constructor(level = "info") {
        this.levels = { silent: 0, error: 1, warn: 2, info: 3, verbose: 4 };
        this.level = this.levels[level] || 3;
    }

    log(level, message, ...args) {
        if (this.levels[level] <= this.level) {
            const emoji = { error: "❌", warn: "⚠️", info: "ℹ️", verbose: "🔍" }[level] || "";
            console.log(`${emoji} ${message}`, ...args);
        }
    }

    error(message, ...args) { this.log("error", message, ...args); }
    warn(message, ...args) { this.log("warn", message, ...args); }
    info(message, ...args) { this.log("info", message, ...args); }
    verbose(message, ...args) { this.log("verbose", message, ...args); }
}

// 🎨 Procesador de SVG
class SVGProcessor {
    static addColorToSVG(svgBody, color) {
        if (!color || /fill=("|')[^"']*("|')/.test(svgBody)) {
            return svgBody;
        }

        // Agregar fill a elementos que no lo tienen
        return svgBody.replace(
            /<(path|circle|rect|ellipse|polygon|polyline)(?![^>]*fill=)/g,
            `<$1 fill="${color}"`
        );
    }

    static createSVG(renderData, size, svgBody) {
        const svg = CONFIG.minifyOutput
            ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${renderData.attributes.viewBox}" width="${size}" height="${size}">${svgBody}</svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" 
    viewBox="${renderData.attributes.viewBox}" 
    width="${size}" 
    height="${size}">
    ${svgBody}
</svg>`;
        return svg;
    }
}

// 📁 Gestor de archivos
class FileManager {
    static async ensureOutputDir(dir) {
        try {
            await fs.mkdir(dir, { recursive: true });
            return true;
        } catch (error) {
            throw new Error(`No se pudo crear el directorio ${dir}: ${error.message}`);
        }
    }

    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    static async writeIconFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content, "utf8");
            return true;
        } catch (error) {
            throw new Error(`Error al escribir ${filePath}: ${error.message}`);
        }
    }
}

// 🏗️ Procesador de colecciones
class CollectionProcessor {
    constructor(logger, stats) {
        this.logger = logger;
        this.stats = stats;
    }

    async loadCollection(collectionName) {
        try {
            const jsonPath = locate(collectionName);
            if (!jsonPath) {
                throw new Error(`Colección "${collectionName}" no encontrada`);
            }

            this.logger.verbose(`Cargando colección desde: ${jsonPath}`);
            const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

            if (!data.icons || Object.keys(data.icons).length === 0) {
                throw new Error(`La colección "${collectionName}" no contiene iconos`);
            }

            return data;
        } catch (error) {
            throw new Error(`Error al cargar la colección ${collectionName}: ${error.message}`);
        }
    }

    getIconsToProcess(data, iconsToExport) {
        if (iconsToExport.length > 0) {
            // Validar que los iconos solicitados existen
            const missing = iconsToExport.filter(icon => !data.icons[icon]);
            if (missing.length > 0) {
                this.logger.warn(`Iconos no encontrados: ${missing.join(", ")}`);
            }
            return iconsToExport.filter(icon => data.icons[icon]);
        }

        return Object.keys(data.icons);
    }

    async processIcon(data, iconName, collectionName) {
        try {
            // Obtener datos del icono
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                throw new Error("No se pudieron obtener los datos del icono");
            }

            // Convertir a SVG
            const renderData = iconToSVG(iconData, {
                height: `${CONFIG.defaultSize}px`,
                width: `${CONFIG.defaultSize}px`
            });

            // Procesar el cuerpo del SVG
            let svgBody = SVGProcessor.addColorToSVG(renderData.body, CONFIG.defaultColor);

            // Crear SVG completo
            const svgContent = SVGProcessor.createSVG(renderData, CONFIG.defaultSize, svgBody);

            // Generar nombre de archivo
            const fileName = `${collectionName}-${iconName}.svg`;
            const filePath = path.join(CONFIG.outputDir, fileName);

            // Verificar si ya existe y skipExisting está habilitado
            if (CONFIG.skipExisting && await FileManager.fileExists(filePath)) {
                this.logger.verbose(`Saltando archivo existente: ${fileName}`);
                this.stats.increment("skipped");
                return;
            }

            // Escribir archivo
            await FileManager.writeIconFile(filePath, svgContent);

            this.logger.info(`Exportado: ${fileName}`);
            this.stats.increment("exported");

        } catch (error) {
            this.logger.error(`Error procesando ${iconName}: ${error.message}`);
            this.stats.increment("errors");
        }
    }
}

// 🚀 Función principal mejorada
async function exportIcons() {
    const logger = new Logger(CONFIG.logLevel);
    const stats = new ExportStats();

    logger.info("🎯 Iniciando exportación de iconos...");
    logger.verbose("Configuración:", CONFIG);

    try {
        // Crear directorio de salida
        await FileManager.ensureOutputDir(CONFIG.outputDir);
        logger.verbose(`Directorio de salida creado: ${CONFIG.outputDir}`);

        const processor = new CollectionProcessor(logger, stats);

        // Procesar cada colección
        for (const collection of CONFIG.collections) {
            logger.info(`📦 Procesando colección: ${collection}`);

            try {
                // Cargar datos de la colección
                const data = await processor.loadCollection(collection);
                logger.verbose(`Colección cargada con ${Object.keys(data.icons).length} iconos`);

                // Determinar qué iconos procesar
                const iconsToProcess = processor.getIconsToProcess(data, CONFIG.iconsToExport);
                logger.info(`Procesando ${iconsToProcess.length} iconos de ${collection}`);

                // Procesar cada icono
                const promises = iconsToProcess.map(iconName =>
                    processor.processIcon(data, iconName, collection)
                );

                // Esperar a que todos los iconos se procesen (con límite de concurrencia)
                const BATCH_SIZE = 10;
                for (let i = 0; i < promises.length; i += BATCH_SIZE) {
                    const batch = promises.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch);
                }

            } catch (error) {
                logger.error(`Error procesando colección ${collection}: ${error.message}`);
                continue;
            }
        }

        // Reporte final
        const report = stats.getReport();
        logger.info("🎉 Exportación completada!");
        logger.info(`📊 Resumen: ${report.exported} exportados, ${report.skipped} saltados, ${report.errors} errores`);
        logger.info(`⏱️  Duración: ${report.duration}`);

        if (report.errors > 0) {
            logger.warn(`Se encontraron ${report.errors} errores durante la exportación`);
        }

    } catch (error) {
        logger.error(`Error crítico: ${error.message}`);
        process.exit(1);
    }
}

// 🏃‍♂️ Ejecutar solo si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
    exportIcons().catch(console.error);
}

// 📤 Exportar para uso como módulo
export { exportIcons, CONFIG };