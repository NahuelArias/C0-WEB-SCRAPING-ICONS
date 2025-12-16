// 📏 Configuración de tamaños para iconos
export const SIZE_PRESETS = Object.freeze({
    // Tamaños cuadrados estándar
    SQUARE: {
        name: 'square',
        sizes: [16, 24, 32, 48, 64, 96, 128, 256, 512]
    },
    
    // Tamaños rectangulares comunes (ancho x alto)
    RECTANGULAR: {
        name: 'rectangular',
        sizes: [
            { width: 32, height: 16 },   // Banner pequeño
            { width: 64, height: 32 },   // Banner mediano
            { width: 128, height: 64 },  // Banner grande
            { width: 300, height: 150 }, // Card horizontal
            { width: 400, height: 200 }, // Header pequeño
            { width: 800, height: 400 }, // Header grande
            { width: 120, height: 60 },  // Logo horizontal
            { width: 240, height: 120 }  // Logo grande
        ]
    },
    
    // Tamaños para dispositivos móviles
    MOBILE: {
        name: 'mobile',
        sizes: [
            { width: 375, height: 812 },  // iPhone 13 mini
            { width: 390, height: 844 },  // iPhone 14/15
            { width: 428, height: 926 },  // iPhone 14/15 Plus
            { width: 393, height: 852 },  // iPhone 15 Pro
            { width: 430, height: 932 }   // iPhone 15 Pro Max
        ]
    },
    
    // Tamaños para redes sociales
    SOCIAL_MEDIA: {
        name: 'social',
        sizes: [
            { width: 1200, height: 630 },   // Facebook/Twitter
            { width: 1080, height: 1080 },  // Instagram square
            { width: 1080, height: 566 },   // Instagram portrait
            { width: 1080, height: 1350 },  // Instagram story
            { width: 1200, height: 1200 },  // Pinterest
            { width: 1584, height: 396 },   // LinkedIn banner
            { width: 400, height: 400 }     // LinkedIn profile
        ]
    }
});

/**
 * Determina si una configuración de tamaño es cuadrada o rectangular
 */
export function getSizeType(sizes) {
    if (!Array.isArray(sizes) || sizes.length === 0) {
        return 'unknown';
    }
    
    const firstSize = sizes[0];
    
    // Si es un número, es cuadrado
    if (typeof firstSize === 'number') {
        return 'square';
    }
    
    // Si es un objeto con width y height, es rectangular
    if (typeof firstSize === 'object' && firstSize.width && firstSize.height) {
        return 'rectangular';
    }
    
    return 'unknown';
}

/**
 * Valida un array de tamaños
 */
export function validateSizes(sizes) {
    if (!Array.isArray(sizes) || sizes.length === 0) {
        throw new Error('El array de tamaños no puede estar vacío');
    }
    
    const sizeType = getSizeType(sizes);
    
    if (sizeType === 'square') {
        sizes.forEach((size, index) => {
            if (typeof size !== 'number' || size <= 0) {
                throw new Error(`Tamaño inválido en posición ${index}: ${size}. Los tamaños cuadrados deben ser números positivos.`);
            }
        });
    } else if (sizeType === 'rectangular') {
        sizes.forEach((size, index) => {
            if (typeof size !== 'object' || !size.width || !size.height) {
                throw new Error(`Tamaño rectangular inválido en posición ${index}. Debe tener propiedades width y height.`);
            }
            if (size.width <= 0 || size.height <= 0) {
                throw new Error(`Dimensiones inválidas en posición ${index}: ${size.width}x${size.height}. Ambas deben ser positivas.`);
            }
        });
    } else {
        throw new Error('Formato de tamaños no reconocido. Use números para cuadrados u objetos {width, height} para rectangulares.');
    }
    
    return sizeType;
}

/**
 * Obtiene un preset de tamaños por nombre
 */
export function getSizePreset(presetName) {
    const preset = SIZE_PRESETS[presetName.toUpperCase()];
    if (!preset) {
        throw new Error(`Preset de tamaños no encontrado: ${presetName}`);
    }
    return preset;
}