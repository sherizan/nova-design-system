const fs = require('fs');

module.exports = (req, res) => {
  const designSystem = JSON.parse(fs.readFileSync('mcp-design-system.json', 'utf-8'));

  if (req.query.section === 'tokens') {
    res.status(200).json(designSystem.tokens);
  } else if (req.query.section === 'components') {
    res.status(200).json(designSystem.components);
  } else {
    res.status(200).json(designSystem);
  }
};
