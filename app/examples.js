import { createExporter } from './IconExporter.js';
import { SIZE_PRESETS } from './sizeConfig.js';

// Ejemplo 1: Iconos cuadrados con tamaños estándar
const squareConfig = {
    collections: ["nonicons", "devicon"],
    outputDir: "./icons/square",
    sizePreset: "SQUARE",
    defaultSize: 48,
    defaultColor: "blue",
    fileNaming: {
        pattern: "{icon}-{size}",
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: true,
        groupBySizeType: true
    }
};

// Ejemplo 2: Iconos rectangulares para banners
const rectangularConfig = {
    collections: ["nonicons"],
    outputDir: "./icons/rectangular",
    sizePreset: "RECTANGULAR",
    defaultColor: "green",
    fileNaming: {
        pattern: "{icon}-{size}",
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: true,
        groupBySizeType: true
    }
};

// Ejemplo 3: Tamaños personalizados (mezcla de cuadrados y rectangulares)
const customSizesConfig = {
    collections: ["devicon"],
    outputDir: "./icons/custom",
    customSizes: [
        24, 32, 48, // Tamaños cuadrados
        { width: 300, height: 150 }, // Rectangular personalizado
        { width: 400, height: 200 }  // Rectangular personalizado
    ],
    defaultColor: "purple",
    fileNaming: {
        pattern: "{collection}-{icon}-{size}",
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: true,
        groupBySizeType: true
    }
};

// Ejemplo 4: Para redes sociales
const socialConfig = {
    collections: ["skill-icons"],
    outputDir: "./icons/social",
    sizePreset: "SOCIAL_MEDIA",
    defaultColor: "#1877F2", // Color de Facebook
    fileNaming: {
        pattern: "social-{icon}-{size}",
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: true,
        groupBySizeType: true
    }
};

// Ejemplo 5: Múltiples colecciones con diferentes configuraciones
const multiCollectionConfig = {
    collections: ["nonicons", "devicon", "skill-icons"],
    outputDir: "./icons/multi",
    sizePreset: "SQUARE",
    defaultSize: 32,
    defaultColor: "currentColor",
    iconsToExport: ["github", "javascript", "react", "vue", "python"],
    fileNaming: {
        pattern: "{collection}-{icon}",
        case: "kebab"
    },
    folderStructure: {
        enabled: true,
        pattern: "{collection}",
        groupBySize: false,
        groupByColor: false,
        groupBySizeType: false
    }
};

// Ejecutar ejemplos
async function runExamples() {
    try {
        console.log("🚀 Exportando iconos cuadrados...");
        const squareExporter = createExporter(squareConfig);
        await squareExporter.exportIcons();
        
        console.log("\n🚀 Exportando iconos rectangulares...");
        const rectangularExporter = createExporter(rectangularConfig);
        await rectangularExporter.exportIcons();
        
        console.log("\n🚀 Exportando tamaños personalizados...");
        const customExporter = createExporter(customSizesConfig);
        await customExporter.exportIcons();
        
        console.log("\n🎉 Todos los ejemplos completados!");
    } catch (error) {
        console.error("❌ Error en ejemplos:", error);
    }
}

// runExamples(); // Descomentar para ejecutar

// Exportar funciones de ejemplo
export {
    squareConfig,
    rectangularConfig,
    customSizesConfig,
    socialConfig,
    multiCollectionConfig,
    runExamples
};