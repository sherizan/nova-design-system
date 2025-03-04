require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const FIGMA_API_URL = 'https://api.figma.com/v1';
const FILE_KEY = process.env.FIGMA_FILE_KEY;
const TOKEN = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

const headers = { 'X-Figma-Token': TOKEN };

const rgbaToHex = (r, g, b, a = 1) =>
  `#${[r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}${a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : ''}`;

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

function extractColor(paint) {
  if (!paint || paint.type !== 'SOLID') return '#000000';
  const { r, g, b, a } = paint.color;
  return rgbaToHex(r, g, b, a);
}

function extractTypography(style = {}) {
  return {
    fontFamily: style.fontFamily || 'Default',
    fontSize: `${style.fontSize || 16}px`,
    fontWeight: style.fontWeight || 400,
    lineHeight: style.lineHeightPx ? `${style.lineHeightPx}px` : 'normal',
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : 'normal'
  };
}

function extractShadow(effect) {
  if (!effect) return {
    color: '#000000',
    offsetX: '0px',
    offsetY: '0px',
    blurRadius: '0px'
  };
  return {
    color: rgbaToHex(effect.color.r, effect.color.g, effect.color.b, effect.color.a),
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

function extractComponents(node, components = []) {
  if (node.type === 'COMPONENT_SET') {
    const props = {};
    if (node.componentPropertyDefinitions) {
      for (const [key, value] of Object.entries(node.componentPropertyDefinitions)) {
        props[key] = {
          type: value.type || 'UNKNOWN',
          options: value.variantOptions || []
        };
      }
    }

    const exampleProps = Object.entries(props)
      .map(([key, val]) => `${key}="${val.options[0] || 'default'}"`)
      .join(' ');

    components.push({
      name: node.name || 'Unnamed Component',
      description: node.description || 'No description provided.',
      figma_url: `https://www.figma.com/file/${FILE_KEY}?node-id=${encodeURIComponent(node.id)}`,
      props,
      examples: [`<${node.name} ${exampleProps} />`]
    });
  }
  if (node.children) {
    node.children.forEach(child => extractComponents(child, components));
  }
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
      const node = nodesData[style.node_id]?.document || {};

      if (style.style_type === 'FILL') {
        const paint = node.fills?.[0];
        tokens.colors[style.name] = {
          value: extractColor(paint),
          description: style.description || 'No description.',
          figma_id: style.node_id
        };
      } else if (style.style_type === 'TEXT') {
        tokens.typography[style.name] = {
          value: extractTypography(node.style),
          description: style.description || 'No description.',
          figma_id: style.node_id
        };
      } else if (style.style_type === 'EFFECT') {
        const effect = node.effects?.find(e => e.type === 'DROP_SHADOW');
        tokens.shadows[style.name] = {
          value: extractShadow(effect),
          description: style.description || 'No description.',
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
      ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].forEach(padding => {
        if (node[padding] !== undefined) spacingSet.add(node[padding]);
      });
      if (node.children) node.children.forEach(traverse);
    }

    traverse(fileData.document);

    tokens.borderRadius = mapValuesToNames([...borderRadiusSet]);
    tokens.spacing = mapValuesToNames([...spacingSet]);
    tokens.strokeWidth = mapValuesToNames([...strokeWidthSet]);

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
        Object.values(tokens).reduce((sum, group) => sum + Object.keys(group).length, 0)
      } tokens.`
    );
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

main();
