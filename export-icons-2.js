// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración
const CONFIG = {
    collections: ["nonicons"], // Múltiples colecciones
    icons: {
        // Iconos específicos por colección
        "nonicons": [],
        // "mdi": ["account", "email", "settings"],
        // "tabler": ["chart-pie", "device-laptop", "bell"]
    },
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "currentColor", // Mejor usar currentColor para flexibilidad
    verbose: true,
    format: "svg" // Posibilidad de expandir a otros formatos
};

// 🎨 Utilidades
class Logger {
    static success(message) {
        console.log(`✅ ${message}`);
    }

    static warning(message) {
        console.warn(`⚠️  ${message}`);
    }

    static error(message) {
        console.error(`❌ ${message}`);
    }

    static info(message) {
        if (CONFIG.verbose) {
            console.log(`ℹ️  ${message}`);
        }
    }
}

// 🛠️ Funciones de procesamiento
class IconProcessor {
    static async processIcon(collection, iconName, iconData) {
        try {
            const renderData = iconToSVG(iconData, {
                height: `${CONFIG.defaultSize}px`,
                width: `${CONFIG.defaultSize}px`
            });

            let svgBody = renderData.body;

            // Aplicar color solo si no tiene fill definido y se especificó color
            if (CONFIG.defaultColor && !this.hasFillAttribute(svgBody)) {
                svgBody = this.applyColor(svgBody, CONFIG.defaultColor);
            }

            const svgContent = this.buildSVG(renderData.attributes.viewBox, svgBody);
            return svgContent;
        } catch (error) {
            throw new Error(`Error procesando icono ${iconName}: ${error.message}`);
        }
    }

    static hasFillAttribute(svgBody) {
        return /fill=("|')[^"']*("|')/.test(svgBody);
    }

    static applyColor(svgBody, color) {
        // Aplicar color a todos los elementos path que no tengan fill
        return svgBody.replace(/<path(\s+(?!fill=)[^>]*)?>/g,
            (match) => match.includes('fill=') ? match : match.replace('<path', `<path fill="${color}"`));
    }

    static buildSVG(viewBox, body) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="${viewBox}" 
     width="${CONFIG.defaultSize}" 
     height="${CONFIG.defaultSize}">
    ${body}
</svg>`;
    }
}

// 📁 Gestor de archivos
class FileManager {
    static async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            Logger.info(`Directorio verificado: ${dirPath}`);
        } catch (error) {
            throw new Error(`Error creando directorio: ${error.message}`);
        }
    }

    static async writeSVGFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content, "utf8");
            return true;
        } catch (error) {
            throw new Error(`Error escribiendo archivo: ${error.message}`);
        }
    }

    static getFileName(collection, iconName) {
        return `${collection}-${iconName}.${CONFIG.format}`;
    }
}

// 🏗️ Función principal
class IconExporter {
    static async exportIcons() {
        Logger.info("Iniciando exportación de iconos...");
        Logger.info(`Colecciones: ${CONFIG.collections.join(", ")}`);

        try {
            await FileManager.ensureDirectory(CONFIG.outputDir);

            let totalExported = 0;
            let totalSkipped = 0;

            for (const collection of CONFIG.collections) {
                Logger.info(`Procesando colección: ${collection}`);

                try {
                    const collectionStats = await this.processCollection(collection);
                    totalExported += collectionStats.exported;
                    totalSkipped += collectionStats.skipped;
                } catch (error) {
                    Logger.error(`Error procesando colección ${collection}: ${error.message}`);
                }
            }

            Logger.success(`Exportación completada: ${totalExported} iconos exportados, ${totalSkipped} omitidos`);

        } catch (error) {
            Logger.error(`Error general: ${error.message}`);
            throw error;
        }
    }

    static async processCollection(collection) {
        const jsonPath = locate(collection);
        const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

        const iconsToProcess = CONFIG.icons[collection] || Object.keys(data.icons);
        let exported = 0;
        let skipped = 0;

        Logger.info(`Procesando ${iconsToProcess.length} iconos en ${collection}`);

        for (const iconName of iconsToProcess) {
            try {
                if (!data.icons[iconName]) {
                    Logger.warning(`Icono "${iconName}" no existe en ${collection}`);
                    skipped++;
                    continue;
                }

                const iconData = getIconData(data, iconName);
                if (!iconData) {
                    Logger.warning(`Datos inválidos para "${iconName}" en ${collection}`);
                    skipped++;
                    continue;
                }

                const svgContent = await IconProcessor.processIcon(collection, iconName, iconData);
                const fileName = FileManager.getFileName(collection, iconName);
                const filePath = path.join(CONFIG.outputDir, fileName);

                await FileManager.writeSVGFile(filePath, svgContent);
                Logger.success(`${collection}/${iconName}`);
                exported++;

            } catch (error) {
                Logger.error(`Error procesando ${collection}/${iconName}: ${error.message}`);
                skipped++;
            }
        }

        return { exported, skipped };
    }
}

// 🚀 Ejecución
async function main() {
    const startTime = Date.now();

    try {
        await IconExporter.exportIcons();

        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
        Logger.info(`Tiempo de ejecución: ${executionTime}s`);

    } catch (error) {
        Logger.error(`Error fatal: ${error.message}`);
        process.exit(1);
    }
}

// Manejo de señales de terminación
process.on('SIGINT', () => {
    Logger.info("Proceso interrumpido por el usuario");
    process.exit(0);
});

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { IconExporter, CONFIG };