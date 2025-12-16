// 🎨 Utilidades para manipulación de SVG

/**
 * Genera el contenido SVG para un icono rectangular
 */
export function generateRectangularSVG(renderData, processedBody, width, height, viewBox = null) {
    const targetViewBox = viewBox || renderData.attributes.viewBox;
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${targetViewBox}" width="${width}" height="${height}">
    ${processedBody}
</svg>`;
}

/**
 * Ajusta el viewBox para dimensiones rectangulares manteniendo la relación de aspecto
 */
export function calculateRectangularViewBox(originalViewBox, targetWidth, targetHeight) {
    if (!originalViewBox) {
        return `0 0 ${targetWidth} ${targetHeight}`;
    }
    
    const [x, y, originalWidth, originalHeight] = originalViewBox.split(' ').map(Number);
    const originalAspect = originalWidth / originalHeight;
    const targetAspect = targetWidth / targetHeight;
    
    // Si las relaciones de aspecto son similares, usar el viewBox original
    if (Math.abs(originalAspect - targetAspect) < 0.1) {
        return originalViewBox;
    }
    
    // Ajustar viewBox para mantener la relación de aspecto
    if (targetAspect > originalAspect) {
        // El objetivo es más ancho, ajustar altura
        const newHeight = originalWidth / targetAspect;
        const yOffset = (originalHeight - newHeight) / 2;
        return `${x} ${y + yOffset} ${originalWidth} ${newHeight}`;
    } else {
        // El objetivo es más alto, ajustar ancho
        const newWidth = originalHeight * targetAspect;
        const xOffset = (originalWidth - newWidth) / 2;
        return `${x + xOffset} ${y} ${newWidth} ${originalHeight}`;
    }
}

/**
 * Procesa el cuerpo SVG para dimensiones rectangulares
 */
export function processSvgBodyForRectangular(renderData, width, height) {
    const { body, attributes } = renderData;
    const adjustedViewBox = calculateRectangularViewBox(attributes.viewBox, width, height);
    
    return {
        body,
        attributes: {
            ...attributes,
            viewBox: adjustedViewBox
        }
    };
}