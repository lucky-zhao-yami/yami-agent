import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.ZENTAO_URL || "https://bugs.yamibuy.tech";
const USERNAME = process.env.ZENTAO_USERNAME || "";
const PASSWORD = process.env.ZENTAO_PASSWORD || "";

let sessionId = null;

async function login() {
  const url = `${BASE_URL}/api.php/v1/tokens`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  sessionId = data.token;
  return sessionId;
}

async function apiRequest(endpoint, options = {}) {
  if (!sessionId) await login();
  const url = `${BASE_URL}/api.php/v1${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    Token: sessionId,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    sessionId = null;
    await login();
    return apiRequest(endpoint, options);
  }
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

const server = new Server(
  { name: "zentao-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_products",
      description: "获取产品列表",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_projects",
      description: "获取项目列表",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_bugs",
      description: "获取Bug列表",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "产品ID" },
          status: {
            type: "string",
            description: "状态: all|unclosed|openedbyme|assigntome|resolvedbyme|toclosed|unresolved",
          },
          limit: { type: "number", description: "每页数量，默认20" },
          page: { type: "number", description: "页码，默认1" },
        },
      },
    },
    {
      name: "get_bug",
      description: "获取单个Bug详情",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "Bug ID" } },
        required: ["id"],
      },
    },
    {
      name: "search_bugs",
      description: "搜索Bug",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" },
          productId: { type: "number", description: "产品ID（可选）" },
        },
        required: ["keyword"],
      },
    },
    {
      name: "get_tasks",
      description: "获取任务列表",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "项目ID" },
          status: { type: "string", description: "状态: all|wait|doing|done|closed" },
          limit: { type: "number", description: "每页数量" },
        },
      },
    },
    {
      name: "get_task",
      description: "获取单个任务详情",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "任务ID" } },
        required: ["id"],
      },
    },
    {
      name: "get_my_bugs",
      description: "获取指派给我的Bug",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "每页数量，默认20" },
        },
      },
    },
    {
      name: "get_my_tasks",
      description: "获取指派给我的任务",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "每页数量，默认20" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case "list_products":
        result = await apiRequest("/products");
        break;

      case "list_projects":
        result = await apiRequest("/projects");
        break;

      case "get_bugs": {
        const params = new URLSearchParams();
        if (args.status) params.set("status", args.status);
        if (args.limit) params.set("limit", String(args.limit));
        if (args.page) params.set("page", String(args.page));
        const endpoint = args.productId
          ? `/products/${args.productId}/bugs?${params}`
          : `/bugs?${params}`;
        result = await apiRequest(endpoint);
        break;
      }

      case "get_bug":
        result = await apiRequest(`/bugs/${args.id}`);
        break;

      case "search_bugs": {
        const params = new URLSearchParams({ keyword: args.keyword });
        if (args.productId) params.set("product", String(args.productId));
        result = await apiRequest(`/bugs?${params}`);
        break;
      }

      case "get_tasks": {
        const params = new URLSearchParams();
        if (args.status) params.set("status", args.status);
        if (args.limit) params.set("limit", String(args.limit));
        const endpoint = args.projectId
          ? `/projects/${args.projectId}/tasks?${params}`
          : `/tasks?${params}`;
        result = await apiRequest(endpoint);
        break;
      }

      case "get_task":
        result = await apiRequest(`/tasks/${args.id}`);
        break;

      case "get_my_bugs": {
        const params = new URLSearchParams({ status: "assigntome" });
        if (args.limit) params.set("limit", String(args.limit));
        result = await apiRequest(`/bugs?${params}`);
        break;
      }

      case "get_my_tasks": {
        const params = new URLSearchParams({ assignedTo: "me" });
        if (args.limit) params.set("limit", String(args.limit));
        result = await apiRequest(`/tasks?${params}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
