function addWatermark(text, watermark) {
    // Convert watermark to binary
    let binaryWatermark = watermark.split('').map(char => {
        return char.charCodeAt(0).toString(2).padStart(8, '0');
    }).join('');

    // Mapping binary values to zero-width characters
    const zeroWidthChars = {
        '0': '\u200B', // zero-width space
        '1': '\u200C'  // zero-width non-joiner
    };

    // Add the watermark to the text
    let watermarkedText = text;
    binaryWatermark.split('').forEach(bit => {
        watermarkedText += zeroWidthChars[bit];
    });

    return watermarkedText;
}

// Function to extract the watermark from text
function extractWatermark(text) {
    const zeroWidthChars = {
        '\u200B': '0', // zero-width space
        '\u200C': '1'  // zero-width non-joiner
    };

    // Filter the zero-width characters from the text
    let binaryWatermark = '';
    for (let i = 0; i < text.length; i++) {
        if (zeroWidthChars[text[i]]) {
            binaryWatermark += zeroWidthChars[text[i]];
        }
    }

    // Convert binary to characters
    let watermark = '';
    for (let i = 0; i < binaryWatermark.length; i += 8) {
        let byte = binaryWatermark.slice(i, i + 8);
        watermark += String.fromCharCode(parseInt(byte, 2));
    }

    return watermark;
}

// let extractedWatermark = extractWatermark(watermarkedText);
// console.log('Extracted Watermark:', extractedWatermark);

// let originalText = "This is a secret message.";
// let watermark = "W";
// let watermarkedText = addWatermark(originalText, watermark);

// console.log(watermarkedText);

module.exports = { extractWatermark, addWatermark }
