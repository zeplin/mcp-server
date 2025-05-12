#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Configuration, ZeplinApi, type Component, type Layer } from "@zeplin/sdk";
import { z } from "zod";

import { preProcess, resolveUrl } from "./util.js";

const COMPONENT_URL_PATTERN =
    /^https:\/\/app\.zeplin\.io\/styleguide\/([^\/]+)\/component\/([^\/]+)/;
const SCREEN_URL_PATTERN =
    /^https:\/\/app\.zeplin\.io\/project\/([^\/]+)\/screen\/([^\/]+)/;

    const INSTRUCTIONS = `**Role:** You are an expert front-end developer tasked with generating code from a design specification provided as structured data.

    **Goal:** Generate clean, maintainable, and accurate [Specify Target Framework/Language, e.g., React with Tailwind CSS / SwiftUI / HTML & CSS] code based on the provided **design specification (which could be a Zeplin Component or a Zeplin Screen)**.

    **Inputs:**
    1.  **Design Data (JSON):** This structured data represents either a Zeplin Component or a Zeplin Screen.
        *   For **Screens**, it typically includes an overall screen name, variants (if any), screen-level annotations, and a list of layers for each variant.
        *   For **Components**, it includes the component's name, its variants (each with potential \`props\` like \`variantProperties\` and \`layers\`), or a single component structure with its layers.
        *   Use this JSON for specific details: text \`content\`, \`component_name\` for identifying sub-components/instances, explicit color/typography values (to be mapped to tokens), layer structure, and \`annotations\`.

    **Core Instructions:**

    1.  **Determine Input Type:**
        *   First, analyze the top-level structure of the provided JSON. Determine if it represents a **Zeplin Component definition** (e.g., the JSON might have a top-level \`component\` object, or a \`name\` and \`variants\` array where variants have \`props\` or \`variantProperties\`) or a **Zeplin Screen definition** (e.g., the JSON describes a screen with its own \`name\`, \`variants\`, \`layers\`, and \`annotations\`).

    2.  **If the Input is a Zeplin Component Definition:**
        *   Your primary goal is to generate the code that **defines this component**.
        *   The component definition should accept parameters/props based on any \`props\` or \`variantProperties\` found in the JSON for the component or its variants.
        *   If multiple \`variants\` are detailed for the component, the generated code should allow the component to render these different states, typically controlled via its props.
        *   The internal structure of the component will be derived from its \`layers\` (see "Processing Layers" below).

    3.  **Processing Layers (applies when rendering a Screen OR defining the internal structure of a Component):**
        *   When iterating through the \`layers\` array found in the JSON (whether for a screen or for a component you are defining):
            *   **a. Component Instance Prioritization:**
                *   If a layer in the JSON has a \`component_name\` field, this indicates an instance of another component. **Strictly prioritize** using an existing component from the (optional) provided codebase context that matches this \`component_name\`.
                *   Extract necessary props for this component instance from its text content, styling, or nested layers.
                *   **Do NOT** generate new code for the children/internal structure of this identified component instance; assume the referenced component encapsulates that.
                *   If a matching component is not found in the codebase context, clearly note this (e.g., in comments) and generate a plausible placeholder or a basic structure based on its layer data.
            *   **b. Layout & Positioning:**
                *   Derive layout and structure primarily from the **Layer Data JSON**.
                *   Use flexible layout techniques ([e.g., Flexbox, Grid, StackViews, AutoLayout]) appropriate for the target framework.
                *   **Avoid hardcoding pixel dimensions or absolute positions.** Use relative units, spacing tokens, or layout containers that adapt. Layer \`rect\` data in the JSON is a guide, not a rigid spec.
            *   **c. Styling:**
                *   **Design Tokens First:** Before using raw color (e.g., \`#FFC738\`) or typography values (e.g., \`font-size: 16px\`), **always** attempt to map them to existing design tokens or variables (e.g., \`colors.primary\`, \`typography.heading\`, \`spacing.medium\`) potentially provided in the codebase context or inferred from common naming schemes.
                *   If no matching token is found, use the specific value from the JSON but add a comment indicating a potential token is missing (e.g., \`// TODO: Use design token for color #F69833\`).
            *   **d. Content & Assets:**
                *   Use exact text \`content\` provided in the JSON data for labels, headings, paragraphs, etc.
                *   For images or icons identified in the JSON (e.g., via \`layer_name\` or \`component_name\` like "Omlet logo", "GitHub logo"), first search for them in the codebase and use them if they already exist. If not, generate the appropriate tag (e.g., \`<img>\`, \`IconComponent\`) using the asset name or identifier.

    4.  **Annotations:**
        *   If the JSON includes an \`annotations\` field (either at the screen level or potentially associated with layers if the pre-processing step adds them there), treat its contents as **critical overrides or specific instructions** that MUST be followed, potentially contradicting other layers or visual representation.

    5.  **Code Conventions & Brevity:**
        *   Follow existing naming conventions (variables, functions) if codebase context is provided. Otherwise, use clear, descriptive names.
        *   Be concise. Omit default HTML/CSS/framework attributes or styles. Generate only the necessary code to represent the design elements. Do not include boilerplate unless explicitly part of the component structure.

    6.  **Output Format:**
        *   Generate code for [Specify Target: e.g., a single React functional component, a SwiftUI View struct, a block of HTML with associated CSS].
        *   If the input JSON was identified as a Zeplin Component definition, the output should be the code that **defines that component**, making it usable and configurable based on its properties and variants.
        *   If the input JSON was identified as a Zeplin Screen definition, the output should represent the **entire screen**, likely as a larger component or a composition of elements and other (potentially imported) components.
        *   Ensure the code is well-formatted and syntactically correct.

    **Constraint:** Only use information present in the provided Design Data JSON, and any explicitly provided codebase context. Do not invent features or functionality not represented in the inputs.

    **Now, analyze the provided Design Data (JSON), and generate the code according to these instructions.**`;

/**
 * Fetches and processes screen data from Zeplin
 * @param url The resolved Zeplin screen URL
 * @returns Formatted response object with screen data or error message
 */
export async function getScreenData(url: string) {
    const match = url.match(SCREEN_URL_PATTERN);
    if (!match) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Screen link is not valid — here's the expected format: https://app.zeplin.io/project/{projectId}/screen/{screenId}",
                },
            ],
            isError: true,
        };
    }

    const [_, projectId, screenId] = match;

    const screenResponse = await api.screens.getScreen(projectId, screenId);
    const screen = screenResponse.data;

    let name: string;
    let screenIds, variantNames: string[];
    if (screen.variant) {
        const variantGroupId = screen.variant.group.id;

        const variantGroupResponse = await api.screens.getScreenVariant(
            projectId,
            variantGroupId,
        );

        const variantGroup = variantGroupResponse.data;

        name = variantGroup.name;
        screenIds = variantGroup.variants
            .map((variant) => variant.screenId)
            .filter((id): id is string => id !== undefined);
        variantNames = variantGroup.variants
            .map((variant) => variant.value)
            .filter((name): name is string => name !== undefined);
    } else {
        name = screen.name || 'Unnamed Screen';
        screenIds = [screenId];
        variantNames = [screen.name || 'Unnamed Screen'];
    }

    const screenVersionResponses = await Promise.all(
        screenIds.map(async (screenId) => {
            const response = await api.screens.getLatestScreenVersion(projectId, screenId);
            const processedData = preProcess(response.data);
            return {
                ...response,
                data: processedData as typeof response.data
            };
        }),
    );

    const screenAnnotationsResponse = await Promise.all(
        screenIds.map((screenId) =>
            api.screens.getScreenAnnotations(projectId, screenId),
        ),
    );

    const screenAnnotations = screenAnnotationsResponse.map(
        (response, index) => {
            const screenAnnotations = response.data;
            const screenVersion = screenVersionResponses[index];

            return screenAnnotations.map((annotation) => ({
                type: annotation.type.name,
                text: annotation.content,
                position: {
                    x: annotation.position.x * screenVersion.data.width,
                    y: annotation.position.y * screenVersion.data.height,
                },
            }));
        },
    );

    const variants = screenVersionResponses.map((response, index) => {
        const screenVersion = response.data;

        return {
            name: variantNames[index],
            annotations: screenAnnotations[index],
            layers: screenVersion.layers,
        };
    });


    const response = {
        name,
        variants,
    };

    return {
        content: [
            {
                type: "text" as const,
                text: `${INSTRUCTIONS}

                Screen data in JSON format:

                ${JSON.stringify(response, null, 2)}`,
            },
        ],
    };
}


/**
 * Fetches and processes component data from Zeplin
 * @param url The resolved Zeplin component URL
 * @returns Formatted response object with component data or error message
 */
async function getComponentData(url: string) {
    const match = url.match(COMPONENT_URL_PATTERN);
    if (!match) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Component link is not valid — here's the expected format: https://app.zeplin.io/styleguide/{styleguideId}/component/{componentId}",
                },
            ],
            isError: true,
        };
    }

    const [_, styleguideId, componentId] = match;
    const componentResponse = await api.components.getStyleguideComponent(
        styleguideId,
        componentId,
        { includeLatestVersion: true },
    );

    const component = componentResponse.data;
    const sectionId = component.section?.id;
    if (!sectionId) {
        // if no section id is found, return the component data directly
        const response = {
            component
        }
        return {
            content: [
                {
                    type: "text" as const,
                    text: `${INSTRUCTIONS}

                    Component data in JSON format:
                    ${JSON.stringify(response, null, 2)}`,
                },
            ],
        };
    }

    const sectionsResponse =
        await api.components.getStyleguideComponentSections(styleguideId);

    const sections = sectionsResponse.data;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Fetching component details failed, try again in a little while.",
                },
            ],
            isError: true,
        };
    }

    const sectionComponentsResponse =
        await api.components.getStyleguideComponents(styleguideId, {
            sectionId,
            includeLatestVersion: true,
        });

    const sectionComponents = sectionComponentsResponse.data;

    const response = {
        name: section.name,
        variants: sectionComponents.map((component) => ({
            name: component.name,
            props: component.variantProperties?.map((property) => ({
                name: property.name,
                value: property.value,
            })),
            layers: component.latestVersion?.layers,
        })),
    };

    return {
        content: [
            {
                type: "text" as const,
                text: `${INSTRUCTIONS}

                Component data in JSON format:
                ${JSON.stringify(response, null, 2)}`,
            },
        ],
    };
}


const server = new McpServer({
    name: "Zeplin MCP Server",
    version: "0.1.0",
});

const api = new ZeplinApi(
    new Configuration({ accessToken: process.env.ZEPLIN_ACCESS_TOKEN }),
);

server.tool(
    "get-component",
    "Get design data of a component in Zeplin.",
    {
        url: z.string().url(),
    },
    async ({ url }) => {
        const resolvedUrl = await resolveUrl(url.trim());
        return await getComponentData(resolvedUrl);
    },
);

server.tool(
    "get-screen",
    "Get design data of a screen in Zeplin. ",
    {
        url: z.string().url(),
    },
    async ({ url }) => {
        const resolvedUrl = await resolveUrl(url.trim());
        return await getScreenData(resolvedUrl);
    },
);

try {
    const transport = new StdioServerTransport();

    await server.connect(transport);
} catch (error) {
    console.error(error);

    process.exit(1);
}