# Zeplin MCP Server for AI-Assisted UI Implementation

This project implements a Model Context Protocol (MCP) server designed to assist developers in implementing UI screens and components directly from Zeplin designs. By providing Zeplin shortlinks (e.g., `https://zpl.io/...`) in your prompts to AI agents, this server fetches the necessary design specifications and asset details, enabling the models to generate corresponding code for your target framework.

The primary goal is to streamline the developer workflow by bridging the gap between design specifications in Zeplin and actual code implementation.

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

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/zeplin/zeplin-mcp.git
    ```

2.  **Install dependencies:**
    Using npm:
    ```bash
    npm install
    ```

3.  **Build the project:**
    The TypeScript code needs to be compiled to JavaScript. Assuming you have a build script in your `package.json` (e.g., `tsc` or `esbuild`):
    ```bash
    npm run build
    ```

    This will typically create a `dist` directory with the compiled JavaScript files (e.g., `dist/index.js`).

## Configuration

Create a `.env` file in the root directory of the project with the following content:

```bash
ZEPLIN_ACCESS_TOKEN=your_zeplin_personal_access_token
```

Replace `your_zeplin_personal_access_token` with your actual Zeplin Personal Access Token.

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

### Code Style and Linting

This project uses ESLint to enforce code quality and consistency. The configuration is in `eslint.config.js`. Key style guidelines include:

- 2 space indentation
- Double quotes for strings
- Semicolons required
- No trailing spaces
- Organized imports

When contributing to this project, please ensure your code follows these guidelines by running `npm run lint:fix` before submitting changes.

## Usage with MCP Clients (e.g., Cursor)

To integrate this server with an MCP client like Cursor, you need to configure the client to connect to this server. Add the following to Cursor's `settings.json` (accessible via `Cmd/Ctrl + Shift + P` -> "Configure Language Specific Settings..." -> "JSON") or a similar configuration file for MCP providers:

```jsonc
// In your MCP client's configuration (e.g., Cursor's settings.json)
{
  // ... other configurations
  "mcpServers": {
    // ... other providers
    "zeplin-mcp": {
      "command": "node",
      "args": [
        "/path/to/your/zeplin-mcp/dist/index.js" // IMPORTANT: Update this path
      ],
      "env": {
        "ZEPLIN_ACCESS_TOKEN": "<YOUR_ZEPLIN_PERSONAL_ACCESS_TOKEN>" // IMPORTANT: Replace with your actual token
      }
    }
    // ...
  }
  // ...
}
```

**Important:**
*   Replace `"/path/to/your/zeplin-mcp/dist/index.js"` with the **absolute path** to the compiled `index.js` file in your `zeplin-mcp` project directory.
*   Replace `<YOUR_ZEPLIN_PERSONAL_ACCESS_TOKEN>` with your actual Zeplin PAT.

## Crafting Effective Prompts

The quality and specificity of your prompts significantly impact the AI's ability to generate accurate and useful code. These are not mandatory but will increase the output quality. Here are some examples to guide you:

### Example Prompt 1: Minor Changes/Additions

When you need to implement a small update or addition to an existing screen or component based on a new Zeplin design version.

```
The latest design for the following screen includes a new addition: a Checkbox component has been added to the MenuItem component, here is the short url of the screen <zeplin short url of the screen, e.g., https://zpl.io/abc123X>.

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