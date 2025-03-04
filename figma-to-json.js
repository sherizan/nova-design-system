require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const FIGMA_API_URL = 'https://api.figma.com/v1';
const FILE_KEY = process.env.FIGMA_FILE_KEY;
const TOKEN = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

const headers = { 'X-Figma-Token': TOKEN };

async function fetchFigmaFile() {
  const res = await axios.get(`${FIGMA_API_URL}/files/${FILE_KEY}`, { headers });
  return res.data;
}

async function fetchStyles() {
  const res = await axios.get(`${FIGMA_API_URL}/files/${FILE_KEY}/styles`, { headers });
  return res.data.meta.styles;
}

async function fetchStyleNodes(styleIds) {
  const res = await axios.get(`${FIGMA_API_URL}/files/${FILE_KEY}/nodes?ids=${styleIds}`, { headers });
  return res.data.nodes;
}

function rgbaToHex(r, g, b, a = 1) {
  const to255 = v => Math.round(v * 255);
  return `#${[r, g, b].map(to255).map(v => v.toString(16).padStart(2, '0')).join('')}${a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : ''}`;
}

function extractColor(paint) {
  if (!paint || paint.type !== 'SOLID') return '';
  const { r, g, b, a } = paint.color;
  return rgbaToHex(r, g, b, a);
}

function extractTypography(style) {
  return {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeightPx ? `${style.lineHeightPx}px` : 'normal',
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : 'normal'
  };
}

function extractShadow(effect) {
  if (!effect) return {};
  return {
    color: rgbaToHex(
      effect.color.r,
      effect.color.g,
      effect.color.b,
      effect.color.a
    ),
    offsetX: `${effect.offset.x}px`,
    offsetY: `${effect.offset.y}px`,
    blurRadius: `${effect.radius}px`
  };
}

function mapValuesToNames(values) {
  const sorted = values.filter(Boolean).sort((a, b) => a - b);
  const names = ['small', 'medium', 'large'];
  return sorted.reduce((acc, val, index) => {
    acc[names[index] || `size${index + 1}`] = `${val}px`;
    return acc;
  }, {});
}

function extractComponents(document) {
  const components = [];

  function traverse(node) {
    if (node.type === 'COMPONENT_SET') {
      const props = {};
      if (node.componentPropertyDefinitions) {
        Object.entries(node.componentPropertyDefinitions).forEach(([key, value]) => {
          props[key] = {
            type: value.type,
            options: value.variantOptions
          };
        });
      }

      components.push({
        name: node.name,
        description: node.description || '',
        props,
        examples: [`<${node.name} ${Object.keys(props).map(prop => `${prop}=""`).join(' ')} />`],
        figma_url: `https://www.figma.com/file/${FILE_KEY}?node-id=${encodeURIComponent(node.id)}`
      });
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  traverse(document);
  return components;
}

async function main() {
  try {
    const [fileData, stylesData] = await Promise.all([
      fetchFigmaFile(),
      fetchStyles()
    ]);

    const styleIds = stylesData.map(s => s.node_id).join(',');
    const nodesData = await fetchStyleNodes(styleIds);

    const tokens = {
      colors: {},
      typography: {},
      shadows: {},
      borderRadius: {},
      spacing: {},
      strokeWidth: {}
    };

    stylesData.forEach(style => {
      const node = nodesData[style.node_id]?.document;

      if (style.style_type === 'FILL') {
        const paint = node.fills?.[0];
        tokens.colors[style.name] = {
          value: extractColor(paint),
          description: style.description || '',
          figma_id: style.node_id
        };
      } else if (style.style_type === 'TEXT') {
        tokens.typography[style.name] = {
          value: extractTypography(node.style),
          description: style.description || '',
          figma_id: style.node_id
        };
      } else if (style.style_type === 'EFFECT') {
        const effect = node.effects?.find(e => e.type === 'DROP_SHADOW');
        tokens.shadows[style.name] = {
          value: extractShadow(effect),
          description: style.description || '',
          figma_id: style.node_id
        };
      }
    });

    const borderRadiusSet = new Set();
    const spacingSet = new Set();
    const strokeWidthSet = new Set();

    function traverse(node) {
      if (node.cornerRadius !== undefined) borderRadiusSet.add(node.cornerRadius);
      if (node.strokeWeight !== undefined) strokeWidthSet.add(node.strokeWeight);
      if (
        node.paddingLeft !== undefined ||
        node.paddingRight !== undefined ||
        node.paddingTop !== undefined ||
        node.paddingBottom !== undefined
      ) {
        spacingSet.add(node.paddingLeft);
        spacingSet.add(node.paddingRight);
        spacingSet.add(node.paddingTop);
        spacingSet.add(node.paddingBottom);
      }
      if (node.children) node.children.forEach(traverse);
    }

    traverse(fileData.document);

    tokens.borderRadius = mapValuesToNames(Array.from(borderRadiusSet));
    tokens.spacing = mapValuesToNames(Array.from(spacingSet));
    tokens.strokeWidth = mapValuesToNames(Array.from(strokeWidthSet));

    const components = extractComponents(fileData.document);

    const designSystem = {
      name: 'My Design System',
      description: 'Auto-generated from Figma',
      tokens,
      components
    };

    fs.writeFileSync('mcp-design-system.json', JSON.stringify(designSystem, null, 2));
    console.log(
      `✅ MCP JSON created with ${components.length} components and ${
        Object.keys(tokens.colors).length +
        Object.keys(tokens.typography).length +
        Object.keys(tokens.shadows).length +
        Object.keys(tokens.borderRadius).length +
        Object.keys(tokens.spacing).length +
        Object.keys(tokens.strokeWidth).length
      } tokens.`
    );
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

main();
