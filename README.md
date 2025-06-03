# Zeplin MCP Server for AI-Assisted UI Implementation

This project is a Model Context Protocol server designed to assist developers in implementing UI screens and components directly from Zeplin designs. By providing Zeplin shortlinks (e.g., `https://zpl.io/...`) in your prompts to AI agents, this server fetches the necessary design specifications and asset details, enabling the models to generate corresponding code for your target framework.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development](#development)
- [Usage with MCP Clients (e.g., Cursor)](#usage-with-mcp-clients-eg-cursor)
- [Crafting Effective Prompts](#crafting-effective-prompts)
  - [Example Prompt 1: Minor Changes/Additions](#example-prompt-1-minor-changesadditions)
  - [Example Prompt 2: Complex Implementations (Component-First)](#example-prompt-2-complex-implementations-component-first)

## Features

*   **Seamless Zeplin Integration**: Fetch detailed design data for components and screens using simple Zeplin URLs (including `zpl.io` shortlinks).
*   **Code Generation Ready**: Provides AI models with structured data for conciseness and relevance.
*   **Asset Handling**: Automatically identifies and provides information for assets within designs. AI agents can then decide to download these assets (SVG, PNG, PDF, JPG) as needed for implementation.
*   **Targeted Implementation**: Facilitates implementation of entire screens or individual components, including their variants, layers, and annotations, directly from Zeplin specifications.

## Prerequisites

*   [Node.js](https://nodejs.org/) (v20.x or later recommended)
*   A Zeplin account.
*   A Zeplin Personal Access Token (PAT). You can generate one from your Zeplin profile settings under "Developer" > "Personal access tokens". This token will need `read` permissions for the projects/styleguides you want to access.

## Usage with MCP Clients (e.g., Cursor)

To integrate this server with an MCP client like Cursor, you need to configure the client to connect to this server. Add the following to Cursor's `settings.json` (accessible via `Cmd/Ctrl + Shift + P` -> "Configure Language Specific Settings..." -> "JSON") or a similar configuration file for MCP providers:

```jsonc
// In your MCP client's configuration (e.g., Cursor's settings.json)
{
  "mcpServers": {
    "zeplin-mcp": {
      "command": "npx",
      "args": [
        "@zeplin/mcp-server@latest"
      ],
      "env": {
        "ZEPLIN_ACCESS_TOKEN": "<YOUR_ZEPLIN_PERSONAL_ACCESS_TOKEN>" // Replace with your actual token
      }
    }
  }
}
```

## Development

This project includes several npm scripts to help you with development:

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

For debugging purposes if you want to run `npm run inspect` create a `.env` file in the root directory of the project with the following content:

```bash
ZEPLIN_ACCESS_TOKEN=your_zeplin_personal_access_token
```

Replace `your_zeplin_personal_access_token` with your actual Zeplin Personal Access Token.

### Code Style and Linting

This project uses ESLint to enforce code quality and consistency. The configuration is in `eslint.config.js`. Key style guidelines include:

- 2 space indentation
- Double quotes for strings
- Semicolons required
- No trailing spaces
- Organized imports

When contributing to this project, please ensure your code follows these guidelines by running `npm run lint:fix` before submitting changes.

## Crafting Effective Prompts

The quality and specificity of your prompts significantly impact the AI's ability to generate accurate and useful code. These are not mandatory but will increase the output quality. Here are some examples to guide you:

### Example Prompt 1: Minor Changes/Additions

When you need to implement a small update or addition to an existing screen or component based on a new Zeplin design version.

```
The latest design for the following screen includes a new addition: a Checkbox component has been added to the MenuItem component, here is the short url of the screen <zeplin short url of the screen, e.g., https://zpl.io/abc123X>. Focus on the MenuItem component.

The Checkbox component can be found under the path/to/your/checkbox/component directory.
The relevant screen file is located at path/to/your/screen/file.tsx.
The MenuItem component, which needs to be modified, is located at path/to/your/menuitem/component.
Please implement this new addition.
```

**Why this is effective:**
*   **Contextualizes the change:** Clearly states what's new.
*   **Provides the Zeplin link:** Allows the MCP server to fetch the latest design data.
*   **Gives file paths:** Helps the AI locate existing code to modify.
*   **Specifies components involved:** Narrows down the scope of work.

### Example Prompt 2: Complex Implementations (Component-First)

For implementing larger screens or features, it's often best to build individual components first and then assemble them.

```
Implement this component: <zeplin short url of the first component, e.g., https://zpl.io/def456Y>. Use Zeplin for design specifications.

(AI generates the first component...)

Implement this other component: <zeplin short url of the second component, e.g., https://zpl.io/ghi789Z>. Use Zeplin for design specifications.

(AI generates the second component...)

...

Now, using the components you just implemented (and any other existing components), implement the following screen: <zeplin short url of the screen, e.g., https://zpl.io/jkl012A>. Use Zeplin for the screen layout and any direct elements.
```

**Why this is effective:**

* **Breaks down complexity:** Tackles smaller, manageable pieces first.
* **Iterative approach:** Allows for review and correction at each step.
* **Builds on previous work:** The AI can use the components it just created.
* **Clear Zeplin references:** Ensures each piece is based on the correct design.

### Strategies to deal with context window limitations

When dealing with complex Zeplin screens or components with many variants and layers, the amount of design data fetched can sometimes be extensive. This can potentially exceed the context window limitations of the AI model you are using, leading to truncated information or less effective code generation. Here are several strategies to manage the amount of information sent to the model:

1.  **Limit Screen Variants (`includeVariants: false`):**
    *   **How it works:** When using the `get_screen` tool, the model can be instructed to fetch only the specific screen version linked in the URL, rather than all its variants (e.g., different states, sizes, themes). This is done by setting the `includeVariants` parameter to `false` during the tool call.
    *   **When to use:** If your prompt is focused on a single specific version of a screen, or if the variants are not immediately relevant to the task at hand. This significantly reduces the amount of data related to variant properties and their respective layer structures.
    *   **Example Prompt Hint:** "Implement the login form from this screen: `https://zpl.io/abc123X`. I only need the specific version linked, not all its variants."
        *The AI agent, when calling `get_screen`, should then ideally use `includeVariants: false`.*

2.  **Focus on Specific Layers/Components (`targetLayerName` or Targeted Prompts):**
    *   **How it works (using `targetLayerName`):** The `get_screen` tool has a `targetLayerName` parameter. If the model can identify a specific layer name from your prompt (e.g., "the 'Submit Button'"), it can use this parameter. The server will then return data primarily for that layer and its children, rather than the entire screen's layer tree.
    *   **How it works (Targeted Prompts):** Even without explicitly using `targetLayerName` in the tool call, very specific prompts can guide the model to internally prioritize or summarize information related to the mentioned element.
    *   **When to use:** When your task involves a specific part of a larger screen, like a single button, an icon, or a text block.
    *   **Example Prompt:** "Focus on the 'UserProfileHeader' component within this screen: `https://zpl.io/screenXYZ`. I need to implement its layout and text styles."
        *If the AI uses `get_screen`, it could populate `targetLayerName: "UserProfileHeader"`.*

3.  **Iterative, Component-First Implementation:**
    *   **How it works:** As detailed in [Example Prompt 2: Complex Implementations (Component-First)](#example-prompt-2-complex-implementations-component-first), break down the implementation of a complex screen into smaller, component-sized tasks.
    *   **When to use:** For any non-trivial screen. This approach naturally limits the scope of each `get_component` or `get_screen` call to a manageable size.
    *   **Benefit:** Each request to the Zeplin MCP server will fetch a smaller, more focused dataset, making it easier to stay within context limits and allowing the model to concentrate on one piece at a time.