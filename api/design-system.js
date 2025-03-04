const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'mcp-design-system.json');
    const designSystem = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (req.query.section === 'tokens') {
      res.status(200).json(designSystem.tokens);
    } else if (req.query.section === 'components') {
      res.status(200).json(designSystem.components);
    } else {
      res.status(200).json(designSystem);
    }
  } catch (error) {
    console.error('Error loading design system:', error);
    res.status(500).json({ error: 'Failed to load design system.' });
  }
};
