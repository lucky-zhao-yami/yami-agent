import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.OPENPROJECT_URL || "https://openproject.example.com";
const API_KEY = process.env.OPENPROJECT_API_KEY || "";

async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}/api/v3${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`apikey:${API_KEY}`).toString("base64")}`,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

const server = new Server(
  { name: "openproject-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "列出所有项目",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_work_packages",
      description: "获取工作包(需求)列表，支持按项目和状态筛选",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "项目ID或标识符" },
          status: { type: "string", description: "状态筛选(如: open, closed)" },
          type: { type: "string", description: "类型筛选(如: Task, Feature, Bug)" },
          pageSize: { type: "number", description: "每页数量，默认20" },
        },
      },
    },
    {
      name: "get_work_package",
      description: "获取单个工作包详情",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number", description: "工作包ID" } },
        required: ["id"],
      },
    },
    {
      name: "search_work_packages",
      description: "搜索工作包",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          projectId: { type: "string", description: "限定项目" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_relations",
      description: "获取工作包的关系(父子、阻塞、关联等)",
      inputSchema: {
        type: "object",
        properties: { workPackageId: { type: "number", description: "工作包ID" } },
        required: ["workPackageId"],
      },
    },
    {
      name: "get_children",
      description: "获取工作包的子任务",
      inputSchema: {
        type: "object",
        properties: { parentId: { type: "number", description: "父工作包ID" } },
        required: ["parentId"],
      },
    },
    {
      name: "create_work_package",
      description: "创建新的工作包(任务/需求/Bug等)",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "项目ID或标识符" },
          subject: { type: "string", description: "标题" },
          type: { type: "string", description: "类型(如: Task, Feature, Bug)" },
          description: { type: "string", description: "描述(支持Markdown)" },
          assigneeId: { type: "number", description: "指派人ID" },
          parentId: { type: "number", description: "父工作包ID" },
          startDate: { type: "string", description: "开始日期(YYYY-MM-DD)" },
          dueDate: { type: "string", description: "截止日期(YYYY-MM-DD)" },
        },
        required: ["projectId", "subject"],
      },
    },
    {
      name: "update_work_package",
      description: "更新工作包",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "工作包ID" },
          subject: { type: "string", description: "标题" },
          description: { type: "string", description: "描述" },
          statusId: { type: "number", description: "状态ID" },
          assigneeId: { type: "number", description: "指派人ID" },
          startDate: { type: "string", description: "开始日期(YYYY-MM-DD)" },
          dueDate: { type: "string", description: "截止日期(YYYY-MM-DD)" },
        },
        required: ["id"],
      },
    },
    {
      name: "add_comment",
      description: "给工作包添加评论",
      inputSchema: {
        type: "object",
        properties: {
          workPackageId: { type: "number", description: "工作包ID" },
          comment: { type: "string", description: "评论内容(支持Markdown)" },
        },
        required: ["workPackageId", "comment"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case "list_projects":
        result = await apiRequest("/projects");
        break;

      case "get_work_packages": {
        const filters = [];
        if (args.projectId) filters.push({ project: { operator: "=", values: [args.projectId] } });
        if (args.status) filters.push({ status: { operator: "=", values: [args.status] } });
        if (args.type) filters.push({ type: { operator: "=", values: [args.type] } });
        const params = new URLSearchParams();
        if (filters.length) params.set("filters", JSON.stringify(filters));
        params.set("pageSize", String(args.pageSize || 20));
        result = await apiRequest(`/work_packages?${params}`);
        break;
      }

      case "get_work_package":
        result = await apiRequest(`/work_packages/${args.id}`);
        break;

      case "search_work_packages": {
        const filters = [{ subjectOrId: { operator: "**", values: [args.query] } }];
        if (args.projectId) filters.push({ project: { operator: "=", values: [args.projectId] } });
        result = await apiRequest(`/work_packages?filters=${encodeURIComponent(JSON.stringify(filters))}`);
        break;
      }

      case "get_relations":
        result = await apiRequest(`/work_packages/${args.workPackageId}/relations`);
        break;

      case "get_children": {
        const filters = [{ parent: { operator: "=", values: [String(args.parentId)] } }];
        result = await apiRequest(`/work_packages?filters=${encodeURIComponent(JSON.stringify(filters))}`);
        break;
      }

      case "create_work_package": {
        const body = {
          subject: args.subject,
          _links: {
            project: { href: `/api/v3/projects/${args.projectId}` },
          },
        };
        if (args.type) body._links.type = { href: `/api/v3/types/${args.type}` };
        if (args.description) body.description = { raw: args.description };
        if (args.assigneeId) body._links.assignee = { href: `/api/v3/users/${args.assigneeId}` };
        if (args.parentId) body._links.parent = { href: `/api/v3/work_packages/${args.parentId}` };
        if (args.startDate) body.startDate = args.startDate;
        if (args.dueDate) body.dueDate = args.dueDate;
        result = await apiRequest(`/projects/${args.projectId}/work_packages`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      }

      case "update_work_package": {
        const current = await apiRequest(`/work_packages/${args.id}`);
        const body = { lockVersion: current.lockVersion };
        if (args.subject) body.subject = args.subject;
        if (args.description) body.description = { raw: args.description };
        if (args.startDate) body.startDate = args.startDate;
        if (args.dueDate) body.dueDate = args.dueDate;
        body._links = {};
        if (args.statusId) body._links.status = { href: `/api/v3/statuses/${args.statusId}` };
        if (args.assigneeId) body._links.assignee = { href: `/api/v3/users/${args.assigneeId}` };
        result = await apiRequest(`/work_packages/${args.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        break;
      }

      case "add_comment": {
        const body = { comment: { raw: args.comment } };
        result = await apiRequest(`/work_packages/${args.workPackageId}/activities`, {
          method: "POST",
          body: JSON.stringify(body),
        });
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
