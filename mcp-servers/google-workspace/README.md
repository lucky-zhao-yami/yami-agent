# mcp-google-workspace

Google Workspace MCP Server — provides Google Docs, Drive, and Slides tools via MCP protocol.

## Setup

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Desktop app type)
2. Download the client secrets JSON
3. Set environment variables:

```bash
export CREDENTIALS_PATH=/path/to/credentials.json
export TOKEN_PATH=/path/to/token.json
```

4. Install and run:

```bash
# Direct run
python server.py

# Or via uvx
uvx mcp-google-workspace
```

On first run, a browser window opens for OAuth consent. The token is saved to `TOKEN_PATH`.

## Required Scopes

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/presentations`
- `https://www.googleapis.com/auth/spreadsheets`

## Tools

### Google Docs

| Tool | Description |
|------|-------------|
| `create_doc` | Create a Google Doc with optional content and folder |
| `read_doc` | Read plain text content from a Doc |
| `update_doc` | Replace all content in a Doc |
| `append_to_doc` | Append text to end of a Doc |

### Google Drive

| Tool | Description |
|------|-------------|
| `list_files` | List files, optionally filtered by folder or query |
| `create_folder` | Create a folder |
| `move_file` | Move a file to a different folder |
| `share_file` | Share a file with a user |
| `get_file_info` | Get file metadata |
| `delete_file` | Move a file to trash |

### Google Slides

| Tool | Description |
|------|-------------|
| `create_presentation` | Create a blank presentation |
| `read_presentation` | Read text from all slides |

## MCP Client Config

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "uvx",
      "args": ["--from", "/path/to/google-workspace", "mcp-google-workspace"],
      "env": {
        "CREDENTIALS_PATH": "/path/to/credentials.json",
        "TOKEN_PATH": "/path/to/token.json"
      }
    }
  }
}
```
