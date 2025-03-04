export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    name: "Nova Design System",
    description: "A design system for Nova app.",
    tokens: {
      colors: {
        primary: { value: "#1A73E8", description: "Primary brand color" }
      }
    },
    components: [
      {
        name: "Button",
        description: "Primary button",
        figma_url: "https://www.figma.com/file/XXXXX?node-id=YYYY",
        props: {
          variant: ["primary", "secondary"],
          size: ["small", "large"],
          disabled: ["true", "false"]
        },
        examples: ["<Button variant='primary' size='large' />"]
      }
    ]
  });
}
