# AI GitHub Knowledge Base Manager

Manage local AI repository knowledge base and provide intelligent AI tool/product suggestions based on repository analysis.

## Purpose

This skill enables Claude Code to:
- Manage a local knowledge base of AI-related GitHub repositories
- Research and understand the architecture and implementation of AI projects
- Provide technical selection advice based on user's AI ideas
- Suggest implementation approaches by combining multiple repositories
- Help users build their own AI tools/products based on existing projects

## Capabilities

### Repository Management
- **Clone repositories** to knowledge base directory (`~/github` by default)
- **Search GitHub** for AI-related repositories
- **Update repositories** to latest code
- **Maintain catalog** in CLAUDE.md with structured information

### Intelligent Analysis
- **Study repository architecture** and implementation details
- **Compare multiple repositories** to identify strengths and weaknesses
- **Analyze tech stacks** and use cases
- **Extract best practices** from AI projects

### Product Advisory
- **Match repositories** to user's AI ideas
- **Provide technical selection** recommendations
- **Design implementation** approaches
- **Suggest productization** strategies

## Usage Examples

### Add Repository to Knowledge Base
```
Clone the open-interpreter repository to my knowledge base
```

Claude will:
1. Clone to `~/github/open-interpreter`
2. Read README and key files
3. Update CLAUDE.md with structured info
4. Confirm completion

### Research AI Projects
```
Analyze the architecture of clawdbot and opencode
Compare their approaches to AI agent design
```

Claude will:
1. Study code structure and implementation
2. Identify key architectural patterns
3. Compare strengths and weaknesses
4. Provide insights and recommendations

### Get AI Tool Suggestions
```
I want to build an AI tool that analyzes my entire codebase
and generates optimization suggestions.
Based on my knowledge base, what's your recommendation?
```

Claude will:
1. Match relevant repositories (e.g., opencode, langchain)
2. Analyze tech stack compatibility
3. Design technical architecture
4. Provide implementation steps
5. Suggest productization approach

### Technical Selection
```
I want to create a ChatGPT-like web application
with streaming and function calling.
Which repositories should I use?
```

Claude will recommend repositories and explain:
- Why each repository is relevant
- How to combine them
- Technical stack considerations
- Implementation roadmap

## Knowledge Base Structure

Repositories are organized in CLAUDE.md by category:

- **AI & Assistants**: AI assistants, chatbots
- **AI Coding Agents**: AI coding agents, code generation
- **LLM Frameworks**: LLM frameworks, RAG tools
- **Development & Deployment Tools**: Development/deployment tools

Each repository entry includes:
- Project name and path
- One-line description
- Core tech stack
- Applicable scenarios

## Configuration

### Knowledge Base Directory

Default: `~/github`

To change, edit CLAUDE.md:
```markdown
默认克隆路径：`/your/custom/path`
```

### Add New Repository

When adding a repository, Claude will:
1. Clone to knowledge base directory
2. Analyze README and key files
3. Add entry to CLAUDE.md:
```markdown
### [project-name](/project-path)
Brief description.
核心技术栈：Tech1, Tech2
适用场景：Scenario1, Scenario2
```

## Catalog Update Rules (for Claude)

1. **Format**: Follow "Category → Project → Description → Tech Stack → Use Cases"
2. **Categories**: AI Assistants / AI Coding Agents / LLM Frameworks / Dev Tools
3. **Updates**: Regularly pull latest code and sync README info
4. **Queries**: Match repositories to user ideas, provide technical selection and implementation advice

## Requirements

- `gh` CLI tool
- Authenticated GitHub account
- Knowledge base directory configured

## Recommended Initial Repositories

```bash
cd ~/github

# AI Assistants
gh repo clone Clawd/clawdbot

# AI Coding Agents
gh repo clone openinterpreter/opencode
gh repo clone openai/open-interpreter

# LLM Frameworks
gh repo clone langchain-ai/langchain

# Local LLM
gh repo clone ggerganov/llama.cpp
```

## Workflow

### For Adding New Repository
1. User requests to clone a repository
2. **Clone to KB directory**: `gh repo clone <repo> ~/github/<name>`
3. **Analyze project**: Read README, package.json, key source files
4. **Update CLAUDE.md**: Add structured entry following format
5. **Confirm**: Tell user repo location and key findings

### For Providing AI Tool Suggestions
1. User describes AI idea/requirement
2. **Search knowledge base**: Match relevant repositories
3. **Analyze tech stacks**: Understand capabilities and constraints
4. **Design solution**: Combine repositories effectively
5. **Provide recommendations**:
   - Technical selection (which repos to use)
   - Architecture design (how to combine them)
   - Implementation steps (how to build)
   - Productization advice (how to ship)

## Default Clone Location

If user says "clone X" without specifying directory, default to `~/github`.
