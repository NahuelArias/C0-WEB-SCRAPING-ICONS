// direct-icon-export.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getIconData, iconToSVG } from "@iconify/utils";
import { locate } from "@iconify/json";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadIconifyCollection(collectionName) {
    const jsonPath = locate(collectionName);
    const content = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(content);
}

function applyColorToSVG(svgString, color) {
    if (!color || color === 'currentColor') return svgString;
    
    let svg = svgString;
    
    // Método AGGRESIVO: Reemplazar TODOS los fills y strokes
    svg = svg.replace(/fill="[^"]*"/g, `fill="${color}"`);
    svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
    
    return svg;
}

async function exportColoredIcon(collection, iconName, size, color, outputDir) {
    try {
        // 1. Cargar colección
        const collectionData = await loadIconifyCollection(collection);
        
        // 2. Obtener datos del icono
        const iconData = getIconData(collectionData, iconName);
        if (!iconData) {
            throw new Error(`Icono ${iconName} no encontrado`);
        }
        
        // 3. Generar SVG
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
        
        // 4. Aplicar color MANUALMENTE
        svgContent = applyColorToSVG(svgContent, color);
        
        // 5. Crear directorio
        await fs.mkdir(outputDir, { recursive: true });
        
        // 6. Guardar SVG
        const svgFilename = `${iconName}-${color.replace('#', '')}.svg`;
        const svgPath = path.join(outputDir, svgFilename);
        await fs.writeFile(svgPath, svgContent);
        
        // 7. Convertir a PNG
        const pngFilename = `${iconName}-${color.replace('#', '')}.png`;
        const pngPath = path.join(outputDir, pngFilename);
        
        await sharp(Buffer.from(svgContent))
            .resize(size, size)
            .png()
            .toFile(pngPath);
        
        console.log(`✅ ${iconName} (${color}): SVG + PNG creados`);
        
        return { svgPath, pngPath };
        
    } catch (error) {
        console.error(`❌ Error con ${iconName}:`, error.message);
        return null;
    }
}

// FUNCIÓN PRINCIPAL
async function main() {
    console.log('🎨 EXPORTADOR DIRECTO DE ICONOS\n');
    
    const collection = "mdi";
    const icons = ["home", "heart", "star", "settings"];
    const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"];
    const size = 64;
    const baseDir = "./iconos-finales";
    
    let success = 0;
    let total = icons.length * colors.length;
    
    for (const icon of icons) {
        for (const color of colors) {
            const result = await exportColoredIcon(
                collection, 
                icon, 
                size, 
                color, 
                path.join(baseDir, color.replace('#', ''))
            );
            
            if (result) success++;
            
            // Pequeña pausa para no saturar
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`📊 ${success}/${total} iconos exportados exitosamente`);
    console.log(`📁 Directorio: ${path.resolve(baseDir)}`);
    
    // Verificar un archivo
    const testFile = path.join(baseDir, "ff0000", "home-ff0000.svg");
    try {
        const content = await fs.readFile(testFile, 'utf8');
        if (content.includes('#FF0000')) {
            console.log('✅ ¡Color aplicado correctamente!');
        } else {
            console.log('⚠️  Color no encontrado en el SVG');
        }
    } catch {
        console.log('❌ No se pudo verificar el archivo');
    }
}

// Ejecutar
main().catch(console.error);