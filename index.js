// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración por defecto
const DEFAULT_CONFIG = {
    collections: ["nonicons"],
    iconsToExport: [],
    outputDir: "./icons",
    defaultSize: 48,
    defaultColor: "red",
};

// 🎨 Clase para manejar la exportación de iconos
class IconExporter {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Crea el directorio de salida si no existe
     */
    async ensureOutputDir() {
        try {
            await fs.mkdir(this.config.outputDir, { recursive: true });
        } catch (error) {
            throw new Error(`No se pudo crear el directorio: ${error.message}`);
        }
    }

    /**
     * Carga y parsea los datos de una colección de iconos
     */
    async loadCollectionData(collections) {
        try {
            const jsonPath = locate(collections);
            if (!jsonPath) {
                throw new Error(`Colección "${collections}" no encontrada`);
            }

            const jsonContent = await fs.readFile(jsonPath, "utf8");
            return JSON.parse(jsonContent);
        } catch (error) {
            throw new Error(`Error cargando colección "${collections}": ${error.message}`);
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
    applySvgColor(svgBody) {
        if (!/fill=("|')[^"']*("|')/.test(svgBody) && this.config.defaultColor) {
            return svgBody.replace(/<path/g, `<path fill="${this.config.defaultColor}"`);
        }
        return svgBody;
    }

    /**
     * Genera el contenido SVG completo
     */
    generateSvgContent(renderData, processedBody) {
        const { defaultSize } = this.config;
        const { viewBox } = renderData.attributes;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${defaultSize}" height="${defaultSize}">
    ${processedBody}
</svg>`;
    }

    /**
     * Procesa un solo icono
     */
    async processIcon(data, iconName, collection) {
        try {
            // Obtener datos del icono
            const iconData = getIconData(data, iconName);
            if (!iconData) {
                console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
                return false;
            }

            // Convertir a SVG
            const renderData = iconToSVG(iconData, {
                height: `${this.config.defaultSize}px`,
                width: `${this.config.defaultSize}px`
            });

            // Aplicar color
            const processedBody = this.applySvgColor(renderData.body);

            // Generar SVG completo
            const svgContent = this.generateSvgContent(renderData, processedBody);

            // Guardar archivo
            const fileName = `${collection}-${iconName}.svg`;
            const filePath = path.join(this.config.outputDir, fileName);

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
     * Exporta todos los iconos de todas las colecciones
     */
    async exportIcons() {
        const startTime = Date.now();

        try {
            await this.ensureOutputDir();

            let totalProcessed = 0;
            let totalErrors = 0;
            let totalIcons = 0;

            for (const collection of this.config.collections) {
                console.log(`📦 Procesando colección: ${collection}`);

                const result = await this.processCollection(collection);
                totalProcessed += result.processedCount;
                totalErrors += result.errorCount;
                totalIcons += result.total;

                console.log(`   ${result.processedCount}/${result.total} iconos exportados`);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log("\n📊 Resumen de exportación:");
            console.log(`   ✅ Exitosos: ${totalProcessed}`);
            console.log(`   ❌ Errores: ${totalErrors}`);
            console.log(`   📄 Total: ${totalIcons}`);
            console.log(`   ⏱️  Tiempo: ${duration}s`);
            console.log("🎉 Exportación completada!");

        } catch (error) {
            console.error("❌ Error fatal:", error.message);
            process.exit(1);
        }
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

// 🏃‍♂️ Ejecución directa del script
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    const exporter = new IconExporter();
    exporter.exportIcons();
}