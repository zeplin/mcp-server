# Zeplin MCP server: AI-assisted UI development

Connect AI agents like Cursor, Windsurf, and VS Code (w/ Copilot) to Zeplin. Using the MCP server, AI agents can tap into:

- **Component and screen specs:** Detailed specs and assets for both components and entire screens — helping agents generate UI code that closely matches the designs.
- **Documentation:** Annotations added to screens that provide extra context, like how things should behave or tips for implementation — letting the agent go beyond static visuals and build real interactions.
- **Design tokens:** Colors, typography, spacing, and other design variables used across the project, so your agent can reuse existing tokens where possible.

## Table of contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development](#development)
- [Usage with MCP Clients (e.g., Cursor)](#usage-with-mcp-clients-eg-cursor)
- [Crafting Effective Prompts](#crafting-effective-prompts)
  - [Example Prompt 1: Minor Changes/Additions](#example-prompt-1-minor-changesadditions)
  - [Example Prompt 2: Complex Implementations (Component-First)](#example-prompt-2-complex-implementations-component-first)

## Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- A Zeplin account.
- A Zeplin personal access token. You can generate one from your Zeplin profile, under "Developer" > "Personal access tokens".

## Installation

### Cursor one-click installation

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=zeplin&config=eyJjb21tYW5kIjoibnB4IC15IEB6ZXBsaW4vbWNwLXNlcnZlckBsYXRlc3QiLCJlbnYiOnsiWkVQTElOX0FDQ0VTU19UT0tFTiI6IiJ9fQ%3D%3D)

### Manual installation

To start using the MCP server, you first need to configure your client (e.g. Cursor, VS Code, Windsurf, Claude Code). Most clients have an option to add a new MCP server. When prompted, enter the following command:

```bash
npx @zeplin/mcp-server@latest
```

In addition, you also need to provide your Zeplin access token using the `ZEPLIN_ACCESS_TOKEN` environment variable.

For example, if you’re using Cursor, here’s how your MCP settings should look like:

```jsonc
{
  "mcpServers": {
    "zeplin": {
      "command": "npx",
      "args": ["@zeplin/mcp-server@latest"],
      "env": {
        "ZEPLIN_ACCESS_TOKEN": "<YOUR_ZEPLIN_PERSONAL_ACCESS_TOKEN>" // Replace with your actual token
      }
    }
  }
}
```

## Development

The project includes several npm scripts to help with development:

```bash
# Run TypeScript compiler in watch mode for development
npm run dev

# Build the project for production
npm run build

# Run ESLint on source files
npm run lint

# Automatically fix ESLint issues where possible
npm run lint:fix

# Test the MCP server locally with the inspector tool
npm run inspect
```

To run `npm run inspect`, create an `.env` file first in the root directory:

```bash
ZEPLIN_ACCESS_TOKEN=<YOUR_ZEPLIN_PERSONAL_ACCESS_TOKEN>
```

### Code style and linting

This project uses ESLint to enforce code quality and consistency. The configuration is in `eslint.config.js`. Key style guidelines include:

- 2 space indentation
- Double quotes for strings
- Semicolons required
- No trailing spaces
- Organized imports

When contributing to this project, please ensure your code follows these guidelines by running `npm run lint:fix` before submitting changes.

## Crafting effective prompts

The quality and specificity of your prompts significantly impact the AI’s ability to generate accurate and useful code. These are not mandatory but will definitely increase the output quality.

### Example prompt 1: Minor changes/additions

When you need to implement a small update or addition to an existing screen or component based on a new Zeplin design version.

```
The latest design for the following screen includes a new addition: a Checkbox component has been added to the MenuItem component, here is the short url of the screen <zeplin short url of the screen, e.g., https://zpl.io/abc123X>. Focus on the MenuItem component.

The Checkbox component can be found under the path/to/your/checkbox/component directory.
The relevant screen file is located at path/to/your/screen/file.tsx.
The MenuItem component, which needs to be modified, is located at path/to/your/menuitem/component.
Please implement this new addition.
```

Why this is effective:

- **Contextualizes the change:** Clearly states what’s new.
- **Provides the Zeplin link:** Allows the MCP server to fetch the latest design data.
- **Gives file paths:** Helps the AI locate existing code to modify.
- **Specifies components involved:** Narrows down the scope of work.

### Example prompt 2: Larger designs (Component-first)

For implementing larger screens or features, it’s often best to build individual components first and then assemble them.

```
Implement this component: <zeplin short url of the first component, e.g., https://zpl.io/def456Y>. Use Zeplin for design specifications.

(AI generates the first component...)

Implement this other component: <zeplin short url of the second component, e.g., https://zpl.io/ghi789Z>. Use Zeplin for design specifications.

(AI generates the second component...)

...

Now, using the components you just implemented (and any other existing components), implement the following screen: <zeplin short url of the screen, e.g., https://zpl.io/jkl012A>. Use Zeplin for the screen layout and any direct elements.
```

Why this is effective:

- **Breaks down complexity:** Tackles smaller, manageable pieces first.
- **Iterative approach:** Allows for review and correction at each step.
- **Builds on previous work:** The AI can use the components it just created.
- **Clear Zeplin references:** Ensures each piece is based on the correct design.

### Strategies to deal with context window limitations

When dealing with complex Zeplin screens or components with many variants and layers, the amount of design data fetched can sometimes be extensive. This can potentially exceed the context window limitations of the AI model you are using, leading to truncated information or less effective code generation. Here are several strategies to manage the amount of information sent to the model:

1.  **Limit screen variants (`includeVariants: false`):**

    - **How it works:** When using the `get_screen` tool, the model can be instructed to fetch only the specific screen version linked in the URL, rather than all its variants (e.g., different states, sizes, themes). This is done by setting the `includeVariants` parameter to `false` during the tool call.
    - **When to use:** If your prompt is focused on a single specific version of a screen, or if the variants are not immediately relevant to the task at hand. This significantly reduces the amount of data related to variant properties and their respective layer structures.
    - **Example prompt:** “Implement the login form from this screen: `https://zpl.io/abc123X`. I only need the specific version linked, not all its variants.”
      _The AI agent, when calling `get_screen`, should then ideally use `includeVariants: false`._

2.  **Focus on specific layers/components (`targetLayerName` or targeted prompts):**

    - **How it works (using `targetLayerName`):** The `get_screen` tool has a `targetLayerName` parameter. If the model can identify a specific layer name from your prompt (e.g., "the 'Submit Button'"), it can use this parameter. The server will then return data primarily for that layer and its children, rather than the entire screen's layer tree.
    - **How it works (targeted prompts):** Even without explicitly using `targetLayerName` in the tool call, very specific prompts can guide the model to internally prioritize or summarize information related to the mentioned element.
    - **When to use:** When your task involves a specific part of a larger screen, like a single button, an icon, or a text block.
    - **Example prompt:** “Focus on the 'UserProfileHeader' component within this screen: `https://zpl.io/screenXYZ`. I need to implement its layout and text styles.”
      _If the AI uses `get_screen`, it could populate `targetLayerName: "UserProfileHeader"`._

3.  **Iterative, component-first implementation:**
    - **How it works:** As detailed in [Example prompt 2: Larger designs (Component-first)](#example-prompt-2-larger-designs-component-first), break down the implementation of a complex screen into smaller, component-sized tasks.
    - **When to use:** For any non-trivial screen. This approach naturally limits the scope of each `get_component` or `get_screen` call to a manageable size.
    - **Benefit:** Each request to the Zeplin MCP server will fetch a smaller, more focused dataset, making it easier to stay within context limits and allowing the model to concentrate on one piece at a time.
