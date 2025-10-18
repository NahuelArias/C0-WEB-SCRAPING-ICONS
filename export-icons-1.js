// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración
const collections = ["nonicons"]; // sets de iconos
const iconsToExport = []; // nombres de iconos (ejemplo)
const outputDir = "./icons"; // carpeta de salida
const defaultSize = 48; // tamaño en px
const defaultColor = "red"; // color (ej: "red", "#00ffcc", "currentColor")

// 🛠️ Función principal
async function exportIcons() {
    try {
        await fs.mkdir(outputDir, { recursive: true });

        for (const collection of collections) {
            const jsonPath = locate(collection); // Localiza JSON del set
            const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

            // Si no hay iconos específicos, exportar todos los iconos de la colección
            const icons = iconsToExport.length > 0
                ? iconsToExport
                : Object.keys(data.icons);

            for (const iconName of icons) {
                if (!data.icons[iconName]) {
                    console.warn(`⚠️  Icono "${iconName}" no existe en ${collection}`);
                    continue;
                }

                // Obtener datos del icono
                const iconData = getIconData(data, iconName);

                if (!iconData) {
                    console.warn(`⚠️  No se pudieron obtener datos para "${iconName}"`);
                    continue;
                }

                // Convertir a SVG
                const renderData = iconToSVG(iconData, {
                    height: `${defaultSize}px`,
                    width: `${defaultSize}px`
                });

                // Agregar color si no tiene fill
                let svgBody = renderData.body;
                if (!/fill=("|')[^"']*("|')/.test(svgBody) && defaultColor) {
                    svgBody = svgBody.replace(/<path/g, `<path fill="${defaultColor}"`);
                }

                // Armar archivo SVG completo
                const svgFile = `<svg xmlns="http://www.w3.org/2000/svg" 
                    viewBox="${renderData.attributes.viewBox}" 
                    width="${defaultSize}" 
                    height="${defaultSize}">
                    ${svgBody}
                </svg>`;

                const filePath = path.join(outputDir, `${collection}-${iconName}.svg`);
                await fs.writeFile(filePath, svgFile, "utf8");

                console.log(`✅ Exportado: ${filePath}`);
            }
        }

        console.log("🎉 Exportación completada!");
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

exportIcons();