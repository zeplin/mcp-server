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

const INSTRUCTIONS = `**Role:** You are an expert front-end developer tasked with generating code from a design specification provided as structured layer data.

**Goal:** Generate clean, maintainable, and accurate [Specify Target Framework/Language, e.g., React with Tailwind CSS / SwiftUI / HTML & CSS] code based on the provided screen design.

**Inputs:**
1.  **Processed Layer Data (JSON):** Use this for specific details like text content, component identification, explicit color/typography values (to be mapped to tokens), and annotations.

**Core Instructions:**

1.  **Component Prioritization:**
    *   If a layer in the JSON has a \`component_name\` field, **strictly prioritize** using an existing component from the codebase matching that name.
    *   Extract necessary props for the component from its text content, styling, or nested layers (if not pruned during pre-processing).
    *   **Do NOT** generate code for the children of an identified component; assume the component encapsulates that structure. If a component is not found in the (optional) provided codebase context, note it clearly and generate a plausible structure based on its layer data.
2.  **Layout & Positioning:**
    *   Derive layout and structure primarily from the **Layer Data JSON**.
    *   Use flexible layout techniques ([e.g., Flexbox, Grid, StackViews, AutoLayout]) appropriate for the target framework.
    *   **Avoid hardcoding pixel dimensions or absolute positions.** Use relative units, spacing tokens, or layout containers that adapt. Layer \`rect\` data in the JSON is a guide, not a rigid spec.
3.  **Styling:**
    *   **Design Tokens First:** Before using raw color (e.g., \`#FFC738\`) or typography values (e.g., \`font-size: 16px\`), **always** attempt to map them to existing design tokens or variables (e.g., \`colors.primary\`, \`typography.heading\`, \`spacing.medium\`) potentially provided in the codebase context or inferred from common naming schemes.
    *   If no matching token is found, use the specific value from the JSON but add a comment indicating a potential token is missing (e.g., \`// TODO: Use design token for color #F69833\`).
4.  **Content & Assets:**
    *   Use exact text \`content\` provided in the JSON data for labels, headings, paragraphs, etc.
    *   For images or icons identified in the JSON (e.g., via \`layer_name\` or \`component_name\` like "Omlet logo", "GitHub logo"), first search for them in the codebase and use them if they already exist. If not generate the appropriate tag (e.g., \`<img>\`, \`IconComponent\`) using the asset name or identifier.
5.  **Annotations:**
    *   If the JSON includes an \`annotations\` field (or similar mechanism if you adapt the format), treat its contents as **critical overrides or specific instructions** that MUST be followed, potentially contradicting other layers or visual representation.
6.  **Code Conventions & Brevity:**
    *   Follow existing naming conventions (variables, functions) if codebase context is provided. Otherwise, use clear, descriptive names.
    *   Be concise. Omit default HTML/CSS/framework attributes or styles. Generate only the necessary code to represent the design elements. Do not include boilerplate unless explicitly part of the component structure.
7.  **Output Format:**
    *   Generate code for [Specify Target: e.g., a single React functional component, a SwiftUI View struct, a block of HTML with associated CSS].
    *   Ensure the code is well-formatted and syntactically correct.

**Constraint:** Only use information present in the provided Layer Data JSON, and any explicitly provided codebase context. Do not invent features or functionality not represented in the inputs.

**Now, analyze the provided Layer Data, and generate the code according to these instructions.**`;

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