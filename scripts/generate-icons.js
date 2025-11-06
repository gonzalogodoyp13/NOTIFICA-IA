// Generate PWA icons for NOTIFICA IA
// Creates proper 192x192 and 512x512 PNG icons with app branding

const fs = require('fs')
const path = require('path')

// Check if sharp is available
let sharp
try {
  sharp = require('sharp')
} catch (e) {
  console.error('Error: sharp is required. Install it with: npm install --save-dev sharp')
  process.exit(1)
}

const iconsDir = path.join(process.cwd(), 'public', 'icons')

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// Generate icons with proper sizes
const sizes = [192, 512]

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}.png`)

    try {
      // Create SVG content for the icon
      const fontSize = Math.floor(size * 0.15)
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${size}" height="${size}" fill="#0ea5e9"/>
          <text 
            x="50%" 
            y="50%" 
            font-family="Arial, sans-serif" 
            font-size="${fontSize}" 
            font-weight="bold" 
            fill="white" 
            text-anchor="middle" 
            dominant-baseline="central"
          >NOTIFICA</text>
        </svg>
      `

      // Convert SVG to PNG with sharp
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(outputPath)

      console.log(`✓ Generated icon-${size}.png (${size}x${size})`)
    } catch (err) {
      console.error(`Error generating icon-${size}.png:`, err)
      process.exit(1)
    }
  }

  console.log('\n✓ Icon generation complete!')
  console.log('Note: Replace these with proper branded icons before production.')
}

generateIcons().catch((err) => {
  console.error('Failed to generate icons:', err)
  process.exit(1)
})

