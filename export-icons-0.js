// 📦 Dependencias
import { promises as fs } from "fs";
import path from "path";
import { locate } from "@iconify/json";
import { getIconData, iconToSVG } from "@iconify/utils";

// ⚙️ Configuración
const collections = ["nonicons"]; // sets de iconos
const iconsToExport = [];   // nombres de iconos
const outputDir = "./icons";      // carpeta de salida
const defaultSize = 48;           // tamaño en px
const defaultColor = "red";       // color (ej: "red", "#00ffcc", "currentColor")

// 🛠️ Función principal
async function exportIcons() {
    await fs.mkdir(outputDir, { recursive: true });

    for (const collection of collections) {
        const jsonPath = locate(collection); // Localiza JSON del set
        const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

        for (const iconName of iconsToExport) {
            if (!data.icons[iconName]) {
                console.warn(`⚠️  Icono "${iconName}" no existe en ${collection}`);
                continue;
            }

            // Obtener datos del icono
            const iconData = getIconData(data, iconName);

            // Convertir a SVG
            const svg = iconToSVG(iconData, {
                height: defaultSize,
            });

            // Agregar color
            let svgCode = svg.body;
            if (!/fill="/.test(svgCode)) {
                svgCode = svgCode.replace("<svg", `<svg fill="${defaultColor}"`);
            }

            // Armar archivo SVG
            const svgFile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.attributes.viewBox}" width="${defaultSize}" height="${defaultSize}">${svgCode}</svg>`;

            const filePath = path.join(outputDir, `${collection}-${iconName}.svg`);
            await fs.writeFile(filePath, svgFile, "utf8");

            console.log(`✅ Exportado: ${filePath}`);
        }
    }
}

exportIcons().catch((err) => console.error("❌ Error:", err));
